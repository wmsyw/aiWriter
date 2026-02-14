'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
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
type DisplayTab = 'chapters' | 'outline' | 'workbench' | 'settings';
type OutlineMutationKind = 'rough' | 'detailed' | 'chapters';
type OutlineDeviationSeverity = 'healthy' | 'info' | 'warning' | 'critical';

const TAB_META: Record<DisplayTab, { label: string; icon: string; hint: string }> = {
  chapters: {
    label: '章节列表',
    icon: '📚',
    hint: '管理章节与创作进度',
  },
  outline: {
    label: '大纲规划',
    icon: '🗺️',
    hint: '分层规划主线与章节',
  },
  workbench: {
    label: '创作工坊',
    icon: '🛠️',
    hint: '素材、钩子与剧情推演',
  },
  settings: {
    label: '高级设置',
    icon: '⚙️',
    hint: '作品参数与流程门禁',
  },
};

const OUTLINE_MUTATION_LABELS: Record<OutlineMutationKind, string> = {
  rough: '粗纲',
  detailed: '细纲',
  chapters: '章节纲',
};

const OUTLINE_TARGET_CHAPTERS_PER_VOLUME = 120;
const OUTLINE_TARGET_CHAPTERS_PER_DETAILED_ARC = 20;
const OUTLINE_COVERAGE_WARNING_THRESHOLD = 0.6;
const OUTLINE_COVERAGE_CRITICAL_THRESHOLD = 0.35;
const OUTLINE_PROGRESS_WEIGHTS = {
  rough: 0.25,
  detailed: 0.35,
  chapter: 0.4,
} as const;

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
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
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
  const [regeneratingOutline, setRegeneratingOutline] = useState<OutlineMutationKind | null>(null);
  const [continuingOutline, setContinuingOutline] = useState<OutlineMutationKind | null>(null);
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
        ? `请续写该分卷细纲，仅输出新增事件簇节点，不要重复已有细纲。首个新增节点必须承接“${prevDetailedNode.title}”结尾；每个节点覆盖连续10-30章，并包含阶段目标、核心冲突、关键转折、结果变化与后续钩子。`
        : '请生成该分卷首批细纲节点，采用事件簇粒度（每节点覆盖连续10-30章），不要下钻到单章；先建立开端目标与主冲突，再推进转折与阶段钩子。';

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
        ? `请续写该细纲下的章节纲，仅输出新增章节节点。首章必须自然承接“${prevChapter.title}”结尾并推进主线；每个节点只对应1章，计划字数2000-3000字，需包含开场承接、冲突推进、阶段结果与章末钩子。`
        : '请生成该细纲的首批章节纲，每个节点只对应1章，计划字数2000-3000字；章节序列需形成连续节奏（开场引子→冲突升级→阶段转折），并确保每章有章末钩子。';

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
        targetWordsPerChapterMin: 2000,
        targetWordsPerChapterMax: 3000,
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
              targetWordsPerChapterMin: 2000,
              targetWordsPerChapterMax: 3000,
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

  const findSelectedNodes = (nodes: OutlineNode[]): OutlineNode[] => {
    const result: OutlineNode[] = [];
    for (const node of nodes) {
      if (selectedOutlineIds.has(node.id)) {
        result.push(node);
      }
      if (node.children?.length) {
        result.push(...findSelectedNodes(node.children));
      }
    }
    return result;
  };

  const collectDeletionNodes = (nodes: OutlineNode[], parentSelected = false): OutlineNode[] => {
    const result: OutlineNode[] = [];

    for (const node of nodes) {
      const currentSelected = parentSelected || selectedOutlineIds.has(node.id);
      if (currentSelected) {
        result.push(node);
        if (node.children?.length) {
          result.push(...collectDeletionNodes(node.children, true));
        }
        continue;
      }

      if (node.children?.length) {
        result.push(...collectDeletionNodes(node.children, false));
      }
    }

    return result;
  };

  const removeSelectedNodes = (nodes: OutlineNode[]): OutlineNode[] => {
    return nodes.reduce<OutlineNode[]>((acc, node) => {
      if (selectedOutlineIds.has(node.id)) {
        return acc;
      }

      const nextChildren = node.children?.length ? removeSelectedNodes(node.children) : undefined;
      acc.push({
        ...node,
        children: nextChildren && nextChildren.length > 0 ? nextChildren : undefined,
      });
      return acc;
    }, []);
  };

  const handleBatchRegenerate = async () => {
    if (!novel?.id || selectedOutlineIds.size === 0) return;

    const selectedNodes = findSelectedNodes(outlineNodes);
    
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

  const handleBatchDelete = async () => {
    if (!novel?.id || selectedOutlineIds.size === 0 || isOutlineMutating) return;

    const nodesToDelete = collectDeletionNodes(outlineNodes);
    if (nodesToDelete.length === 0) {
      setSelectedOutlineIds(new Set());
      return;
    }

    const levelStats = nodesToDelete.reduce(
      (acc, node) => {
        acc.total += 1;
        if (node.level === 'rough') acc.rough += 1;
        if (node.level === 'detailed') acc.detailed += 1;
        if (node.level === 'chapter') acc.chapter += 1;
        return acc;
      },
      { rough: 0, detailed: 0, chapter: 0, total: 0 }
    );

    setConfirmState({
      isOpen: true,
      title: '批量删除大纲节点',
      message: `将删除 ${levelStats.total} 个节点（粗纲 ${levelStats.rough}、细纲 ${levelStats.detailed}、章节 ${levelStats.chapter}）。删除后不可恢复，是否继续？`,
      confirmText: '确认删除',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));

        const nextOutline = removeSelectedNodes(outlineNodes);
        setOutlineNodes(nextOutline);

        if (nextOutline.length === 0) {
          await saveStructuredOutline([]);
        }

        setSelectedOutlineIds(new Set());
        setOutlineSelectionMode(false);
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
          targetWordsPerChapterMin: 2000,
          targetWordsPerChapterMax: 3000,
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

  const handleRegenerateOutline = async (type: OutlineMutationKind) => {
    if (!novel) return;
    
    const typeLabels = { rough: '粗纲', detailed: '细纲', chapters: '章节纲' };
    const hasExistingOutline = outlineNodes.length > 0;
    const impactHint =
      type === 'rough'
        ? '细纲和章节纲也会被重置。'
        : type === 'detailed'
          ? '章节纲也会被重置。'
          : '';
    
    setConfirmState({
      isOpen: true,
      title: `${hasExistingOutline ? '重新生成' : '开始生成'}${typeLabels[type]}`,
      message: hasExistingOutline
        ? `确定要重新生成${typeLabels[type]}吗？这将覆盖现有的${typeLabels[type]}内容。${impactHint}`
        : `将基于当前作品设定生成${typeLabels[type]}。${impactHint}`,
      confirmText: hasExistingOutline ? '确认重新生成' : '开始生成',
      variant: hasExistingOutline ? 'warning' : 'info',
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
              targetWordsPerChapterMin: 2000,
              targetWordsPerChapterMax: 3000,
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

  const handleContinueOutline = async (type: OutlineMutationKind) => {
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
          user_guidance: '请续写“下一卷”粗纲，只输出新增卷节点，不重写已有卷。保持粗纲粒度（单卷级，不得逐章拆解），承接前卷伏笔并升级主线矛盾，明确卷目标、3-6个阶段里程碑、关键伏笔与卷末钩子。',
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
            ? `请续写该分卷细纲，仅输出新增事件簇节点，不重复已有细纲；首个新增节点承接“${prevDetailed.title}”结尾。每个节点覆盖连续10-30章，包含阶段目标、核心冲突、关键转折、结果变化与后续钩子。`
            : '请为该分卷生成首批细纲节点，采用事件簇粒度（每节点覆盖连续10-30章），先建立开端目标与主冲突，再推进转折并预埋后续钩子。',
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
          targetWordsPerChapterMin: 2000,
          targetWordsPerChapterMax: 3000,
          parent_detailed_node: {
            id: targetEntry.detailedNode.id,
            title: targetEntry.detailedNode.title,
            content: targetEntry.detailedNode.content,
          },
          user_guidance: prevChapter
            ? `请续写章节纲，仅输出新增章节节点。首章自然承接上一章“${prevChapter.title}”结尾并推动主线；每个节点仅对应1章，计划字数2000-3000字，需包含开场承接、冲突推进、阶段结果与章末钩子。`
            : '请为该细纲生成首批章节纲，每个节点仅对应1章，计划字数2000-3000字；章节需要连贯推进，并确保每章有明确冲突与章末钩子。',
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
  const chapterTotal = chapters.length || 0;
  const approvedRate = chapterTotal > 0 ? Math.round((approvedCount / chapterTotal) * 100) : 0;
  const reviewRate = chapterTotal > 0 ? Math.round((reviewDoneCount / chapterTotal) * 100) : 0;
  const workflowHealthLabel = workflowAlertCount > 0 ? '待处理风险' : '流程健康';
  const workflowHealthValue = workflowAlertCount > 0 ? `${workflowAlertCount} 项` : '正常';
  const activeTabLabel = (TAB_META as Record<string, { label: string }>)[activeTab]?.label || '小说详情';
  const activeTabHint = (TAB_META as Record<string, { hint: string }>)[activeTab]?.hint || '管理当前作品与创作流程';
  const synopsisText = (novel.description || novel.theme || '').trim();
  const canToggleSynopsis = synopsisText.length > 120 || synopsisText.includes('\n');
  const outlineStage = novel.outlineStage === 'rough' || novel.outlineStage === 'detailed' || novel.outlineStage === 'chapters'
    ? novel.outlineStage
    : 'none';
  const outlineStageText = outlineStage === 'rough'
    ? '粗纲（单卷级）'
    : outlineStage === 'detailed'
      ? '细纲（事件簇级）'
      : outlineStage === 'chapters'
        ? '章节纲（单章级）'
        : '未分层';
  const outlineStageDescription = outlineStage === 'rough'
    ? '当前为单卷级蓝图，聚焦整卷主线、里程碑与卷末钩子（可覆盖百章级推进）。'
    : outlineStage === 'detailed'
      ? '细纲节点应覆盖连续多章（建议 10-30 章），用于承接粗纲并组织阶段冲突。'
      : outlineStage === 'chapters'
        ? '章节纲已细化到单章维度，建议每章计划字数 2000-3000 字。'
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
  const outlineMutationType = regeneratingOutline ?? continuingOutline;
  const outlineMutationMode = regeneratingOutline ? 'regenerate' : continuingOutline ? 'continue' : null;
  const outlineMutationText = outlineMutationType && outlineMutationMode
    ? `${outlineMutationMode === 'regenerate' ? '正在重建' : '正在续写'} ${OUTLINE_MUTATION_LABELS[outlineMutationType]}`
    : null;
  const canContinueDetailed = outlineMetrics.rough > 0;
  const canContinueChapters = outlineMetrics.detailed > 0;
  const outlineTargetChapterCount = (() => {
    const configuredChapterCount = toNonNegativeInt(novel.chapterCount, 0);
    if (configuredChapterCount > 0) {
      return configuredChapterCount;
    }

    const targetWordsInWan = toNumber(novel.targetWords, 0);
    if (targetWordsInWan > 0) {
      const derivedChapterCount = Math.round((targetWordsInWan * 10000) / 2500);
      return Math.max(1, derivedChapterCount);
    }

    return Math.max(chapterTotal, 100);
  })();
  const outlineTargetRoughCount = Math.max(
    1,
    Math.ceil(outlineTargetChapterCount / OUTLINE_TARGET_CHAPTERS_PER_VOLUME)
  );
  const outlineTargetDetailedCount = Math.max(
    outlineTargetRoughCount,
    Math.ceil(outlineTargetChapterCount / OUTLINE_TARGET_CHAPTERS_PER_DETAILED_ARC)
  );
  const outlineCoverage = {
    rough: Math.min(outlineMetrics.rough / outlineTargetRoughCount, 1),
    detailed: Math.min(outlineMetrics.detailed / outlineTargetDetailedCount, 1),
    chapter: Math.min(outlineMetrics.chapter / outlineTargetChapterCount, 1),
  };
  const outlineGap = {
    rough: Math.max(0, outlineTargetRoughCount - outlineMetrics.rough),
    detailed: Math.max(0, outlineTargetDetailedCount - outlineMetrics.detailed),
    chapter: Math.max(0, outlineTargetChapterCount - outlineMetrics.chapter),
  };
  const outlineProgressPercent = Math.round(
    (outlineCoverage.rough * OUTLINE_PROGRESS_WEIGHTS.rough +
      outlineCoverage.detailed * OUTLINE_PROGRESS_WEIGHTS.detailed +
      outlineCoverage.chapter * OUTLINE_PROGRESS_WEIGHTS.chapter) *
      100
  );
  const outlineDeviation = (() => {
    if (outlineMetrics.rough === 0) {
      return {
        severity: 'critical' as OutlineDeviationSeverity,
        title: '粗纲缺失',
        description: '尚未建立卷级主线，建议先补齐粗纲后再推进细纲与章节纲。',
        action: {
          mode: 'continue' as const,
          target: 'rough' as OutlineMutationKind,
          label: '立即续写粗纲',
          disabled: isOutlineMutating,
          isLoading: continuingOutline === 'rough',
        },
      };
    }

    if (outlineMetrics.detailed === 0) {
      return {
        severity: 'warning' as OutlineDeviationSeverity,
        title: '细纲不足',
        description: '当前还没有细纲节点，后续章节规划的连贯性会显著下降。',
        action: {
          mode: 'regenerate' as const,
          target: 'detailed' as OutlineMutationKind,
          label: '生成全部细纲',
          disabled: isOutlineMutating,
          isLoading: regeneratingOutline === 'detailed',
        },
      };
    }

    if (outlineMetrics.chapter === 0) {
      return {
        severity: 'warning' as OutlineDeviationSeverity,
        title: '章节纲不足',
        description: '细纲已存在但尚未落到单章，建议先生成章节纲以稳定写作节奏。',
        action: {
          mode: 'regenerate' as const,
          target: 'chapters' as OutlineMutationKind,
          label: '生成全部章节纲',
          disabled: isOutlineMutating,
          isLoading: regeneratingOutline === 'chapters',
        },
      };
    }

    if (outlineCoverage.chapter < OUTLINE_COVERAGE_CRITICAL_THRESHOLD) {
      return {
        severity: 'critical' as OutlineDeviationSeverity,
        title: '章节纲覆盖过低',
        description: `章节纲仍缺少约 ${outlineGap.chapter} 章，建议优先续写章节纲补齐主线推进。`,
        action: {
          mode: 'continue' as const,
          target: 'chapters' as OutlineMutationKind,
          label: '优先续写章节纲',
          disabled: isOutlineMutating || !canContinueChapters,
          isLoading: continuingOutline === 'chapters',
        },
      };
    }

    if (outlineCoverage.chapter < OUTLINE_COVERAGE_WARNING_THRESHOLD) {
      return {
        severity: 'warning' as OutlineDeviationSeverity,
        title: '章节纲存在缺口',
        description: `章节纲覆盖率 ${Math.round(outlineCoverage.chapter * 100)}%，建议继续追加章节节点。`,
        action: {
          mode: 'continue' as const,
          target: 'chapters' as OutlineMutationKind,
          label: '继续续写章节纲',
          disabled: isOutlineMutating || !canContinueChapters,
          isLoading: continuingOutline === 'chapters',
        },
      };
    }

    if (outlineCoverage.detailed < OUTLINE_COVERAGE_WARNING_THRESHOLD) {
      return {
        severity: 'info' as OutlineDeviationSeverity,
        title: '细纲仍可扩展',
        description: `细纲覆盖率 ${Math.round(outlineCoverage.detailed * 100)}%，补齐后可提升章节衔接稳定性。`,
        action: {
          mode: 'continue' as const,
          target: 'detailed' as OutlineMutationKind,
          label: '继续续写细纲',
          disabled: isOutlineMutating || !canContinueDetailed,
          isLoading: continuingOutline === 'detailed',
        },
      };
    }

    if (outlineCoverage.rough < OUTLINE_COVERAGE_WARNING_THRESHOLD) {
      return {
        severity: 'info' as OutlineDeviationSeverity,
        title: '粗纲可继续扩展',
        description: `当前粗纲覆盖率 ${Math.round(outlineCoverage.rough * 100)}%，可按卷继续追加主线蓝图。`,
        action: {
          mode: 'continue' as const,
          target: 'rough' as OutlineMutationKind,
          label: '继续续写粗纲',
          disabled: isOutlineMutating,
          isLoading: continuingOutline === 'rough',
        },
      };
    }

    return {
      severity: 'healthy' as OutlineDeviationSeverity,
      title: '结构健康',
      description: '当前分层覆盖率处于健康区间，可按章节节奏继续创作正文。',
      action: null,
    };
  })();
  const outlineDeviationTone = outlineDeviation.severity === 'critical'
    ? 'border-red-500/35 bg-red-500/12 text-red-100'
    : outlineDeviation.severity === 'warning'
      ? 'border-amber-500/35 bg-amber-500/12 text-amber-100'
      : outlineDeviation.severity === 'info'
        ? 'border-sky-500/35 bg-sky-500/12 text-sky-100'
        : 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100';
  const outlineDeviationButtonTone = outlineDeviation.severity === 'critical'
    ? 'border-red-500/45 bg-red-500/20 text-red-100 hover:bg-red-500/30'
    : outlineDeviation.severity === 'warning'
      ? 'border-amber-500/45 bg-amber-500/18 text-amber-100 hover:bg-amber-500/28'
      : outlineDeviation.severity === 'info'
        ? 'border-sky-500/45 bg-sky-500/18 text-sky-100 hover:bg-sky-500/26'
        : 'border-emerald-500/45 bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/26';
  const hookOverdueRate = workflowStats.unresolvedHooks > 0
    ? Math.round((workflowStats.overdueHooks / workflowStats.unresolvedHooks) * 100)
    : 0;
  const workbenchRiskCount = workflowStats.overdueHooks + workflowStats.pendingEntities + (blockingInfo.hasBlocking ? blockingInfo.count : 0);
  const workbenchRiskLabel = workbenchRiskCount > 0 ? `${workbenchRiskCount} 项待处理` : '运行平稳';

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
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[12%] h-72 w-72 rounded-full bg-emerald-500/12 blur-[110px]" />
        <div className="absolute top-1/3 -left-20 h-80 w-80 rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-amber-500/10 blur-[120px]" />
      </div>
      <div className="relative z-10 p-4 md:p-6 xl:p-8 max-w-[1540px] mx-auto space-y-7 animate-fade-in">
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
      
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 relative">
        <div className="rounded-3xl border border-zinc-800/75 bg-zinc-950/55 p-6 md:p-7 relative overflow-hidden shadow-[0_22px_70px_-40px_rgba(16,185,129,0.45)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_52%),radial-gradient(circle_at_20%_85%,rgba(14,165,233,0.15),transparent_56%)] pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
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
                  返回作品库
                </Link>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="default" className="bg-sky-500/15 text-sky-300 border-sky-500/25">
                    {novel?.type === 'long' ? '长篇小说' : '作品'}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/70 text-zinc-400 font-mono">
                    {novel.id.slice(0, 8)}
                  </Badge>
                  {novel.genre && (
                    <Badge variant="outline" className="text-zinc-300 border-zinc-700/70 bg-zinc-900/60">
                      {novel.genre}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`${
                      workflowAlertCount > 0
                        ? 'border-red-500/30 bg-red-500/12 text-red-300'
                        : 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300'
                    }`}
                  >
                    {workflowHealthLabel} · {workflowHealthValue}
                  </Badge>
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

                {synopsisText && (
                  <div className="mt-3 max-w-3xl">
                    <p
                      className={`text-zinc-400 leading-relaxed whitespace-pre-wrap transition-all ${
                        isSynopsisExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {synopsisText}
                    </p>
                    {canToggleSynopsis && (
                      <button
                        type="button"
                        onClick={() => setIsSynopsisExpanded((prev) => !prev)}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        {isSynopsisExpanded ? '收起简介' : '展开简介'}
                        <svg
                          className={`h-3 w-3 transition-transform ${isSynopsisExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3.5 py-3">
                    <div className="text-[11px] text-zinc-500">章节总数</div>
                    <div className="text-lg font-semibold text-zinc-100">{chapterTotal}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3.5 py-3">
                    <div className="text-[11px] text-zinc-500">累计字数</div>
                    <div className="text-lg font-semibold text-zinc-100">{totalWords.toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3.5 py-3">
                    <div className="text-[11px] text-zinc-500">评审覆盖</div>
                    <div className="text-lg font-semibold text-sky-300">{reviewRate}%</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3.5 py-3">
                    <div className="text-[11px] text-zinc-500">定稿完成</div>
                    <div className="text-lg font-semibold text-emerald-300">{approvedRate}%</div>
                  </div>
                </div>

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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M4 6h16M4 18h16" />
                    </svg>
                    当前视图：{activeTabLabel}
                  </span>
                </div>

                {novel.keywords && novel.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {novel.keywords.slice(0, 8).map((keyword) => (
                      <span key={keyword} className="text-xs px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-700/80 text-zinc-300">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative z-10 shrink-0 w-full sm:w-[230px] rounded-2xl border border-zinc-800/80 bg-zinc-900/75 p-3.5 space-y-2.5">
                <Button
                  variant="secondary"
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  }
                  className="w-full justify-between shadow-lg shadow-black/20"
                >
                  导出作品
                </Button>
                <div className="rounded-xl border border-zinc-800/80 bg-black/20 px-3 py-2.5">
                  <div className="text-[11px] text-zinc-500 mb-1">当前上下文</div>
                  <div className="text-sm text-zinc-200">{activeTabHint}</div>
                </div>

                {isExportOpen && (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={fadeIn}
                    className="absolute right-0 top-[calc(100%+8px)] w-48 glass-card rounded-xl overflow-hidden z-20 border border-zinc-700/70 shadow-xl shadow-black/50"
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
        </div>

        <aside className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-1 gap-3">
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/70">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-zinc-500">章节完成度</div>
              <div className="text-xs text-emerald-300 font-medium">{approvedRate}%</div>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${approvedRate}%` }} />
            </div>
            <div className="text-xs text-zinc-400">{approvedCount}/{chapterTotal || 0} 章定稿</div>
          </Card>
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/70">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-zinc-500">评审覆盖</div>
              <div className="text-xs text-sky-300 font-medium">{reviewRate}%</div>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${reviewRate}%` }} />
            </div>
            <div className="text-xs text-zinc-400">{reviewDoneCount}/{chapterTotal || 0} 章</div>
          </Card>
          <Card className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/70">
            <div className="text-xs text-zinc-500 mb-1">大纲阶段</div>
            <div className="text-sm font-semibold text-zinc-100 mb-1">{outlineStageText}</div>
            <div className="text-xs text-zinc-400 line-clamp-2">{outlineStageDescription}</div>
          </Card>
          <Card className={`p-4 rounded-2xl border ${workflowAlertCount > 0 ? 'border-red-500/35 bg-red-500/10' : 'border-zinc-800/80 bg-zinc-900/70'}`}>
            <div className="text-xs text-zinc-500 mb-1">{workflowHealthLabel}</div>
            <div className={`text-lg font-semibold ${workflowAlertCount > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
              {workflowHealthValue}
            </div>
            <div className="text-xs mt-1 text-zinc-400">逾期钩子 {workflowStats.overdueHooks || 0}</div>
          </Card>
        </aside>
      </div>

      <div className="space-y-5">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
          <div className="sticky top-3 z-20 space-y-3">
            <TabsList variant="pills" className="overflow-x-auto no-scrollbar mask-linear-fade w-fit max-w-full justify-start border border-zinc-800/80 bg-zinc-900/75 p-1 rounded-2xl shadow-lg shadow-black/25 backdrop-blur">
              {tabs.map((tab) => {
                const meta = TAB_META[tab as DisplayTab];
                return (
                  <TabsTrigger key={tab} value={tab} className="group relative min-h-12 gap-2.5 px-3.5 md:px-4 py-1.5 rounded-xl text-left">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm">
                      {meta.icon}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-zinc-100">{meta.label}</span>
                      <span className="hidden xl:block text-[11px] text-zinc-400 leading-tight">{meta.hint}</span>
                    </span>

                    {tab === 'workbench' && (workflowStats.overdueHooks > 0 || blockingInfo.hasBlocking) && (
                      <Badge variant="error" size="sm" className="ml-1 animate-pulse">
                        {(workflowStats.overdueHooks || 0) + (blockingInfo.hasBlocking ? blockingInfo.count : 0)}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <Card className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3 md:px-5 md:py-3.5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">当前工作区</div>
                  <div className="mt-1 text-base font-semibold text-zinc-100 truncate">{activeTabLabel}</div>
                  <p className="text-xs text-zinc-400 mt-0.5">{activeTabHint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/60 text-zinc-300 px-2.5 py-1">
                    章节 {chapterTotal}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/60 text-zinc-300 px-2.5 py-1">
                    评审 {reviewRate}%
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/60 text-zinc-300 px-2.5 py-1">
                    定稿 {approvedRate}%
                  </Badge>
                </div>
              </div>
            </Card>
          </div>

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

                          <div className="flex flex-col gap-3 2xl:min-w-[480px]">
                            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/45 p-3 space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">批量操作</div>
                                {outlineSelectionMode && (
                                  <Badge variant="outline" className="border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                                    已选 {selectedOutlineIds.size}
                                  </Badge>
                                )}
                              </div>
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
                                      onClick={handleBatchDelete}
                                      disabled={selectedOutlineIds.size === 0 || isOutlineMutating}
                                      className="h-8 text-xs border border-red-500/30 bg-red-500/12 text-red-200 hover:bg-red-500/22 hover:text-red-100 disabled:opacity-50"
                                    >
                                      批量删除
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
                            </div>

                            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3 space-y-2.5">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-300/80">续写追加</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleContinueOutline('rough')}
                                  isLoading={continuingOutline === 'rough'}
                                  disabled={isOutlineMutating}
                                  className="h-8 border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
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
                                  disabled={isOutlineMutating || !canContinueDetailed}
                                  className="h-8 border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
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
                                  disabled={isOutlineMutating || !canContinueChapters}
                                  className="h-8 border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
                                  title="承接最近章节，追加章节纲"
                                >
                                  续写章节
                                </Button>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-700/75 bg-zinc-950/45 p-3 space-y-2.5">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">阶段重建</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRegenerateOutline('rough')}
                                  disabled={isOutlineMutating}
                                  className="h-8 border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
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
                                    className="h-8 border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
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
                                    className="h-8 border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
                                    title="重新生成章节"
                                  >
                                    重置章节
                                  </Button>
                                )}
                              </div>
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

                        <div className="rounded-2xl border border-zinc-800/75 bg-zinc-950/35 p-3 space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500">大纲目标覆盖率</span>
                            <span className="font-medium text-emerald-300">{outlineProgressPercent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                              style={{ width: `${outlineProgressPercent}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] text-zinc-400">
                              粗纲：{outlineMetrics.rough}/{outlineTargetRoughCount} 卷
                            </div>
                            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] text-zinc-400">
                              细纲：{outlineMetrics.detailed}/{outlineTargetDetailedCount} 组
                            </div>
                            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] text-zinc-400">
                              章节纲：{outlineMetrics.chapter}/{outlineTargetChapterCount} 章
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                            <span>当前阶段：{outlineStageText}</span>
                            <span>总节点 {outlineMetrics.total}</span>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            估算口径：粗纲按每卷约 100-150 章，细纲按每组约 10-30 章。
                          </div>
                          <div className={`rounded-lg border px-2.5 py-2 ${outlineDeviationTone}`}>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold tracking-wide">{outlineDeviation.title}</div>
                                <div className="mt-0.5 text-[11px] opacity-90">{outlineDeviation.description}</div>
                              </div>
                              {outlineDeviation.action && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (outlineDeviation.action?.mode === 'continue') {
                                      handleContinueOutline(outlineDeviation.action.target);
                                    } else {
                                      handleRegenerateOutline(outlineDeviation.action.target);
                                    }
                                  }}
                                  disabled={outlineDeviation.action.disabled}
                                  isLoading={outlineDeviation.action.isLoading}
                                  className={`h-8 shrink-0 border px-3 text-[11px] ${outlineDeviationButtonTone}`}
                                >
                                  {outlineDeviation.action.label}
                                </Button>
                              )}
                            </div>
                          </div>
                          {outlineMutationText && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1.5 text-xs text-emerald-200">
                              {outlineMutationText}，请稍候...
                            </div>
                          )}
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
                            emptyDescription={isOutlineFiltered ? '请调整筛选条件或清空关键词后重试。' : '请使用上方续写或阶段重建操作生成大纲。'}
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
                          <p className="text-xs text-gray-400">按分层规则逐步生成，避免层级错位与信息跳跃</p>
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
                        onClick={() => handleRegenerateOutline('rough')}
                        disabled={isOutlineMutating}
                        leftIcon={
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        }
                        className="px-8 py-6 text-lg shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        开始生成粗纲
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
                <div className="rounded-2xl border border-zinc-800/75 bg-zinc-900/70 px-4 py-4 md:px-5 md:py-5 space-y-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-3">
                        章节列表
                        {blockingInfo.hasBlocking && (
                          <Badge variant="error" className="px-2 py-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                            生成被阻塞
                          </Badge>
                        )}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        按章节顺序管理正文，支持快速进入编辑、查看流程进度与字数密度。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/65 text-zinc-300 px-2.5 py-1">
                        总章节 {chapterTotal}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/65 text-zinc-300 px-2.5 py-1">
                        待评审 {Math.max(chapterTotal - reviewDoneCount, 0)}
                      </Badge>
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/12 text-emerald-300 px-2.5 py-1">
                        已定稿 {approvedCount}
                      </Badge>
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
                  </div>

                  {blockingInfo.hasBlocking && (
                    <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
                      当前存在待确认实体，新增章节已被临时阻断。请先到工坊内处理实体确认。
                    </div>
                  )}
                </div>

                {chapters.length > 0 ? (
                  <div 
                    ref={parentRef}
                    className="h-[72vh] overflow-y-auto rounded-2xl border border-zinc-800/70 bg-zinc-950/35 p-4 custom-scrollbar"
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
              <div className="space-y-5">
                <Card className="rounded-3xl border border-zinc-800/80 bg-zinc-900/55 p-5 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">工坊运行面板</div>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-100">创作资源与风险总览</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        聚合素材、钩子、实体确认与剧情推演状态，减少跨页面切换成本。
                      </p>
                    </div>
                    <Badge
                      variant={workbenchRiskCount > 0 ? 'error' : 'success'}
                      className="w-fit px-3 py-1 text-xs"
                    >
                      {workbenchRiskLabel}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/35 px-3 py-2.5">
                      <div className="text-[11px] text-zinc-500">未解决钩子</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-100">{workflowStats.unresolvedHooks}</div>
                    </div>
                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5">
                      <div className="text-[11px] text-red-200/70">逾期钩子</div>
                      <div className="mt-1 text-lg font-semibold text-red-200">{workflowStats.overdueHooks}</div>
                    </div>
                    <div className={`rounded-xl border px-3 py-2.5 ${blockingInfo.hasBlocking ? 'border-red-500/30 bg-red-500/[0.08]' : 'border-zinc-800/80 bg-zinc-950/35'}`}>
                      <div className="text-[11px] text-zinc-500">待确认实体</div>
                      <div className={`mt-1 text-lg font-semibold ${blockingInfo.hasBlocking ? 'text-red-200' : 'text-zinc-100'}`}>
                        {workflowStats.pendingEntities}
                      </div>
                    </div>
                    <div className={`rounded-xl border px-3 py-2.5 ${blockingInfo.hasBlocking ? 'border-red-500/30 bg-red-500/[0.08]' : 'border-zinc-800/80 bg-zinc-950/35'}`}>
                      <div className="text-[11px] text-zinc-500">阻塞生成</div>
                      <div className={`mt-1 text-lg font-semibold ${blockingInfo.hasBlocking ? 'text-red-200' : 'text-emerald-300'}`}>
                        {blockingInfo.hasBlocking ? blockingInfo.count : 0}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    钩子逾期占比：{hookOverdueRate}% {workflowStats.unresolvedHooks === 0 ? '（当前无待处理钩子）' : ''}
                  </div>
                </Card>

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
                      <div className="text-xl font-bold text-amber-300">{hookOverdueRate}%</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">逾期占比</div>
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
    </div>
  );
}
