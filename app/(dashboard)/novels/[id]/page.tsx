'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import OutlineGeneratorModal from './OutlineGeneratorModal';
import OutlineTree from '@/app/components/OutlineTree';
import {
  buildOutlinePersistencePayload,
  normalizeOutlineBlocksPayload,
  pickBestOutlineBlocks,
  type OutlinePlanningNode,
} from '@/src/shared/outline-planning';
import { pollJobUntilTerminal } from '@/app/lib/jobs/polling';
import { parseJobResponse } from '@/src/shared/jobs';
import PlotBranchingView, {
  type HookOpportunity,
  type PlotBranch,
} from '@/app/components/PlotBranchingView';
import {
  buildPlotSimulationRequest,
  getDefaultPlotSimulationControls,
  normalizePlotSimulationControls,
  normalizePlotSimulationPayload,
  type PlotSimulationControls,
} from '@/src/shared/plot-simulation';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent, 
  Button, 
  Card, 
  Badge, 
  Skeleton 
} from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ui/Modal';
import { 
  staggerContainer, 
  staggerItem, 
  fadeIn, 
  slideUp, 
  slideInRight 
} from '@/app/lib/animations';

interface ReviewFeedback {
  verdict?: 'approve' | 'minor_revision' | 'major_revision' | 'reject';
  overallScore?: number;
}

interface Chapter {
  id: string;
  title: string;
  wordCount: number;
  updatedAt: string;
  order: number;
  generationStage?: 'draft' | 'generated' | 'reviewed' | 'humanized' | 'approved';
  reviewFeedback?: ReviewFeedback;
  outlineAdherence?: number;
  lastReviewAt?: string;
}

interface ContinuityGateConfig {
  enabled: boolean;
  passScore: number;
  rejectScore: number;
  maxRepairAttempts: number;
}

interface NovelWorkflowConfig {
  continuityGate?: Partial<ContinuityGateConfig>;
  review?: {
    passThreshold?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface OutlineNode {
  id: string;
  title: string;
  content: string;
  level: 'rough' | 'detailed' | 'chapter';
  children?: OutlineNode[];
  isExpanded?: boolean;
  isGenerating?: boolean;
}

interface Novel {
  id: string;
  title: string;
  description?: string;
  type?: 'long';
  outline?: string;
  outlineRough?: { blocks: OutlineNode[] } | null;
  outlineDetailed?: { blocks: OutlineNode[] } | null;
  outlineChapters?: { blocks: OutlineNode[] } | null;
  outlineStage?: string;
  updatedAt: string;
  keywords?: string[];
  theme?: string;
  genre?: string;
  targetWords?: number;
  chapterCount?: number;
  protagonist?: string;
  worldSetting?: string;
  creativeIntent?: string;
  specialRequirements?: string;
  workflowConfig?: NovelWorkflowConfig | null;
}

interface BlockingInfo {
  hasBlocking: boolean;
  count: number;
}

interface WorkflowStats {
  unresolvedHooks: number;
  overdueHooks: number;
  pendingEntities: number;
}

const WORKFLOW_STEPS = [
  { id: 'draft', label: '草稿' },
  { id: 'generated', label: '已生成' },
  { id: 'reviewed', label: '已审查' },
  { id: 'humanized', label: '已润色' },
  { id: 'approved', label: '已定稿' },
] as const;

const OUTLINE_LEVEL_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'rough', label: '粗纲' },
  { id: 'detailed', label: '细纲' },
  { id: 'chapter', label: '章节' },
] as const;

type OutlineLevelFilter = (typeof OUTLINE_LEVEL_FILTERS)[number]['id'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = toNumber(value, fallback);
  return Math.max(0, Math.floor(parsed));
}

function resolveContinuityGateConfig(workflowConfig?: NovelWorkflowConfig | null): ContinuityGateConfig {
  const workflow = asRecord(workflowConfig);
  const review = asRecord(workflow.review);
  const continuityGate = asRecord(workflow.continuityGate);

  const reviewPassThreshold = toNumber(review.passThreshold, 6.8 + 0.6);
  const defaultPassScore = clamp(reviewPassThreshold - 0.6, 5.8, 8.2);
  const passScore = clamp(toNumber(continuityGate.passScore, defaultPassScore), 4.5, 9.5);
  const rejectScore = clamp(toNumber(continuityGate.rejectScore, 4.9), 3.5, passScore - 0.4);
  const maxRepairAttempts = clamp(toNonNegativeInt(continuityGate.maxRepairAttempts, 1), 0, 5);

  return {
    enabled: continuityGate.enabled !== false,
    passScore: Number(passScore.toFixed(2)),
    rejectScore: Number(rejectScore.toFixed(2)),
    maxRepairAttempts,
  };
}

function mergeContinuityGateConfig(
  workflowConfig: NovelWorkflowConfig | null | undefined,
  continuityGate: ContinuityGateConfig
): NovelWorkflowConfig {
  const workflow = asRecord(workflowConfig) as NovelWorkflowConfig;
  return {
    ...workflow,
    continuityGate: {
      enabled: continuityGate.enabled,
      passScore: continuityGate.passScore,
      rejectScore: continuityGate.rejectScore,
      maxRepairAttempts: continuityGate.maxRepairAttempts,
    },
  };
}

export default function NovelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'outline' | 'materials' | 'hooks' | 'entities' | 'settings' | 'plot'>('chapters');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedOutline, setEditedOutline] = useState('');
  const [editedGenre, setEditedGenre] = useState('');
  const [editedTheme, setEditedTheme] = useState('');
  const [editedProtagonist, setEditedProtagonist] = useState('');
  const [editedWorldSetting, setEditedWorldSetting] = useState('');
  const [editedCreativeIntent, setEditedCreativeIntent] = useState('');
  const [editedTargetWords, setEditedTargetWords] = useState<number>(200);
  const [editedChapterCount, setEditedChapterCount] = useState<number>(100);
  const [editedKeywords, setEditedKeywords] = useState('');
  const [editedSpecialRequirements, setEditedSpecialRequirements] = useState('');
  const [editedContinuityGateEnabled, setEditedContinuityGateEnabled] = useState(true);
  const [editedContinuityPassScore, setEditedContinuityPassScore] = useState(6.8);
  const [editedContinuityRejectScore, setEditedContinuityRejectScore] = useState(4.9);
  const [editedContinuityMaxRepairAttempts, setEditedContinuityMaxRepairAttempts] = useState(1);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOutlineGenerator, setShowOutlineGenerator] = useState(false);
  const [blockingInfo, setBlockingInfo] = useState<BlockingInfo>({ hasBlocking: false, count: 0 });
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats>({ unresolvedHooks: 0, overdueHooks: 0, pendingEntities: 0 });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  
  const [plotBranches, setPlotBranches] = useState<PlotBranch[]>([]);
  const [plotDeadEndWarnings, setPlotDeadEndWarnings] = useState<string[]>([]);
  const [plotHookOpportunities, setPlotHookOpportunities] = useState<HookOpportunity[]>([]);
  const [plotSelectedBranchId, setPlotSelectedBranchId] = useState<string | null>(null);
  const [plotBestBranchId, setPlotBestBranchId] = useState<string | null>(null);
  const [plotLastGeneratedAt, setPlotLastGeneratedAt] = useState<string | null>(null);
  const [plotSimulationControls, setPlotSimulationControls] = useState<PlotSimulationControls>(
    getDefaultPlotSimulationControls()
  );
  const [isGeneratingPlot, setIsGeneratingPlot] = useState(false);
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [regeneratingOutline, setRegeneratingOutline] = useState<'rough' | 'detailed' | 'chapters' | null>(null);
  const [continuingOutline, setContinuingOutline] = useState<'rough' | 'detailed' | 'chapters' | null>(null);
  const [outlineSelectionMode, setOutlineSelectionMode] = useState(false);
  const [selectedOutlineIds, setSelectedOutlineIds] = useState<Set<string>>(new Set());
  const [outlineLevelFilter, setOutlineLevelFilter] = useState<OutlineLevelFilter>('all');
  const [outlineSearchKeyword, setOutlineSearchKeyword] = useState('');

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: chapters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, 
    overscan: 5,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [novelRes, chaptersRes, blockingRes, hooksReportRes, entitiesRes] = await Promise.all([
          fetch(`/api/novels/${id}`),
          fetch(`/api/novels/${id}/chapters`),
          fetch(`/api/novels/${id}/pending-entities/blocking`),
          fetch(`/api/novels/${id}/hooks/report`),
          fetch(`/api/novels/${id}/pending-entities?status=pending`),
        ]);

        if (novelRes.ok) {
          const novelData = await novelRes.json();
          setNovel(novelData);
          setEditedTitle(novelData.title);
          setEditedDescription(novelData.description || '');
          setEditedOutline(novelData.outline || '');
          setEditedGenre(novelData.genre || '');
          setEditedTheme(novelData.theme || '');
          setEditedProtagonist(novelData.protagonist || '');
          setEditedWorldSetting(novelData.worldSetting || '');
          setEditedCreativeIntent(novelData.creativeIntent || '');
          setEditedTargetWords(novelData.targetWords ?? 200);
          setEditedChapterCount(novelData.chapterCount ?? 100);
          setEditedKeywords(novelData.keywords?.join(', ') || '');
          setEditedSpecialRequirements(novelData.specialRequirements || '');
          const continuityConfig = resolveContinuityGateConfig(novelData.workflowConfig);
          setEditedContinuityGateEnabled(continuityConfig.enabled);
          setEditedContinuityPassScore(continuityConfig.passScore);
          setEditedContinuityRejectScore(continuityConfig.rejectScore);
          setEditedContinuityMaxRepairAttempts(continuityConfig.maxRepairAttempts);

          const bestBlocks = pickBestOutlineBlocks({
            outlineChapters: novelData.outlineChapters,
            outlineDetailed: novelData.outlineDetailed,
            outlineRough: novelData.outlineRough,
          });
          setOutlineNodes(bestBlocks as OutlineNode[]);
        }
        
        if (chaptersRes.ok) {
          const chaptersData = await chaptersRes.json();
          setChapters(chaptersData.chapters || []);
        }

        if (blockingRes.ok) {
          const blockingData = await blockingRes.json();
          setBlockingInfo({ hasBlocking: blockingData.hasBlocking, count: blockingData.count });
        }

        if (hooksReportRes.ok) {
          const hooksData = await hooksReportRes.json();
          setWorkflowStats(prev => ({
            ...prev,
            unresolvedHooks: hooksData.stats?.unresolvedCount || 0,
            overdueHooks: hooksData.stats?.overdueCount || 0,
          }));
        }

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          setWorkflowStats(prev => ({
            ...prev,
            pendingEntities: entitiesData.entities?.length || 0,
          }));
        }

      } catch (error) {
        console.error('Failed to fetch novel details', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleUpdateTitle = async () => {
    if (!editedTitle.trim() || editedTitle === novel?.title) {
      setIsEditingTitle(false);
      setEditedTitle(novel?.title || '');
      return;
    }

    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle }),
      });

      if (res.ok) {
        setNovel(prev => prev ? { ...prev, title: editedTitle } : null);
      } else {
        setError('更新标题失败');
      }
    } catch {
      setError('更新标题失败，请重试');
    }
    setIsEditingTitle(false);
  };

  const handleUpdateDescription = async () => {
    if (editedDescription === (novel?.description || '')) return;

    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editedDescription }),
      });

      if (!res.ok) {
        setError('更新简介失败');
      } else {
        setNovel(prev => prev ? { ...prev, description: editedDescription } : null);
      }
    } catch {
      setError('更新简介失败，请重试');
    }
  };

  const handleSaveSettings = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    
    try {
      const keywordsArray = editedKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      const normalizedPassScore = Number(
        clamp(toNumber(editedContinuityPassScore, 6.8), 4.5, 9.5).toFixed(2)
      );
      const normalizedRejectScore = Number(
        clamp(toNumber(editedContinuityRejectScore, 4.9), 3.5, normalizedPassScore - 0.4).toFixed(2)
      );
      const normalizedMaxRepairAttempts = clamp(
        toNonNegativeInt(editedContinuityMaxRepairAttempts, 1),
        0,
        5
      );
      const continuityGatePayload: ContinuityGateConfig = {
        enabled: editedContinuityGateEnabled,
        passScore: normalizedPassScore,
        rejectScore: normalizedRejectScore,
        maxRepairAttempts: normalizedMaxRepairAttempts,
      };
      
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle,
          description: editedDescription,
          genre: editedGenre,
          theme: editedTheme,
          protagonist: editedProtagonist,
          worldSetting: editedWorldSetting,
          creativeIntent: editedCreativeIntent,
          targetWords: editedTargetWords,
          chapterCount: editedChapterCount,
          keywords: keywordsArray,
          specialRequirements: editedSpecialRequirements,
          workflowConfig: {
            continuityGate: continuityGatePayload,
          },
        }),
      });

      if (res.ok) {
        setEditedContinuityPassScore(normalizedPassScore);
        setEditedContinuityRejectScore(normalizedRejectScore);
        setEditedContinuityMaxRepairAttempts(normalizedMaxRepairAttempts);
        setNovel(prev => prev ? {
          ...prev,
          title: editedTitle,
          description: editedDescription,
          genre: editedGenre,
          theme: editedTheme,
          protagonist: editedProtagonist,
          worldSetting: editedWorldSetting,
          creativeIntent: editedCreativeIntent,
          targetWords: editedTargetWords,
          chapterCount: editedChapterCount,
          keywords: keywordsArray,
          specialRequirements: editedSpecialRequirements,
          workflowConfig: mergeContinuityGateConfig(prev.workflowConfig, continuityGatePayload),
        } : null);
      } else {
        setError('保存设置失败');
      }
    } catch {
      setError('保存设置失败，请重试');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeleteNovel = async () => {
    try {
      const res = await fetch(`/api/novels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/novels');
      } else {
        setError('删除小说失败');
      }
    } catch {
      setError('删除小说失败，请重试');
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    setConfirmState({
      isOpen: true,
      title: '删除章节',
      message: '确定要删除此章节吗？此操作不可撤销。',
      confirmText: '删除',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/novels/${id}/chapters/${chapterId}`, { method: 'DELETE' });
          if (res.ok) {
            setChapters(chapters.filter(c => c.id !== chapterId));
          } else {
            setError('删除章节失败');
          }
        } catch {
          setError('删除章节失败，请重试');
        }
      }
    });
  };

  const updatePlotSimulationControls = (
    updates: Partial<PlotSimulationControls>
  ) => {
    setPlotSimulationControls((prev) =>
      normalizePlotSimulationControls({
        ...prev,
        ...updates,
      })
    );
  };

  const handleGeneratePlot = async () => {
    setIsGeneratingPlot(true);
    try {
      const currentChapter = chapters.length > 0 ? chapters[chapters.length - 1].order + 1 : 1;
      const requestBody = buildPlotSimulationRequest(currentChapter, plotSimulationControls);

      const res = await fetch(`/api/novels/${id}/plot-simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (res.ok) {
        const data = await res.json();
        const normalized = normalizePlotSimulationPayload(data);
        setPlotBranches(normalized.branches);
        setPlotDeadEndWarnings(normalized.deadEndWarnings);
        setPlotHookOpportunities(normalized.hookOpportunities);
        setPlotBestBranchId(normalized.bestPathId);
        setPlotSelectedBranchId(normalized.bestPathId);
        setPlotLastGeneratedAt(new Date().toISOString());
      } else {
        setError('生成剧情推演失败');
      }
    } catch (e) {
      console.error(e);
      setError('生成剧情推演失败，请重试');
    } finally {
      setIsGeneratingPlot(false);
    }
  };

  const handleUpdateOutline = async () => {
    if (editedOutline === (novel?.outline || '')) return;
    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: editedOutline }),
      });
      if (res.ok) {
        setNovel(prev => prev ? { ...prev, outline: editedOutline } : null);
      } else {
        setError('更新大纲失败');
      }
    } catch {
      setError('更新大纲失败，请重试');
    }
  };

  const handleCreateChapter = async () => {
    if (novel?.type === 'long' && !novel?.outline) {
      setError('长篇小说需要先创建大纲才能添加章节');
      setActiveTab('outline');
      return;
    }
    
    if (blockingInfo.hasBlocking) {
      setError(`无法生成新章节：有 ${blockingInfo.count} 个待确认实体阻碍生成流程。请先处理待确认实体。`);
      setActiveTab('entities');
      return;
    }

    try {
      const res = await fetch(`/api/novels/${id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `第 ${chapters.length + 1} 章`,
          order: chapters.length 
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChapters([...chapters, data.chapter]);
      } else {
        setError('创建章节失败');
      }
    } catch {
      setError('创建章节失败，请重试');
    }
  };

  const safeParseJSON = (text: string) => {
    try {
      const cleanText = text.replace(/```json\n|\n```/g, '').replace(/```/g, '').trim();
      const start = cleanText.indexOf('{');
      const end = cleanText.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      return JSON.parse(cleanText.substring(start, end + 1));
    } catch (e) {
      console.error('Failed to parse JSON', e);
      return null;
    }
  };

  const collectNodeIds = (nodes: OutlineNode[]): Set<string> => {
    const ids = new Set<string>();

    const walk = (items: OutlineNode[]) => {
      items.forEach((item) => {
        if (item.id) {
          ids.add(item.id);
        }
        if (item.children?.length) {
          walk(item.children);
        }
      });
    };

    walk(nodes);
    return ids;
  };

  const toUniqueNodeId = (baseId: string, existingIds: Set<string>, fallbackPrefix: string) => {
    const normalizedBase = baseId.trim() || fallbackPrefix;
    if (!existingIds.has(normalizedBase)) {
      existingIds.add(normalizedBase);
      return normalizedBase;
    }

    let cursor = 2;
    while (existingIds.has(`${normalizedBase}-${cursor}`)) {
      cursor += 1;
    }
    const uniqueId = `${normalizedBase}-${cursor}`;
    existingIds.add(uniqueId);
    return uniqueId;
  };

  const ensureUniqueIds = (
    nodes: OutlineNode[],
    existingIds: Set<string>,
    fallbackPrefix: string
  ): OutlineNode[] => {
    return nodes.map((node, index) => {
      const base = node.id || `${fallbackPrefix}-${index + 1}`;
      const nextId = toUniqueNodeId(base, existingIds, `${fallbackPrefix}-${index + 1}`);
      return {
        ...node,
        id: nextId,
        children: node.children?.length
          ? ensureUniqueIds(node.children, existingIds, nextId)
          : node.children,
      };
    });
  };

  const forceLevel = (nodes: OutlineNode[], level: OutlineNode['level']): OutlineNode[] => {
    return nodes.map((node) => ({
      ...node,
      level,
      children: node.children?.length
        ? forceLevel(
            node.children,
            level === 'rough' ? 'detailed' : level === 'detailed' ? 'chapter' : 'chapter'
          )
        : node.children,
    }));
  };

  const parseGeneratedNodes = (raw: unknown, defaultLevel: OutlineNode['level']) => {
    const parsed = typeof raw === 'string' ? safeParseJSON(raw) : raw;
    const normalized = normalizeOutlineBlocksPayload(parsed || raw, defaultLevel).blocks;
    return normalized as OutlineNode[];
  };

  const appendNodeChildren = (targetId: string, newChildren: OutlineNode[]) => {
    setOutlineNodes((prev) => {
      const existingIds = collectNodeIds(prev);
      const normalizedChildren = ensureUniqueIds(newChildren, existingIds, `${targetId}-cont`);

      const appendRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map((node) => {
          if (node.id === targetId) {
            return {
              ...node,
              isExpanded: true,
              children: [...(node.children || []), ...normalizedChildren],
            };
          }
          if (node.children?.length) {
            return { ...node, children: appendRecursive(node.children) };
          }
          return node;
        });
      };

      return appendRecursive(prev);
    });
  };

  const runJob = async (type: string, input: Record<string, unknown>): Promise<any> => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, input }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error 
        ? (Array.isArray(errorData.error) ? errorData.error.map((e: { message?: string }) => e.message).join(', ') : String(errorData.error))
        : '生成失败';
      throw new Error(errorMsg);
    }
    const payload = await res.json();
    const job = parseJobResponse(payload);
    if (!job) {
      throw new Error('任务创建失败：返回数据异常');
    }

    return pollJobUntilTerminal<any>(job.id, {
      intervalMs: 2000,
      maxAttempts: 300,
      timeoutMessage: '生成超时 (超过10分钟)',
      failedMessage: '生成失败',
    });
  };

  const saveStructuredOutline = async (treeToSave: OutlineNode[]) => {
    if (!novel?.id) return;

    const outlinePayload = buildOutlinePersistencePayload(treeToSave as OutlinePlanningNode[]);
    setEditedOutline(outlinePayload.outline);

    try {
      await fetch(`/api/novels/${novel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outlinePayload),
      });
      setNovel(prev => prev ? { ...prev, ...outlinePayload } : null);
    } catch (error) {
      console.error('Failed to auto-save outline', error);
    }
  };

  const handleToggle = (id: string) => {
    setOutlineNodes(prev => {
      const toggleRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map(node => {
          if (node.id === id) {
            return { ...node, isExpanded: !node.isExpanded };
          }
          if (node.children && node.children.length > 0) {
            return { ...node, children: toggleRecursive(node.children) };
          }
          return node;
        });
      };
      return toggleRecursive(prev);
    });
  };

  const handleSetAllExpanded = (expanded: boolean) => {
    setOutlineNodes(prev => {
      const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map((node) => ({
          ...node,
          isExpanded: node.children && node.children.length > 0 ? expanded : node.isExpanded,
          children: node.children ? updateRecursive(node.children) : node.children,
        }));
      };
      return updateRecursive(prev);
    });
  };

  const updateNodeChildren = (id: string, children: OutlineNode[]) => {
    setOutlineNodes(prev => {
      const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map(node => {
          if (node.id === id) {
            return { ...node, children, isExpanded: true, isGenerating: false };
          }
          if (node.children && node.children.length > 0) {
            return { ...node, children: updateRecursive(node.children) };
          }
          return node;
        });
      };
      return updateRecursive(prev);
    });
  };

  useEffect(() => {
    if (outlineNodes.length === 0) return;
    
    const timer = setTimeout(() => {
      saveStructuredOutline(outlineNodes);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [outlineNodes]);

  const setNodeGenerating = (id: string, isGenerating: boolean) => {
    const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isGenerating };
        }
        if (node.children && node.children.length > 0) {
          return { ...node, children: updateRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineNodes(prev => updateRecursive(prev));
  };

  const generateDetailedForBlock = async (node: OutlineNode) => {
    if (!novel?.id) return;
    setNodeGenerating(node.id, true);

    try {
      const roughNodes = outlineNodes.filter(n => n.level === 'rough');
      const currentIndex = roughNodes.findIndex(n => n.id === node.id);
      
      const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
      const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
      
      const context = roughNodes
        .map(n => `${n.id}. ${n.title}: ${n.content}`)
        .join('\n');
      const existingDetailed = node.children || [];
      const prevDetailedNode = existingDetailed.length > 0 ? existingDetailed[existingDetailed.length - 1] : null;
      const guidance = prevDetailedNode
        ? `请延续已生成细纲的叙事节奏与冲突升级，重点保持与前序节点“${prevDetailedNode.title}”的因果衔接。`
        : '请先建立该分卷的开端、冲突与阶段目标，便于后续持续续写。';

      const output = await runJob('OUTLINE_DETAILED', {
        novelId: novel.id,
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        rough_outline_context: context,
        prev_block_title: prevBlock?.title || '',
        prev_block_content: prevBlock?.content || '',
        next_block_title: nextBlock?.title || '',
        next_block_content: nextBlock?.content || '',
        targetWords: novel.targetWords,
        chapterCount: novel.chapterCount,
        parent_rough_node: {
          id: node.id,
          title: node.title,
          content: node.content,
        },
        prev_detailed_node: prevDetailedNode
          ? {
              id: prevDetailedNode.id,
              title: prevDetailedNode.title,
              content: prevDetailedNode.content,
            }
          : undefined,
        user_guidance: guidance,
      });

      const normalizedChildren = forceLevel(parseGeneratedNodes(output, 'detailed'), 'detailed');
      if (normalizedChildren.length > 0) {
        updateNodeChildren(node.id, normalizedChildren);
      } else {
        alert('未解析到细纲节点，请重试');
      }
    } catch (error) {
      console.error('Failed to generate detailed outline', error);
      alert('生成细纲失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const generateChaptersForBlock = async (node: OutlineNode) => {
    if (!novel?.id) return;
    setNodeGenerating(node.id, true);

    try {
      const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
      
      const allDetailed = outlineNodes.flatMap(rough => rough.children || []);
      const context = allDetailed
        .map(detailed => `${detailed.id}. ${detailed.title}: ${detailed.content}`)
        .join('\n');
      const allChapterNodes = allDetailed.flatMap((detailed) => detailed.children || []);
      const prevChaptersSummary = allChapterNodes
        .slice(-10)
        .map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.content.slice(0, 80)}`)
        .join('\n');
      const recentChaptersContent = allChapterNodes
        .slice(-3)
        .map((chapter) => `${chapter.title}\n${chapter.content}`)
        .join('\n\n');
      const prevChapter = allChapterNodes.length > 0 ? allChapterNodes[allChapterNodes.length - 1] : null;
      const guidance = prevChapter
        ? `请保证新章节与上一章节“${prevChapter.title}”顺承，并推进主线冲突。`
        : '请先构建开篇章节组，明确引子、冲突和章节钩子节奏。';

      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId: novel.id,
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        detailed_outline_context: context,
        parent_rough_title: parentRough?.title || '',
        parent_rough_content: parentRough?.content || '',
        targetWords: novel.targetWords,
        chapterCount: novel.chapterCount,
        prev_chapters_summary: prevChaptersSummary,
        recent_chapters_content: recentChaptersContent,
        user_guidance: guidance,
        parent_detailed_node: {
          id: node.id,
          title: node.title,
          content: node.content,
        },
      });

      const normalizedChildren = forceLevel(parseGeneratedNodes(output, 'chapter'), 'chapter');
      if (normalizedChildren.length > 0) {
        updateNodeChildren(node.id, normalizedChildren);
      } else {
        alert('未解析到章节纲节点，请重试');
      }
    } catch (error) {
      console.error('Failed to generate chapters', error);
      alert('生成章节失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const handleGenerateNext = (node: OutlineNode) => {
    if (node.level === 'rough') {
      generateDetailedForBlock(node);
    } else if (node.level === 'detailed') {
      generateChaptersForBlock(node);
    }
  };

  const handleRegenerateSingleNode = async (node: OutlineNode) => {
    if (!novel?.id) return;
    
    const levelLabels = { rough: '粗纲', detailed: '细纲', chapter: '章节' };
    
    setConfirmState({
      isOpen: true,
      title: `重新生成此${levelLabels[node.level]}`,
      message: `确定要重新生成「${node.title}」吗？${node.children?.length ? '其下级节点也会被重新生成。' : ''}`,
      confirmText: '确认重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        setNodeGenerating(node.id, true);
        
        try {
          if (node.level === 'rough') {
            const roughNodes = outlineNodes.filter(n => n.level === 'rough');
            const currentIndex = roughNodes.findIndex(n => n.id === node.id);
            const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
            const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
            
            const output = await runJob('OUTLINE_ROUGH', {
              novelId: novel.id,
              keywords: novel.keywords?.join(',') || '',
              theme: novel.theme || '',
              genre: novel.genre || '',
              targetWords: novel.targetWords || 100,
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              prev_block_title: prevBlock?.title || '',
              prev_block_content: prevBlock?.content || '',
              next_block_title: nextBlock?.title || '',
              next_block_content: nextBlock?.content || '',
            });
            
            const newNode = output?.block || output;
            if (newNode) {
              setOutlineNodes(prev => prev.map(n => 
                n.id === node.id ? { ...n, ...newNode, level: 'rough', children: undefined } : n
              ));
            }
            
          } else if (node.level === 'detailed') {
            const allDetailed = outlineNodes.flatMap(r => r.children || []);
            const currentIndex = allDetailed.findIndex(n => n.id === node.id);
            const prevNode = currentIndex > 0 ? allDetailed[currentIndex - 1] : null;
            const nextNode = currentIndex < allDetailed.length - 1 ? allDetailed[currentIndex + 1] : null;
            
            const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
            
            const output = await runJob('OUTLINE_DETAILED', {
              novelId: novel.id,
              roughOutline: {},
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              rough_outline_context: parentRough ? `${parentRough.id}. ${parentRough.title}: ${parentRough.content}` : '',
              prev_block_title: prevNode?.title || '',
              prev_block_content: prevNode?.content || '',
              next_block_title: nextNode?.title || '',
              next_block_content: nextNode?.content || '',
              original_node_title: node.title,
            });
            
            const newNode = output?.node || output;
            if (newNode) {
              const updateDetailedNode = (nodes: OutlineNode[]): OutlineNode[] => {
                return nodes.map(n => {
                  if (n.id === node.id) {
                    return { ...n, ...newNode, level: 'detailed', children: undefined };
                  }
                  if (n.children) {
                    return { ...n, children: updateDetailedNode(n.children) };
                  }
                  return n;
                });
              };
              setOutlineNodes(prev => updateDetailedNode(prev));
            }
            
          } else if (node.level === 'chapter') {
            const allChapters = outlineNodes.flatMap(r => (r.children || []).flatMap(d => d.children || []));
            const currentIndex = allChapters.findIndex(n => n.id === node.id);
            const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
            const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;
            
            const parentDetailed = outlineNodes.flatMap(r => r.children || []).find(d => d.children?.some(c => c.id === node.id));
            
            const output = await runJob('OUTLINE_CHAPTERS', {
              novelId: novel.id,
              detailedOutline: {},
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              detailed_outline_context: parentDetailed ? `${parentDetailed.id}. ${parentDetailed.title}: ${parentDetailed.content}` : '',
              prev_chapter_title: prevChapter?.title || '',
              prev_chapter_content: prevChapter?.content || '',
              next_chapter_title: nextChapter?.title || '',
              next_chapter_content: nextChapter?.content || '',
              original_chapter_title: node.title,
            });
            
            const newNode = output?.chapter || output;
            if (newNode) {
              const updateChapterNode = (nodes: OutlineNode[]): OutlineNode[] => {
                return nodes.map(n => {
                  if (n.id === node.id) {
                    return { ...n, ...newNode, level: 'chapter' };
                  }
                  if (n.children) {
                    return { ...n, children: updateChapterNode(n.children) };
                  }
                  return n;
                });
              };
              setOutlineNodes(prev => updateChapterNode(prev));
            }
          }
        } catch (error) {
          console.error('Failed to regenerate node', error);
          alert('重新生成失败，请重试');
        } finally {
          setNodeGenerating(node.id, false);
        }
      },
    });
  };

  const handleOutlineSelect = (id: string, selected: boolean) => {
    setSelectedOutlineIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBatchRegenerate = async () => {
    if (!novel?.id || selectedOutlineIds.size === 0) return;
    
    const findNodes = (nodes: OutlineNode[]): OutlineNode[] => {
      const result: OutlineNode[] = [];
      for (const node of nodes) {
        if (selectedOutlineIds.has(node.id)) {
          result.push(node);
        }
        if (node.children) {
          result.push(...findNodes(node.children));
        }
      }
      return result;
    };
    
    const selectedNodes = findNodes(outlineNodes);
    
    setConfirmState({
      isOpen: true,
      title: '批量重新生成',
      message: `确定要重新生成选中的 ${selectedNodes.length} 个节点吗？`,
      confirmText: '确认批量重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        
        for (const node of selectedNodes) {
          setNodeGenerating(node.id, true);
        }
        
        try {
          for (const node of selectedNodes) {
            await handleRegenerateSingleNodeInternal(node);
          }
        } finally {
          for (const node of selectedNodes) {
            setNodeGenerating(node.id, false);
          }
          setSelectedOutlineIds(new Set());
          setOutlineSelectionMode(false);
        }
      },
    });
  };

  const handleRegenerateSingleNodeInternal = async (node: OutlineNode) => {
    if (!novel?.id) return;
    
    try {
      if (node.level === 'rough') {
        const roughNodes = outlineNodes.filter(n => n.level === 'rough');
        const currentIndex = roughNodes.findIndex(n => n.id === node.id);
        const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
        const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
        
        const output = await runJob('OUTLINE_ROUGH', {
          novelId: novel.id,
          keywords: novel.keywords?.join(',') || '',
          theme: novel.theme || '',
          genre: novel.genre || '',
          targetWords: novel.targetWords || 100,
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          prev_block_title: prevBlock?.title || '',
          prev_block_content: prevBlock?.content || '',
          next_block_title: nextBlock?.title || '',
          next_block_content: nextBlock?.content || '',
        });
        
        const newNode = output?.block || output;
        if (newNode) {
          setOutlineNodes(prev => prev.map(n => 
            n.id === node.id ? { ...n, ...newNode, level: 'rough', children: undefined } : n
          ));
        }
      } else if (node.level === 'detailed') {
        const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
        
        const output = await runJob('OUTLINE_DETAILED', {
          novelId: novel.id,
          roughOutline: {},
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          rough_outline_context: parentRough ? `${parentRough.id}. ${parentRough.title}` : '',
          original_node_title: node.title,
        });
        
        const newNode = output?.node || output;
        if (newNode) {
          const updateDetailedNode = (nodes: OutlineNode[]): OutlineNode[] => {
            return nodes.map(n => {
              if (n.id === node.id) return { ...n, ...newNode, level: 'detailed', children: undefined };
              if (n.children) return { ...n, children: updateDetailedNode(n.children) };
              return n;
            });
          };
          setOutlineNodes(prev => updateDetailedNode(prev));
        }
      } else if (node.level === 'chapter') {
        const parentDetailed = outlineNodes.flatMap(r => r.children || []).find(d => d.children?.some(c => c.id === node.id));
        
        const output = await runJob('OUTLINE_CHAPTERS', {
          novelId: novel.id,
          detailedOutline: {},
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          detailed_outline_context: parentDetailed ? `${parentDetailed.id}. ${parentDetailed.title}` : '',
          original_chapter_title: node.title,
        });
        
        const newNode = output?.chapter || output;
        if (newNode) {
          const updateChapterNode = (nodes: OutlineNode[]): OutlineNode[] => {
            return nodes.map(n => {
              if (n.id === node.id) return { ...n, ...newNode, level: 'chapter' };
              if (n.children) return { ...n, children: updateChapterNode(n.children) };
              return n;
            });
          };
          setOutlineNodes(prev => updateChapterNode(prev));
        }
      }
    } catch (error) {
      console.error('Failed to regenerate node', node.id, error);
    }
  };

  const handleRegenerateOutline = async (type: 'rough' | 'detailed' | 'chapters') => {
    if (!novel) return;
    
    const typeLabels = { rough: '粗纲', detailed: '细纲', chapters: '章节纲' };
    
    setConfirmState({
      isOpen: true,
      title: `重新生成${typeLabels[type]}`,
      message: `确定要重新生成${typeLabels[type]}吗？这将覆盖现有的${typeLabels[type]}内容。${type === 'rough' ? '细纲和章节纲也会被重置。' : type === 'detailed' ? '章节纲也会被重置。' : ''}`,
      confirmText: '确认重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        setRegeneratingOutline(type);
        
        try {
          if (type === 'rough') {
            const roughOutput = await runJob('OUTLINE_ROUGH', {
              novelId: novel.id,
              keywords: novel.keywords?.join(',') || '',
              theme: novel.theme || '',
              genre: novel.genre || '',
              targetWords: novel.targetWords || 100,
              chapterCount: novel.chapterCount || 100,
              protagonist: novel.protagonist || '',
              worldSetting: novel.worldSetting || '',
              creativeIntent: novel.creativeIntent || '',
              specialRequirements: novel.specialRequirements || '',
            });

            const normalized = normalizeOutlineBlocksPayload(roughOutput, 'rough');
            const persistence = buildOutlinePersistencePayload(normalized.blocks);
            setOutlineNodes(normalized.blocks as OutlineNode[]);
            setNovel(prev => prev ? { ...prev, ...persistence } : null);

          } else if (type === 'detailed') {
            const roughOutline = novel.outlineRough || { blocks: outlineNodes.filter(n => n.level === 'rough') };

            const detailedOutput = await runJob('OUTLINE_DETAILED', {
              novelId: novel.id,
              roughOutline,
              targetWords: novel.targetWords || 100,
              chapterCount: novel.chapterCount || 100,
            });

            const normalized = normalizeOutlineBlocksPayload(detailedOutput, 'rough');
            const persistence = buildOutlinePersistencePayload(normalized.blocks);
            setOutlineNodes(normalized.blocks as OutlineNode[]);
            setNovel(prev => prev ? { ...prev, ...persistence } : null);

          } else if (type === 'chapters') {
            const detailedOutline = novel.outlineDetailed || { 
              story_arcs: outlineNodes.map(n => ({
                arc_id: n.id,
                arc_title: n.title,
                children: n.children || []
              }))
            };

            const chaptersOutput = await runJob('OUTLINE_CHAPTERS', {
              novelId: novel.id,
              detailedOutline,
            });

            const normalized = normalizeOutlineBlocksPayload(chaptersOutput, 'rough');
            const persistence = buildOutlinePersistencePayload(normalized.blocks);
            setOutlineNodes(normalized.blocks as OutlineNode[]);
            setNovel(prev => prev ? { ...prev, ...persistence } : null);
          }
          
        } catch (error) {
          console.error(`Failed to regenerate ${type} outline`, error);
          alert(`重新生成${typeLabels[type]}失败，请重试`);
        } finally {
          setRegeneratingOutline(null);
        }
      },
    });
  };

  const handleContinueOutline = async (type: 'rough' | 'detailed' | 'chapters') => {
    if (!novel || regeneratingOutline || continuingOutline) return;

    setContinuingOutline(type);

    try {
      if (type === 'rough') {
        const roughNodes = outlineNodes.filter((node) => node.level === 'rough');
        const previousVolumeSummary = roughNodes.length === 0
          ? '无（当前为第一卷）'
          : roughNodes
              .slice(-3)
              .map((node, index) => `第${roughNodes.length - Math.min(3, roughNodes.length) + index + 1}卷：${node.title}\n${node.content}`)
              .join('\n\n');

        const output = await runJob('OUTLINE_ROUGH', {
          novelId: novel.id,
          keywords: novel.keywords?.join(',') || '',
          theme: novel.theme || '',
          genre: novel.genre || '',
          targetWords: novel.targetWords || 100,
          chapterCount: novel.chapterCount || 100,
          protagonist: novel.protagonist || '',
          worldSetting: novel.worldSetting || '',
          creativeIntent: novel.creativeIntent || '',
          specialRequirements: novel.specialRequirements || '',
          prev_volume_summary: previousVolumeSummary,
          user_guidance: '请续写下一卷粗纲，必须承接前卷结尾伏笔并升级主线矛盾，保持世界观和人物动机连续。',
        });

        const generated = forceLevel(parseGeneratedNodes(output, 'rough'), 'rough');
        if (generated.length === 0) {
          throw new Error('未生成有效的粗纲节点');
        }

        setOutlineNodes((prev) => {
          const existingIds = collectNodeIds(prev);
          const uniqueNodes = ensureUniqueIds(generated, existingIds, `rough-${prev.length + 1}`);
          return [...prev, ...uniqueNodes];
        });
      }

      if (type === 'detailed') {
        const roughNodes = outlineNodes.filter((node) => node.level === 'rough');
        const targetRough = roughNodes[roughNodes.length - 1];
        if (!targetRough) {
          throw new Error('请先生成粗纲后再续写细纲');
        }

        const roughIndex = roughNodes.findIndex((node) => node.id === targetRough.id);
        const prevBlock = roughIndex > 0 ? roughNodes[roughIndex - 1] : null;
        const nextBlock = roughIndex < roughNodes.length - 1 ? roughNodes[roughIndex + 1] : null;
        const prevDetailed = targetRough.children && targetRough.children.length > 0
          ? targetRough.children[targetRough.children.length - 1]
          : null;
        const roughContext = roughNodes
          .map((node) => `${node.id}. ${node.title}: ${node.content}`)
          .join('\n');

        const output = await runJob('OUTLINE_DETAILED', {
          novelId: novel.id,
          target_id: targetRough.id,
          target_title: targetRough.title,
          target_content: targetRough.content,
          rough_outline_context: roughContext,
          prev_block_title: prevBlock?.title || '',
          prev_block_content: prevBlock?.content || '',
          next_block_title: nextBlock?.title || '',
          next_block_content: nextBlock?.content || '',
          targetWords: novel.targetWords || 100,
          chapterCount: novel.chapterCount || 100,
          parent_rough_node: {
            id: targetRough.id,
            title: targetRough.title,
            content: targetRough.content,
          },
          prev_detailed_node: prevDetailed
            ? {
                id: prevDetailed.id,
                title: prevDetailed.title,
                content: prevDetailed.content,
              }
            : undefined,
          user_guidance: prevDetailed
            ? `请续写该分卷细纲，承接上一细纲节点“${prevDetailed.title}”并保持冲突升级。`
            : '请从该分卷起始位置生成首批细纲节点，明确目标、冲突与阶段转折。',
        });

        const generated = forceLevel(parseGeneratedNodes(output, 'detailed'), 'detailed');
        if (generated.length === 0) {
          throw new Error('未生成有效的细纲节点');
        }

        appendNodeChildren(targetRough.id, generated);
      }

      if (type === 'chapters') {
        const roughNodes = outlineNodes.filter((node) => node.level === 'rough');
        const detailedEntries = roughNodes.flatMap((roughNode) =>
          (roughNode.children || []).map((detailedNode) => ({
            roughNode,
            detailedNode,
          }))
        );
        const targetEntry = detailedEntries[detailedEntries.length - 1];
        if (!targetEntry) {
          throw new Error('请先生成细纲后再续写章节纲');
        }

        const allDetailed = detailedEntries.map((entry) => entry.detailedNode);
        const allChapterNodes = allDetailed.flatMap((detailedNode) => detailedNode.children || []);
        const prevChaptersSummary = allChapterNodes
          .slice(-10)
          .map((node, index) => `${index + 1}. ${node.title}: ${node.content.slice(0, 90)}`)
          .join('\n');
        const recentChaptersContent = allChapterNodes
          .slice(-3)
          .map((node) => `${node.title}\n${node.content}`)
          .join('\n\n');
        const detailedContext = allDetailed
          .map((node) => `${node.id}. ${node.title}: ${node.content}`)
          .join('\n');
        const prevChapter = allChapterNodes.length > 0 ? allChapterNodes[allChapterNodes.length - 1] : null;

        const output = await runJob('OUTLINE_CHAPTERS', {
          novelId: novel.id,
          target_id: targetEntry.detailedNode.id,
          target_title: targetEntry.detailedNode.title,
          target_content: targetEntry.detailedNode.content,
          detailed_outline_context: detailedContext,
          parent_rough_title: targetEntry.roughNode.title,
          parent_rough_content: targetEntry.roughNode.content,
          targetWords: novel.targetWords || 100,
          chapterCount: novel.chapterCount || 100,
          prev_chapters_summary: prevChaptersSummary,
          recent_chapters_content: recentChaptersContent,
          parent_detailed_node: {
            id: targetEntry.detailedNode.id,
            title: targetEntry.detailedNode.title,
            content: targetEntry.detailedNode.content,
          },
          user_guidance: prevChapter
            ? `请续写章节纲，首章需要自然承接上一章“${prevChapter.title}”结尾并推动主线。`
            : '请为该细纲生成首批章节纲，确保每章都有开场冲突与章末钩子。',
        });

        const generated = forceLevel(parseGeneratedNodes(output, 'chapter'), 'chapter');
        if (generated.length === 0) {
          throw new Error('未生成有效的章节纲节点');
        }

        appendNodeChildren(targetEntry.detailedNode.id, generated);
      }
    } catch (error) {
      console.error('Failed to continue outline', error);
      alert(error instanceof Error ? error.message : '续写失败，请重试');
    } finally {
      setContinuingOutline(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-6">
          <Skeleton className="w-24 h-6" />
          <div className="flex items-start justify-between bg-white/5 p-6 rounded-3xl border border-white/5">
            <div className="flex-1 mr-8">
              <Skeleton className="w-32 h-6 mb-4" />
              <Skeleton className="w-96 h-12 mb-4" />
              <div className="flex gap-4">
                <Skeleton className="w-32 h-5" />
                <Skeleton className="w-24 h-5" />
              </div>
            </div>
            <Skeleton className="w-32 h-10 rounded-xl" />
          </div>
        </div>
        <div className="space-y-8">
          <div className="flex gap-4 border-b border-white/5 pb-0">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="w-24 h-12 rounded-t-xl" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <Skeleton className="w-48 h-8" />
              <Skeleton className="w-32 h-10" />
            </div>
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="w-full h-32 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-gradient-to-br from-zinc-950 to-zinc-900">
        <h1 className="text-3xl font-bold text-white tracking-tight">未找到小说</h1>
        <p className="text-gray-400">该小说可能已被删除或不存在。</p>
        <Link href="/novels">
          <Button variant="secondary" leftIcon={<span className="group-hover:-translate-x-1 inline-block transition-transform">←</span>}>
             返回小说列表
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = novel?.type === 'long' 
    ? ['chapters', 'outline', 'workbench', 'settings'] as const
    : ['chapters', 'workbench', 'settings'] as const;

  const totalWords = chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);
  const approvedCount = chapters.filter((c) => c.generationStage === 'approved').length;
  const reviewDoneCount = chapters.filter((c) => c.generationStage === 'reviewed' || c.generationStage === 'humanized' || c.generationStage === 'approved').length;
  const workflowAlertCount = (workflowStats.overdueHooks || 0) + (blockingInfo.hasBlocking ? blockingInfo.count : 0);
  const outlineStage = novel.outlineStage === 'rough' || novel.outlineStage === 'detailed' || novel.outlineStage === 'chapters'
    ? novel.outlineStage
    : 'none';
  const outlineStageText = outlineStage === 'rough'
    ? '粗纲阶段'
    : outlineStage === 'detailed'
      ? '细纲阶段'
      : outlineStage === 'chapters'
        ? '章节规划完成'
        : '未分层';
  const outlineStageDescription = outlineStage === 'rough'
    ? '先完善主线粗纲，再逐段展开为细纲。'
    : outlineStage === 'detailed'
      ? '细纲已就绪，可继续生成章节规划。'
      : outlineStage === 'chapters'
        ? '章节级大纲已形成，可直接进入正文创作。'
        : '当前大纲尚未进入分层阶段。';
  const outlineStageRank = outlineStage === 'rough' ? 1 : outlineStage === 'detailed' ? 2 : outlineStage === 'chapters' ? 3 : 0;

  const outlineMetrics = (() => {
    const metrics = {
      rough: 0,
      detailed: 0,
      chapter: 0,
      total: 0,
      expanded: 0,
    };

    const walk = (nodes: OutlineNode[]) => {
      nodes.forEach((node) => {
        metrics.total += 1;
        if (node.isExpanded) {
          metrics.expanded += 1;
        }
        if (node.level === 'rough') metrics.rough += 1;
        if (node.level === 'detailed') metrics.detailed += 1;
        if (node.level === 'chapter') metrics.chapter += 1;
        if (node.children?.length) {
          walk(node.children);
        }
      });
    };

    walk(outlineNodes);
    return metrics;
  })();
  const isOutlineMutating = regeneratingOutline !== null || continuingOutline !== null;
  const canContinueDetailed = outlineMetrics.rough > 0;
  const canContinueChapters = outlineMetrics.detailed > 0;

  const outlineLevelFilterOptions: Array<{ id: OutlineLevelFilter; label: string; count: number }> = [
    { id: 'all', label: '全部', count: outlineMetrics.total },
    { id: 'rough', label: '粗纲', count: outlineMetrics.rough },
    { id: 'detailed', label: '细纲', count: outlineMetrics.detailed },
    { id: 'chapter', label: '章节', count: outlineMetrics.chapter },
  ];
  const normalizedOutlineSearch = outlineSearchKeyword.trim().toLowerCase();
  const isOutlineFiltered = outlineLevelFilter !== 'all' || normalizedOutlineSearch.length > 0;

  const visibleOutlineNodes = (() => {
    if (!isOutlineFiltered) {
      return outlineNodes;
    }

    const filterRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      const result: OutlineNode[] = [];

      for (const node of nodes) {
        const levelMatched = outlineLevelFilter === 'all' || node.level === outlineLevelFilter;
        const keywordMatched =
          normalizedOutlineSearch.length === 0 ||
          `${node.id} ${node.title} ${node.content}`.toLowerCase().includes(normalizedOutlineSearch);
        const filteredChildren = node.children?.length ? filterRecursive(node.children) : undefined;

        if ((levelMatched && keywordMatched) || (filteredChildren && filteredChildren.length > 0)) {
          result.push({
            ...node,
            children: filteredChildren,
            isExpanded: filteredChildren && filteredChildren.length > 0 ? true : node.isExpanded,
          });
        }
      }

      return result;
    };

    return filterRecursive(outlineNodes);
  })();

  const visibleOutlineNodeCount = (() => {
    const countRecursive = (nodes: OutlineNode[]): number => {
      return nodes.reduce((sum, node) => sum + 1 + countRecursive(node.children || []), 0);
    };
    return countRecursive(visibleOutlineNodes);
  })();

  return (
    <div className="min-h-screen p-4 md:p-6 xl:p-8 max-w-[1500px] mx-auto space-y-7 animate-fade-in">
      {error && (
        <motion.div 
          initial="hidden" 
          animate="visible" 
          exit="exit" 
          variants={slideUp}
          className="fixed top-6 right-6 z-50 bg-red-500/90 text-white px-6 py-4 rounded-xl shadow-2xl shadow-red-500/20 flex items-center gap-4 backdrop-blur-md border border-red-400/20"
        >
          <div className="bg-white/20 p-2 rounded-full">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-medium">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="h-8 w-8 rounded-lg px-0 text-white/85 hover:bg-white/20 hover:text-white"
            aria-label="关闭错误提示"
            title="关闭"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </motion.div>
      )}
      
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 relative">
        <div className="glass-card rounded-3xl border border-zinc-800/70 p-6 md:p-7 relative overflow-hidden">
          <div className="absolute -top-24 -right-16 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-16 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="min-w-0 flex-1">
              <Link
                href="/novels"
                className="text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-2 transition-colors group text-sm font-medium mb-4"
              >
                <span className="bg-zinc-800/70 p-1.5 rounded-lg group-hover:bg-zinc-700 transition-colors">
                  <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </span>
                返回列表
              </Link>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="default" className="bg-sky-500/15 text-sky-300 border-sky-500/25">
                  {novel?.type === 'long' ? '长篇小说' : '作品'}
                </Badge>
                <span className="text-xs text-zinc-500 font-mono">ID: {novel.id.slice(0, 8)}</span>
                {novel.genre && (
                  <Badge variant="outline" className="text-zinc-300 border-zinc-700/70 bg-zinc-900/60">
                    {novel.genre}
                  </Badge>
                )}
              </div>

              {isEditingTitle ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleUpdateTitle}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                  className="text-3xl md:text-4xl font-bold bg-zinc-900/70 border-b-2 border-emerald-500 rounded-lg px-3 py-1.5 w-full outline-none text-white placeholder-zinc-500 focus:bg-zinc-900/90 transition-all"
                  autoFocus
                />
              ) : (
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className="text-3xl md:text-4xl font-bold text-white cursor-pointer hover:text-emerald-200 transition-colors group flex items-center gap-3"
                  title="点击修改标题"
                >
                  <span className="truncate">{novel.title}</span>
                  <svg className="w-5 h-5 opacity-0 group-hover:opacity-50 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </h1>
              )}

              {(novel.description || novel.theme) && (
                <p className="mt-3 text-zinc-400 leading-relaxed max-w-3xl">
                  {novel.description || novel.theme}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {new Date(novel.updatedAt).toLocaleDateString()} 更新
                </span>
                <span className="w-1 h-1 bg-zinc-600 rounded-full" />
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {chapters.length} 章节
                </span>
                <span className="w-1 h-1 bg-zinc-600 rounded-full" />
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h8m-8 4h6" />
                  </svg>
                  {totalWords.toLocaleString()} 字
                </span>
              </div>

              {novel.keywords && novel.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {novel.keywords.slice(0, 6).map((keyword) => (
                    <span key={keyword} className="text-xs px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-700/80 text-zinc-300">
                      #{keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="relative z-10 shrink-0">
              <Button
                variant="secondary"
                onClick={() => setIsExportOpen(!isExportOpen)}
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                }
                className="shadow-lg shadow-black/20 min-w-[118px]"
              >
                导出作品
              </Button>

              {isExportOpen && (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={fadeIn}
                  className="absolute right-0 mt-2 w-48 glass-card rounded-xl overflow-hidden z-20 border border-zinc-700/70 shadow-xl shadow-black/50"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto w-full justify-start rounded-none border-0 bg-transparent px-4 py-3 text-left text-sm text-zinc-300 hover:bg-emerald-500/20 hover:text-white"
                  >
                    <span className="text-xs font-mono bg-zinc-800 px-1.5 py-0.5 rounded">TXT</span>
                    纯文本格式
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto w-full justify-start rounded-none border-0 bg-transparent px-4 py-3 text-left text-sm text-zinc-300 hover:bg-emerald-500/20 hover:text-white"
                  >
                    <span className="text-xs font-mono bg-zinc-800 px-1.5 py-0.5 rounded">MD</span>
                    Markdown格式
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <aside className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-1 gap-3">
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/65">
            <div className="text-xs text-zinc-500 mb-1">总字数</div>
            <div className="text-lg font-semibold text-zinc-100">{totalWords.toLocaleString()}</div>
          </Card>
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/65">
            <div className="text-xs text-zinc-500 mb-1">已审查章节</div>
            <div className="text-lg font-semibold text-zinc-100">{reviewDoneCount}/{chapters.length || 0}</div>
          </Card>
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/65">
            <div className="text-xs text-zinc-500 mb-1">已定稿</div>
            <div className="text-lg font-semibold text-emerald-300">{approvedCount}</div>
          </Card>
          <Card className={`p-4 rounded-2xl border ${workflowAlertCount > 0 ? 'border-red-500/35 bg-red-500/10' : 'border-zinc-800/80 bg-zinc-900/65'}`}>
            <div className="text-xs text-zinc-500 mb-1">待处理风险</div>
            <div className={`text-lg font-semibold ${workflowAlertCount > 0 ? 'text-red-300' : 'text-zinc-100'}`}>
              {workflowAlertCount}
            </div>
          </Card>
        </aside>
      </div>

      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
          <TabsList variant="pills" className="overflow-x-auto no-scrollbar mask-linear-fade w-fit max-w-full justify-start border border-zinc-800/80 bg-zinc-900/70 p-1 rounded-2xl">
            {tabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="text-sm md:text-base gap-2 px-4 md:px-5 h-10">
                <span className="text-base">
                  {tab === 'chapters' && '📚'}
                  {tab === 'outline' && '🗺️'}
                  {tab === 'workbench' && '🛠️'}
                  {tab === 'settings' && '⚙️'}
                </span>
                
                {tab === 'chapters' ? '章节列表' : tab === 'outline' ? '大纲规划' : tab === 'workbench' ? '创作工坊' : '高级设置'}
                
                {tab === 'workbench' && (workflowStats.overdueHooks > 0 || blockingInfo.hasBlocking) && (
                  <Badge variant="error" size="sm" className="ml-1 animate-pulse">
                    {(workflowStats.overdueHooks || 0) + (blockingInfo.hasBlocking ? blockingInfo.count : 0)}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="outline" key="outline">
              {novel?.type === 'long' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  {outlineNodes.length > 0 && (
                    <Card className="rounded-3xl border border-zinc-800/80 bg-zinc-900/55 overflow-hidden">
                      <div className="p-5 md:p-6 border-b border-zinc-800/70 space-y-5">
                        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                          <div className="space-y-4 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl md:text-2xl font-bold text-zinc-100">大纲规划</h3>
                              <Badge variant={outlineStage === 'chapters' ? 'success' : 'info'} className="px-3 py-1">
                                {outlineStageText}
                              </Badge>
                              <Badge variant="outline" className="px-3 py-1 border-zinc-700/80 bg-zinc-900/70 text-zinc-300">
                                主节点 {outlineNodes.length}
                              </Badge>
                            </div>
                            <p className="text-sm text-zinc-400 max-w-2xl">{outlineStageDescription}</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-2">
                                <div className="text-[11px] text-zinc-500">粗纲</div>
                                <div className="text-sm font-semibold text-zinc-100">{outlineMetrics.rough}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-2">
                                <div className="text-[11px] text-zinc-500">细纲</div>
                                <div className="text-sm font-semibold text-zinc-100">{outlineMetrics.detailed}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-2">
                                <div className="text-[11px] text-zinc-500">章节节点</div>
                                <div className="text-sm font-semibold text-zinc-100">{outlineMetrics.chapter}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-2">
                                <div className="text-[11px] text-zinc-500">已展开</div>
                                <div className="text-sm font-semibold text-zinc-100">{outlineMetrics.expanded}</div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 2xl:min-w-[460px]">
                            <div className="flex flex-wrap items-center gap-2">
                              {outlineSelectionMode ? (
                                <>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleBatchRegenerate}
                                    disabled={selectedOutlineIds.size === 0 || isOutlineMutating}
                                    className="h-8 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
                                  >
                                    批量重新生成
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setOutlineSelectionMode(false);
                                      setSelectedOutlineIds(new Set());
                                    }}
                                    disabled={isOutlineMutating}
                                    className="h-8 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
                                  >
                                    取消选择
                                  </Button>
                                  <span className="text-xs text-zinc-500">已选 {selectedOutlineIds.size} 个</span>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setOutlineSelectionMode(true)}
                                  disabled={isOutlineMutating}
                                  className="h-8 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                  </svg>
                                  批量选择
                                </Button>
                              )}

                              {outlineStage === 'rough' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleRegenerateOutline('detailed')}
                                  isLoading={regeneratingOutline === 'detailed'}
                                  disabled={isOutlineMutating}
                                  className="h-8 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                                >
                                  生成全部细纲
                                </Button>
                              )}
                              {outlineStage === 'detailed' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleRegenerateOutline('chapters')}
                                  isLoading={regeneratingOutline === 'chapters'}
                                  disabled={isOutlineMutating}
                                  className="h-8 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                                >
                                  生成全部章节
                                </Button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center rounded-xl border border-emerald-500/25 bg-emerald-500/8 overflow-hidden">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleContinueOutline('rough')}
                                  isLoading={continuingOutline === 'rough'}
                                  disabled={regeneratingOutline !== null || continuingOutline !== null}
                                  className="h-8 rounded-none border-0 border-r border-emerald-500/20 px-3 text-[11px] text-emerald-300 hover:bg-emerald-500/16 hover:text-emerald-200 disabled:opacity-50"
                                  title="基于当前结尾追加下一卷粗纲"
                                >
                                  续写粗纲
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleContinueOutline('detailed')}
                                  isLoading={continuingOutline === 'detailed'}
                                  disabled={regeneratingOutline !== null || continuingOutline !== null || !canContinueDetailed}
                                  className="h-8 rounded-none border-0 border-r border-emerald-500/20 px-3 text-[11px] text-emerald-300 hover:bg-emerald-500/16 hover:text-emerald-200 disabled:opacity-50"
                                  title="承接最后一卷，追加细纲节点"
                                >
                                  续写细纲
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleContinueOutline('chapters')}
                                  isLoading={continuingOutline === 'chapters'}
                                  disabled={regeneratingOutline !== null || continuingOutline !== null || !canContinueChapters}
                                  className="h-8 rounded-none border-0 px-3 text-[11px] text-emerald-300 hover:bg-emerald-500/16 hover:text-emerald-200 disabled:opacity-50"
                                  title="承接最近章节，追加章节纲"
                                >
                                  续写章节
                                </Button>
                              </div>
                              <div className="flex items-center rounded-xl border border-zinc-700/70 bg-zinc-900/70 overflow-hidden">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRegenerateOutline('rough')}
                                  disabled={isOutlineMutating}
                                  className="h-8 rounded-none border-0 border-r border-zinc-800 px-3 text-[11px] text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
                                  title="重新生成粗纲 (将重置所有内容)"
                                >
                                  重置粗纲
                                </Button>
                                {(outlineStage === 'detailed' || outlineStage === 'chapters') && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRegenerateOutline('detailed')}
                                    disabled={isOutlineMutating}
                                    className="h-8 rounded-none border-0 border-r border-zinc-800 px-3 text-[11px] text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
                                    title="重新生成细纲 (将重置细纲和章节)"
                                  >
                                    重置细纲
                                  </Button>
                                )}
                                {outlineStage === 'chapters' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRegenerateOutline('chapters')}
                                    disabled={isOutlineMutating}
                                    className="h-8 rounded-none border-0 px-3 text-[11px] text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
                                    title="重新生成章节"
                                  >
                                    重置章节
                                  </Button>
                                )}
                              </div>
                              <Badge variant="outline" className="border-zinc-700/70 bg-zinc-900/65 text-zinc-400 px-2.5 py-1">
                                总节点 {outlineMetrics.total}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className={`rounded-xl border px-3 py-2 ${outlineStageRank >= 1 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800/80 bg-zinc-900/60'}`}>
                            <div className="text-[11px] text-zinc-500">第 1 步</div>
                            <div className="text-sm font-semibold text-zinc-100">粗纲</div>
                            <div className="text-xs text-zinc-400">确定主线结构</div>
                          </div>
                          <div className={`rounded-xl border px-3 py-2 ${outlineStageRank >= 2 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800/80 bg-zinc-900/60'}`}>
                            <div className="text-[11px] text-zinc-500">第 2 步</div>
                            <div className="text-sm font-semibold text-zinc-100">细纲</div>
                            <div className="text-xs text-zinc-400">扩展情节与冲突</div>
                          </div>
                          <div className={`rounded-xl border px-3 py-2 ${outlineStageRank >= 3 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800/80 bg-zinc-900/60'}`}>
                            <div className="text-[11px] text-zinc-500">第 3 步</div>
                            <div className="text-sm font-semibold text-zinc-100">章节规划</div>
                            <div className="text-xs text-zinc-400">落到章节级执行</div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800/75 bg-zinc-950/35 p-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {outlineLevelFilterOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setOutlineLevelFilter(option.id)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                                  outlineLevelFilter === option.id
                                    ? 'border-emerald-500/35 bg-emerald-500/20 text-emerald-200'
                                    : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                                }`}
                              >
                                <span>{option.label}</span>
                                <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-300">{option.count}</span>
                              </button>
                            ))}
                          </div>

                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                            <div className="relative flex-1 min-w-0">
                              <input
                                type="text"
                                value={outlineSearchKeyword}
                                onChange={(event) => setOutlineSearchKeyword(event.target.value)}
                                placeholder="搜索节点标题、内容或编号..."
                                className="h-9 w-full rounded-xl border border-zinc-700/80 bg-zinc-900/75 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/30"
                              />
                              <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-4.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSetAllExpanded(true)}
                                className="h-9 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-3 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                              >
                                展开全部
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetAllExpanded(false)}
                                className="h-9 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-3 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                              >
                                收起全部
                              </button>
                              {isOutlineFiltered && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOutlineLevelFilter('all');
                                    setOutlineSearchKeyword('');
                                  }}
                                  className="h-9 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-3 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                                >
                                  清除筛选
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-zinc-500">
                            当前视图节点：{visibleOutlineNodeCount}/{outlineMetrics.total}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 md:p-6">
                        <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/35 p-3 md:p-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
                          <OutlineTree 
                            nodes={visibleOutlineNodes}
                            onGenerateNext={handleGenerateNext}
                            onRegenerate={handleRegenerateSingleNode}
                            onToggle={handleToggle}
                            onUpdateNode={(id, content) => {
                              const updateNodes = (nodes: OutlineNode[]): OutlineNode[] => {
                                return nodes.map(n => {
                                  if (n.id === id) return { ...n, content };
                                  if (n.children) return { ...n, children: updateNodes(n.children) };
                                  return n;
                                });
                              };
                              setOutlineNodes(prev => updateNodes(prev));
                            }}
                            selectedIds={selectedOutlineIds}
                            onSelect={handleOutlineSelect}
                            selectionMode={outlineSelectionMode}
                            readOnly={false}
                            className="space-y-3"
                            emptyTitle={isOutlineFiltered ? '未匹配到大纲节点' : '暂无大纲数据'}
                            emptyDescription={isOutlineFiltered ? '请调整筛选条件或清空关键词后重试。' : '点击上方按钮生成大纲'}
                          />
                        </div>
                      </div>
                    </Card>
                  )}
                  
                  {outlineNodes.length === 0 && (
                    <Card className="p-12 rounded-3xl relative overflow-hidden min-h-[400px] flex flex-col items-center justify-center text-center border border-white/5 bg-white/[0.02]">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-emerald-500/5 opacity-50 pointer-events-none" />

                      <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/10 border border-emerald-500/20 relative group">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                        <svg className="w-10 h-10 text-emerald-400 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>

                      <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
                        开始规划你的故事
                      </h2>
                      <p className="text-gray-400 max-w-lg mb-10 text-lg">
                        采用独特的 <span className="text-emerald-400 font-medium">粗纲 → 细纲 → 章节</span> 三层递进式大纲系统，
                        帮助你构建严谨而精彩的故事情节。
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 w-full max-w-3xl">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
                          <div className="text-2xl mb-3">🌳</div>
                          <h3 className="font-bold text-white mb-1">层级结构</h3>
                          <p className="text-xs text-gray-400">从宏观架构到微观情节，层层深入细化故事</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
                          <div className="text-2xl mb-3">✨</div>
                          <h3 className="font-bold text-white mb-1">AI 辅助</h3>
                          <p className="text-xs text-gray-400">一键生成完整大纲，激发无限创作灵感</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
                          <div className="text-2xl mb-3">🔄</div>
                          <h3 className="font-bold text-white mb-1">灵活编辑</h3>
                          <p className="text-xs text-gray-400">支持单独重新生成任意节点，精准把控剧情</p>
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => setShowOutlineGenerator(true)}
                        leftIcon={
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        }
                        className="px-8 py-6 text-lg shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-1 transition-all duration-300"
                      >
                        AI 智能生成大纲
                      </Button>

                      <p className="mt-6 text-xs text-gray-500">
                        已有大纲？可以在生成后手动修改任意内容
                      </p>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="chapters" key="chapters">
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-3">
                    章节列表
                    {blockingInfo.hasBlocking && (
                      <Badge variant="error" className="px-2 py-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                        生成被阻塞
                      </Badge>
                    )}
                  </h2>
                  <Button
                    variant={blockingInfo.hasBlocking ? 'secondary' : 'primary'}
                    onClick={handleCreateChapter}
                    disabled={blockingInfo.hasBlocking}
                    title={blockingInfo.hasBlocking ? '请先处理待确认实体' : ''}
                    leftIcon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    }
                    className={blockingInfo.hasBlocking ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5' : 'shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 min-w-[120px]'}
                  >
                    添加新章节
                  </Button>
                </div>

                {chapters.length > 0 ? (
                  <div 
                    ref={parentRef}
                    className="h-[70vh] overflow-y-auto rounded-2xl border border-zinc-800/70 bg-zinc-950/35 p-4 custom-scrollbar"
                    style={{ contain: 'strict' }}
                  >
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const chapter = chapters[virtualItem.index];
                        return (
                          <div
                            key={chapter.id}
                            data-index={virtualItem.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualItem.start}px)`,
                              paddingBottom: '16px',
                            }}
                          >
                            <Card 
                              variant="interactive"
                              className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-6 group border border-zinc-800/70 bg-zinc-900/55 hover:border-emerald-500/30 transition-all duration-300 hover:bg-zinc-900/80"
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="text-zinc-600 cursor-move p-2 hover:bg-zinc-800 rounded-lg transition-colors hidden md:block">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                  </svg>
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-xs font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700 px-2 py-0.5 rounded">#{chapter.order + 1}</span>
                                    <h3 className="text-zinc-100 font-bold truncate text-lg group-hover:text-emerald-300 transition-colors">
                                      {chapter.title}
                                    </h3>
                                  </div>
                                  
                                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm text-zinc-400">
                                    <span className="flex items-center gap-1.5">
                                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                       {new Date(chapter.updatedAt).toLocaleDateString()}
                                    </span>
                                    <Badge variant="outline" className={
                                      (chapter.wordCount || 0) > 2000 
                                        ? 'border-emerald-500/20 text-emerald-300 bg-emerald-500/5'
                                        : 'border-zinc-700 text-zinc-500 bg-zinc-800/50'
                                    }>
                                      {chapter.wordCount || 0} 字
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 w-full md:w-64">
                                <div className="flex justify-between items-center text-xs text-zinc-500 px-1">
                                  <span>进度</span>
                                  <span className={`font-medium ${
                                    chapter.generationStage === 'approved' ? 'text-emerald-400' : 
                                    chapter.generationStage === 'humanized' ? 'text-purple-400' :
                                    'text-emerald-400'
                                  }`}>
                                    {WORKFLOW_STEPS.find(s => s.id === chapter.generationStage)?.label || '草稿'}
                                  </span>
                                </div>
                                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                                  {WORKFLOW_STEPS.map((step, idx) => {
                                    const currentStageIdx = WORKFLOW_STEPS.findIndex(s => s.id === (chapter.generationStage || 'draft'));
                                    const isCompleted = idx <= currentStageIdx;
                                    const isCurrent = idx === currentStageIdx;
                                    const isLastStep = idx === WORKFLOW_STEPS.length - 1;
                                    
                                    return (
                                      <div 
                                        key={step.id} 
                                        className={`flex-1 transition-all duration-500 ${
                                          isCompleted 
                                            ? isLastStep
                                              ? 'bg-emerald-500'
                                              : 'bg-emerald-500'
                                            : 'bg-transparent'
                                        } ${isCurrent && !isCompleted ? 'animate-pulse' : ''} border-r border-black/20 last:border-0`}
                                        title={step.label}
                                      />
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-zinc-800/80 pt-4 md:pt-0 md:pl-6 justify-end">
                                <Link
                                  href={`/novels/${id}/chapters/${chapter.id}`}
                                >
                                  <Button variant="primary" size="sm" leftIcon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  }>
                                    <span className="hidden md:inline">编辑</span>
                                  </Button>
                                </Link>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteChapter(chapter.id)}
                                  className="h-9 w-9 rounded-lg px-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                                  title="删除章节"
                                  aria-label="删除章节"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </Button>
                              </div>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Card className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-900/35 flex flex-col items-center justify-center gap-4 group hover:border-emerald-500/20 hover:bg-zinc-900/60 transition-all">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <span className="text-4xl">📝</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">暂无章节</h3>
                      <p className="text-zinc-400 mb-6 max-w-sm">开始你的创作之旅，添加第一个章节或让 AI 为你生成。</p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleCreateChapter}
                      leftIcon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      }
                      className="shadow-lg shadow-emerald-500/20"
                    >
                      创建你的第一章
                    </Button>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="workbench" key="workbench">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card className="p-7 rounded-3xl relative overflow-hidden group border border-zinc-800/80 hover:border-emerald-500/30 transition-all bg-zinc-900/45 flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-emerald-500/20">
                        <span className="text-2xl">📦</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">素材库</h3>
                        <p className="text-sm text-zinc-400">管理角色、设定与物品</p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-zinc-400 mb-6 text-sm line-clamp-2 flex-grow">
                    结构化整理角色、地点、情节要点和世界观设定，让 AI 更好地理解你的故事世界。
                  </p>
                  
                  <Link href={`/novels/${id}/materials`} className="block mt-auto">
                    <Button variant="secondary" className="w-full gap-2 group/btn justify-between">
                      进入素材库
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className="p-7 rounded-3xl relative overflow-hidden group border border-zinc-800/80 hover:border-orange-500/30 transition-all bg-zinc-900/45 flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-orange-500/20">
                        <span className="text-2xl">🎣</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">钩子管理</h3>
                        <p className="text-sm text-zinc-400">伏笔、悬念与剧情回收</p>
                      </div>
                    </div>
                    {workflowStats.overdueHooks > 0 && (
                      <Badge variant="error" className="animate-pulse">
                        {workflowStats.overdueHooks} 个逾期
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6 flex-grow">
                    <div className="bg-black/20 rounded-xl p-3 border border-zinc-800/80">
                      <div className="text-xl font-bold text-white">{workflowStats.unresolvedHooks}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">未解决</div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-3 border border-zinc-800/80">
                      <div className="text-xl font-bold text-emerald-400">--%</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">解决率</div>
                    </div>
                  </div>
                  
                  <Link href={`/novels/${id}/hooks`} className="block mt-auto">
                    <Button variant="secondary" className="w-full gap-2 group/btn justify-between">
                      管理钩子
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className={`p-7 rounded-3xl relative overflow-hidden group border transition-all bg-zinc-900/45 flex flex-col ${blockingInfo.hasBlocking ? 'border-red-500/30 hover:border-red-500/50' : 'border-zinc-800/80 hover:border-purple-500/30'}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${blockingInfo.hasBlocking ? 'from-red-500/5 to-orange-500/5' : 'from-purple-500/5 to-emerald-500/5'} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${blockingInfo.hasBlocking ? 'bg-red-500/10 shadow-red-500/20' : 'bg-purple-500/10 shadow-purple-500/20'}`}>
                        <span className="text-2xl">👥</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">待确认实体</h3>
                        <p className="text-sm text-zinc-400">AI 提取的新角色与组织</p>
                      </div>
                    </div>
                    {blockingInfo.hasBlocking && (
                      <Badge variant="error" className="animate-pulse">
                        阻塞生成
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex-grow">
                    {blockingInfo.hasBlocking ? (
                      <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className="text-red-300/90 text-sm">
                          有 <span className="font-bold text-white">{blockingInfo.count}</span> 个待确认实体阻碍生成。
                        </p>
                      </div>
                    ) : (
                      <div className="mb-6 flex items-center gap-3">
                        <div className="text-3xl font-bold text-white">{workflowStats.pendingEntities}</div>
                        <div className="text-sm text-zinc-500">个待处理项目</div>
                      </div>
                    )}
                  </div>
                  
                  <Link href={`/novels/${id}/pending-entities`} className="block mt-auto">
                    <Button 
                      variant={blockingInfo.hasBlocking ? 'danger' : 'secondary'}
                      className="w-full gap-2 group/btn justify-between"
                    >
                      {blockingInfo.hasBlocking ? '解决阻塞' : '进入队列'}
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className="p-7 rounded-3xl relative overflow-hidden group border border-zinc-800/80 hover:border-blue-500/30 transition-all bg-zinc-900/45 flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-blue-500/20">
                        <span className="text-2xl">🔮</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">剧情推演</h3>
                        <p className="text-sm text-zinc-400">预测未来剧情走向 (Beta)</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-grow">
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>推演章节数</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={plotSimulationControls.steps}
                          onChange={(event) =>
                            updatePlotSimulationControls({
                              steps: Number(event.target.value) || 1,
                            })
                          }
                          className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>采样迭代</span>
                        <input
                          type="number"
                          min={20}
                          max={500}
                          step={10}
                          value={plotSimulationControls.iterations}
                          onChange={(event) =>
                            updatePlotSimulationControls({
                              iterations: Number(event.target.value) || 20,
                            })
                          }
                          className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>分支数量</span>
                        <input
                          type="number"
                          min={2}
                          max={5}
                          value={plotSimulationControls.branchCount}
                          onChange={(event) =>
                            updatePlotSimulationControls({
                              branchCount: Number(event.target.value) || 2,
                            })
                          }
                          className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={plotSimulationControls.focusHooks}
                          onChange={(event) =>
                            updatePlotSimulationControls({
                              focusHooks: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-white/20 bg-black/30 accent-emerald-500"
                        />
                        优先回收伏笔并评估连续性
                      </label>
                    </div>

                    {plotBranches.length > 0 ? (
                       <div className="mb-6">
                          <PlotBranchingView
                            branches={plotBranches}
                            deadEndWarnings={plotDeadEndWarnings}
                            hookOpportunities={plotHookOpportunities}
                            selectedBranchId={plotSelectedBranchId || undefined}
                            onSelectBranch={(branchId) => setPlotSelectedBranchId(branchId)}
                          />
                          {plotLastGeneratedAt && (
                            <div className="mt-3 text-xs text-zinc-500">
                              最近推演：{new Date(plotLastGeneratedAt).toLocaleString()}
                              {plotBestBranchId ? ' · 已自动选中最佳路线' : ''}
                            </div>
                          )}
                       </div>
                    ) : (
                      <div className="mb-6 text-sm text-zinc-400 flex items-center">
                        点击推演，系统将结合连贯性、张力和伏笔状态给出可执行路线。
                      </div>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handleGeneratePlot}
                    disabled={isGeneratingPlot}
                    isLoading={isGeneratingPlot}
                    className="w-full gap-2 group/btn justify-between mt-auto"
                  >
                    开始推演
                    <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                  </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" key="settings">
              <div className="max-w-3xl mx-auto space-y-6">
                <Card className="p-8 rounded-3xl space-y-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-emerald-500 rounded-full"/>
                      基本信息
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">标题</label>
                        <input 
                          type="text" 
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">简介</label>
                        <textarea 
                          className="glass-input w-full px-4 py-3 rounded-xl h-32 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="添加简介..."
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-400">目标字数（万）</label>
                          <input 
                            type="number" 
                            value={editedTargetWords}
                            onChange={(e) => setEditedTargetWords(parseInt(e.target.value) || 200)}
                            min={1}
                            max={1000}
                            className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-400">预计章节数</label>
                          <input 
                            type="number" 
                            value={editedChapterCount}
                            onChange={(e) => setEditedChapterCount(parseInt(e.target.value) || 100)}
                            min={10}
                            max={2000}
                            className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-8 rounded-3xl space-y-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-purple-500 rounded-full"/>
                      创作设定
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">小说类型</label>
                        <div className="flex flex-wrap gap-2">
                          {['玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'].map(g => (
                            <Button
                              key={g}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditedGenre(g)}
                              className={`h-auto rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 ${
                                editedGenre === g
                                  ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:bg-emerald-500/24'
                                  : 'border border-transparent bg-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10 hover:text-zinc-200'
                              }`}
                            >
                              {g}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">核心主题/卖点</label>
                        <input 
                          type="text"
                          value={editedTheme}
                          onChange={(e) => setEditedTheme(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                          placeholder="例如：废柴逆袭、穿越重生、系统流..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">创作意图（作者目标）</label>
                        <textarea
                          value={editedCreativeIntent}
                          onChange={(e) => setEditedCreativeIntent(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl h-24 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="例如：偏现实主义、强调角色弧光与群像推进，减少套路打脸桥段..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">关键词/灵感</label>
                        <input 
                          type="text"
                          value={editedKeywords}
                          onChange={(e) => setEditedKeywords(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                          placeholder="用逗号分隔多个关键词..."
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-8 rounded-3xl space-y-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-blue-500 rounded-full"/>
                      世界观与角色
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">主角设定</label>
                        <textarea 
                          value={editedProtagonist}
                          onChange={(e) => setEditedProtagonist(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl h-28 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="主角的背景、性格、金手指..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">世界观设定</label>
                        <textarea 
                          value={editedWorldSetting}
                          onChange={(e) => setEditedWorldSetting(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl h-28 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="修炼体系、势力分布、时代背景..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">特殊要求</label>
                        <textarea 
                          value={editedSpecialRequirements}
                          onChange={(e) => setEditedSpecialRequirements(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl h-20 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="其他要求或注意事项..."
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-8 rounded-3xl space-y-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-amber-500 rounded-full"/>
                      连续性门禁
                    </h3>
                    <div className="space-y-6">
                      <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-100">启用章节连续性门禁</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            章节生成后会自动评分，低分将触发修复或拦截，减少前后文断层。
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={editedContinuityGateEnabled}
                            onChange={(event) => setEditedContinuityGateEnabled(event.target.checked)}
                            className="h-4 w-4 rounded border-zinc-500 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                          />
                          启用
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-400">通过阈值（1-10）</label>
                          <input
                            type="number"
                            step={0.1}
                            min={1}
                            max={10}
                            value={editedContinuityPassScore}
                            onChange={(event) => setEditedContinuityPassScore(parseFloat(event.target.value) || 6.8)}
                            disabled={!editedContinuityGateEnabled}
                            className="glass-input w-full rounded-xl px-4 py-3 transition-colors focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-400">拒绝阈值（1-10）</label>
                          <input
                            type="number"
                            step={0.1}
                            min={1}
                            max={10}
                            value={editedContinuityRejectScore}
                            onChange={(event) => setEditedContinuityRejectScore(parseFloat(event.target.value) || 4.9)}
                            disabled={!editedContinuityGateEnabled}
                            className="glass-input w-full rounded-xl px-4 py-3 transition-colors focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-400">自动修复次数</label>
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={editedContinuityMaxRepairAttempts}
                            onChange={(event) => setEditedContinuityMaxRepairAttempts(parseInt(event.target.value, 10) || 0)}
                            disabled={!editedContinuityGateEnabled}
                            className="glass-input w-full rounded-xl px-4 py-3 transition-colors focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>

                      <p className="text-xs text-zinc-500">
                        建议：通过阈值设为 6.5-7.2；拒绝阈值比通过阈值低至少 0.4；自动修复次数 1-2 次。
                      </p>
                    </div>
                  </div>
                </Card>

                <div className="flex justify-end">
                  <Button 
                    variant="primary"
                    onClick={handleSaveSettings}
                    isLoading={isSavingSettings}
                    disabled={isSavingSettings}
                    className="px-8"
                  >
                    保存设置
                  </Button>
                </div>

                <Card className="p-8 rounded-3xl space-y-8">
                  <div className="pt-0">
                    <h3 className="text-xl font-bold text-red-400 mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-red-500 rounded-full"/>
                      危险区域
                    </h3>
                    <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-white font-medium mb-1">删除小说</h4>
                        <p className="text-sm text-gray-400">
                          一旦删除，所有章节、素材和设定都将永久丢失，无法恢复。
                        </p>
                      </div>
                      <Button 
                        variant="danger"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="whitespace-nowrap"
                      >
                        删除小说
                      </Button>
                    </div>
                  </div>

                  {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                      <Card className="p-8 rounded-3xl max-w-md w-full mx-4 space-y-6 border-red-500/30 shadow-xl shadow-red-900/20 animate-scale-in">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-3xl">
                          ⚠️
                        </div>
                        <div className="text-center">
                          <h3 className="text-2xl font-bold text-white mb-2">确认删除</h3>
                          <p className="text-gray-400">
                            确定要删除《<span className="text-white font-bold">{novel.title}</span>》吗？<br/>
                            此操作<span className="text-red-400 font-bold">不可撤销</span>。
                          </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <Button 
                            variant="secondary"
                            onClick={() => setShowDeleteConfirm(false)}
                            className="flex-1"
                          >
                            取消
                          </Button>
                          <Button 
                            variant="danger"
                            onClick={handleDeleteNovel}
                            className="flex-1 shadow-lg shadow-red-500/30 bg-red-500 hover:bg-red-600 text-white"
                          >
                            确认删除
                          </Button>
                        </div>
                      </Card>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </div>

      <OutlineGeneratorModal
        isOpen={showOutlineGenerator}
        onClose={() => setShowOutlineGenerator(false)}
        novelId={novel?.id || ''}
        novel={novel}
        onGenerated={(data) => {
          const bestBlocks = pickBestOutlineBlocks({
            outlineChapters: data.outlineChapters,
            outlineDetailed: data.outlineDetailed,
            outlineRough: data.outlineRough,
          });
          const persistence = buildOutlinePersistencePayload(bestBlocks as OutlinePlanningNode[]);

          setNovel(prev => prev ? { ...prev, ...persistence } : null);
          setEditedOutline(persistence.outline);
          setOutlineNodes(bestBlocks as OutlineNode[]);
          setShowOutlineGenerator(false);
        }}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
      />
    </div>
  );
}
