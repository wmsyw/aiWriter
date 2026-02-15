'use client';

import { useState, useEffect, use, useMemo, useRef } from 'react';
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
import {
  isActiveJobStatus,
  isTerminalJobStatus,
  parseJobResponse,
  type JobQueueStatus,
} from '@/src/shared/jobs';
import { useJobsQueue } from '@/app/lib/hooks/useJobsQueue';
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
import { useToast } from '@/app/components/ui/Toast';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent, 
  Button, 
  Card, 
  Badge, 
  Skeleton,
  Input,
  Textarea,
  Checkbox,
  SearchInput,
  InlineInput,
} from '@/app/components/ui';
import Modal, { ConfirmModal } from '@/app/components/ui/Modal';
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
  content?: string;
  updatedAt: string;
  order: number;
  generationStage?: 'draft' | 'generated' | 'reviewed' | 'humanized' | 'approved' | 'completed';
  reviewFeedback?: ReviewFeedback;
  outlineAdherence?: number;
  lastReviewAt?: string;
}

interface ChapterListResponse {
  chapters?: Chapter[];
}

interface ChapterMutationResponse {
  chapter?: Chapter;
  error?: string;
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

interface WorkflowStats {
  unresolvedHooks: number;
  overdueHooks: number;
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
type ContinueSelectionType = 'detailed' | 'chapters';
type ChapterStage = (typeof WORKFLOW_STEPS)[number]['id'];
type ChapterStageFilter = ChapterStage | 'all';

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

const CHAPTER_STAGE_META: Record<
  ChapterStage,
  { label: string; badgeClassName: string; indicatorClassName: string }
> = {
  draft: {
    label: '草稿',
    badgeClassName: 'border-zinc-700/80 bg-zinc-900/70 text-zinc-300',
    indicatorClassName: 'text-zinc-300',
  },
  generated: {
    label: '已生成',
    badgeClassName: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200',
    indicatorClassName: 'text-cyan-200',
  },
  reviewed: {
    label: '已审查',
    badgeClassName: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
    indicatorClassName: 'text-sky-200',
  },
  humanized: {
    label: '已润色',
    badgeClassName: 'border-violet-500/35 bg-violet-500/10 text-violet-200',
    indicatorClassName: 'text-violet-200',
  },
  approved: {
    label: '已定稿',
    badgeClassName: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
    indicatorClassName: 'text-emerald-200',
  },
};

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

function normalizeChapterStage(stage?: Chapter['generationStage']): ChapterStage {
  if (stage === 'completed') return 'approved';
  return stage && stage in CHAPTER_STAGE_META ? stage : 'draft';
}

async function fetchChapterListNoStore(novelId: string): Promise<Chapter[] | null> {
  try {
    const res = await fetch(`/api/novels/${novelId}/chapters`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as ChapterListResponse;
    return Array.isArray(data.chapters) ? data.chapters : [];
  } catch (error) {
    console.error('Failed to fetch chapter list:', error);
    return null;
  }
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
  const { toast } = useToast();
  
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'outline' | 'workbench' | 'settings'>('chapters');
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
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats>({ unresolvedHooks: 0, overdueHooks: 0 });
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
  const [chapterSearchKeyword, setChapterSearchKeyword] = useState('');
  const [chapterStageFilter, setChapterStageFilter] = useState<ChapterStageFilter>('all');
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const { jobs: queueJobs } = useJobsQueue({ preferSse: true });
  const chapterGenerateJobStatusRef = useRef<Map<string, JobQueueStatus>>(new Map());
  const [continueSelectionState, setContinueSelectionState] = useState<{
    isOpen: boolean;
    type: ContinueSelectionType | null;
    roughId: string;
    detailedId: string;
  }>({
    isOpen: false,
    type: null,
    roughId: '',
    detailedId: '',
  });

  const filteredChapters = useMemo(() => {
    const normalizedKeyword = chapterSearchKeyword.trim().toLowerCase();

    return chapters.filter((chapter) => {
      const stage = normalizeChapterStage(chapter.generationStage);
      const stageMatched = chapterStageFilter === 'all' || stage === chapterStageFilter;
      if (!stageMatched) return false;

      if (!normalizedKeyword) return true;

      const searchText = `${chapter.order + 1} ${chapter.title} ${chapter.wordCount || 0} ${CHAPTER_STAGE_META[stage].label}`.toLowerCase();
      return searchText.includes(normalizedKeyword);
    });
  }, [chapters, chapterSearchKeyword, chapterStageFilter]);

  const chapterIdsSet = useMemo(() => new Set(chapters.map((chapter) => chapter.id)), [chapters]);

  const chapterGenerateJobs = useMemo(
    () =>
      queueJobs.filter((job) => (
        job.type === 'CHAPTER_GENERATE' &&
        typeof job.input.chapterId === 'string' &&
        chapterIdsSet.has(job.input.chapterId)
      )),
    [chapterIdsSet, queueJobs]
  );

  const activeChapterGenerateJobByChapterId = useMemo(() => {
    const activeJobs = new Map<string, (typeof chapterGenerateJobs)[number]>();
    chapterGenerateJobs.forEach((job) => {
      if (!isActiveJobStatus(job.status)) return;
      const chapterId = job.input.chapterId as string;
      const existing = activeJobs.get(chapterId);
      if (!existing) {
        activeJobs.set(chapterId, job);
        return;
      }
      if (new Date(job.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        activeJobs.set(chapterId, job);
      }
    });
    return activeJobs;
  }, [chapterGenerateJobs]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredChapters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160,
    overscan: 5,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [novelRes, chaptersRes, hooksReportRes] = await Promise.all([
          fetch(`/api/novels/${id}`),
          fetch(`/api/novels/${id}/chapters`, { cache: 'no-store' }),
          fetch(`/api/novels/${id}/hooks/report`),
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
          const chaptersData = (await chaptersRes.json()) as ChapterListResponse;
          setChapters(Array.isArray(chaptersData.chapters) ? chaptersData.chapters : []);
        }

        if (hooksReportRes.ok) {
          const hooksData = await hooksReportRes.json();
          setWorkflowStats(prev => ({
            ...prev,
            unresolvedHooks: hooksData.stats?.unresolvedCount || 0,
            overdueHooks: hooksData.stats?.overdueCount || 0,
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

  useEffect(() => {
    const statusMap = chapterGenerateJobStatusRef.current;
    const currentJobIds = new Set<string>();

    chapterGenerateJobs.forEach((job) => {
      currentJobIds.add(job.id);
      const previousStatus = statusMap.get(job.id);

      if (!previousStatus) {
        statusMap.set(job.id, job.status);
        return;
      }

      if (previousStatus !== job.status && isTerminalJobStatus(job.status)) {
        const chapterId = typeof job.input.chapterId === 'string' ? job.input.chapterId : '';
        const chapterMeta = chapters.find((chapter) => chapter.id === chapterId) || null;
        const chapterLabel = chapterMeta ? `第 ${chapterMeta.order + 1} 章` : '目标章节';

        if (job.status === 'succeeded') {
          void (async () => {
            try {
              const latestChapters = await fetchChapterListNoStore(id);
              if (latestChapters) {
                setChapters([...latestChapters].sort((a, b) => a.order - b.order));
              }
            } catch (error) {
              console.error('Failed to refresh chapters after generation:', error);
            }
          })();
          toast({
            variant: 'success',
            description: `${chapterLabel}草稿生成完成，可进入编辑页继续打磨`,
          });
        } else if (job.status === 'failed') {
          const message = job.error?.trim() || `${chapterLabel}生成失败，请稍后重试`;
          setError(message);
          toast({
            variant: 'error',
            description: message,
          });
        } else if (job.status === 'canceled') {
          toast({
            variant: 'warning',
            description: `${chapterLabel}生成任务已取消`,
          });
        }
      }

      statusMap.set(job.id, job.status);
    });

    statusMap.forEach((_, jobId) => {
      if (!currentJobIds.has(jobId)) {
        statusMap.delete(jobId);
      }
    });
  }, [chapterGenerateJobs, chapters, id, toast]);

  useEffect(() => {
    if (!generatingChapterId) return;

    if (activeChapterGenerateJobByChapterId.has(generatingChapterId)) {
      return;
    }

    const relatedJob = chapterGenerateJobs.find(
      (job) => typeof job.input.chapterId === 'string' && job.input.chapterId === generatingChapterId
    );

    if (relatedJob && isTerminalJobStatus(relatedJob.status)) {
      setGeneratingChapterId(null);
    }
  }, [activeChapterGenerateJobByChapterId, chapterGenerateJobs, generatingChapterId]);

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

  const handleCancelTitleEdit = () => {
    setEditedTitle(novel?.title || '');
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
            setChapters((prev) => prev.filter((chapter) => chapter.id !== chapterId));
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
        const data = (await res.json()) as ChapterMutationResponse;
        if (data.chapter) {
          const createdChapter = data.chapter;
          setChapters((prev) => [...prev, createdChapter].sort((a, b) => a.order - b.order));
        } else {
          const latestChapters = await fetchChapterListNoStore(id);
          if (latestChapters) {
            setChapters([...latestChapters].sort((a, b) => a.order - b.order));
          }
        }
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

  const collectChapterOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] => {
    const result: OutlineNode[] = [];
    const walk = (items: OutlineNode[]) => {
      items.forEach((item) => {
        if (item.level === 'chapter') {
          result.push(item);
        }
        if (item.children?.length) {
          walk(item.children);
        }
      });
    };
    walk(nodes);
    return result;
  };

  const isDefaultChapterTitle = (title: string) => /^第\s*\d+\s*章$/.test(title.trim());

  const syncOutlineChaptersToList = async (nextOutlineNodes: OutlineNode[]) => {
    if (!novel?.id) return;

    const chapterNodes = collectChapterOutlineNodes(nextOutlineNodes);
    if (chapterNodes.length === 0) return;

    try {
      const latestFromServer = await fetchChapterListNoStore(novel.id);
      const latestChapters = latestFromServer ?? chapters;
      const orderedChapters = [...latestChapters].sort((a, b) => a.order - b.order);
      const chapterByOrder = new Map<number, Chapter>(orderedChapters.map((chapter) => [chapter.order, chapter]));

      const chaptersToCreate: Array<{ title: string; order: number }> = [];
      const chaptersToRename: Array<{ id: string; title: string }> = [];

      chapterNodes.forEach((chapterNode, index) => {
        const nextTitle = chapterNode.title?.trim() || `第 ${index + 1} 章`;
        const existingChapter = chapterByOrder.get(index);

        if (!existingChapter) {
          chaptersToCreate.push({ title: nextTitle, order: index });
          return;
        }

        const canAutoRename =
          isDefaultChapterTitle(existingChapter.title || '') ||
          !existingChapter.content?.trim() ||
          existingChapter.generationStage === 'draft';

        if (canAutoRename && existingChapter.title !== nextTitle) {
          chaptersToRename.push({ id: existingChapter.id, title: nextTitle });
        }
      });

      if (chaptersToCreate.length === 0 && chaptersToRename.length === 0) {
        if (latestFromServer) {
          setChapters([...latestFromServer].sort((a, b) => a.order - b.order));
        }
        return;
      }

      for (const chapterInput of chaptersToCreate) {
        const createRes = await fetch(`/api/novels/${novel.id}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: chapterInput.title,
            order: chapterInput.order,
          }),
        });

        if (!createRes.ok) {
          const createErr = await createRes.json().catch(() => ({}));
          throw new Error(createErr.error || '创建章节失败');
        }

        const createPayload = (await createRes.json().catch(() => ({}))) as ChapterMutationResponse;
        if (createPayload.chapter) {
          chapterByOrder.set(createPayload.chapter.order, createPayload.chapter);
        }
      }

      if (chaptersToRename.length > 0) {
        await Promise.all(
          chaptersToRename.map(async ({ id: chapterId, title }) => {
            const renameRes = await fetch(`/api/novels/${novel.id}/chapters/${chapterId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title }),
            });
            if (!renameRes.ok) {
              const renameErr = await renameRes.json().catch(() => ({}));
              throw new Error(renameErr.error || '更新章节标题失败');
            }

            const renamePayload = (await renameRes.json().catch(() => ({}))) as ChapterMutationResponse;
            if (renamePayload.chapter) {
              chapterByOrder.set(renamePayload.chapter.order, renamePayload.chapter);
              return;
            }

            const fallbackChapter = Array.from(chapterByOrder.values()).find(
              (chapter) => chapter.id === chapterId
            );
            if (fallbackChapter) {
              chapterByOrder.set(fallbackChapter.order, { ...fallbackChapter, title });
            }
          })
        );
      }

      const optimisticChapters = [...chapterByOrder.values()].sort((a, b) => a.order - b.order);
      if (optimisticChapters.length > 0) {
        setChapters(optimisticChapters);
      }

      const confirmedChapters = await fetchChapterListNoStore(novel.id);
      if (confirmedChapters) {
        setChapters([...confirmedChapters].sort((a, b) => a.order - b.order));
      }
    } catch (error) {
      console.error('Failed to sync chapter outlines to chapter list', error);
      setError('章节纲已生成，但同步章节列表失败，请重试');
    }
  };

  const appendNodeChildren = (
    targetId: string,
    newChildren: OutlineNode[],
    baseNodes: OutlineNode[] = outlineNodes,
  ): OutlineNode[] => {
    const existingIds = collectNodeIds(baseNodes);
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

    const nextNodes = appendRecursive(baseNodes);
    setOutlineNodes(nextNodes);
    return nextNodes;
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

  const queueChapterGenerateJob = async (chapterId: string) => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'CHAPTER_GENERATE',
        input: { chapterId },
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error
        ? (Array.isArray(errorData.error)
          ? errorData.error.map((e: { message?: string }) => e.message).join(', ')
          : String(errorData.error))
        : '章节任务创建失败';
      throw new Error(errorMsg);
    }

    const payload = await res.json();
    const job = parseJobResponse(payload);
    if (!job) {
      throw new Error('章节任务创建失败：返回数据异常');
    }

    return job;
  };

  const getChapterGenerationBlockReason = (
    targetChapter: Chapter,
    chapterSource: Chapter[] = chapters
  ): string | null => {
    const targetStage = targetChapter.generationStage || 'draft';
    if (targetStage !== 'draft') {
      return `第 ${targetChapter.order + 1} 章当前阶段为「${CHAPTER_STAGE_META[normalizeChapterStage(targetStage)].label}」，无需重复生成`;
    }

    const ordered = [...chapterSource].sort((a, b) => a.order - b.order);
    const prevIncomplete = ordered.find(
      (chapter) => chapter.order < targetChapter.order && chapter.generationStage !== 'completed'
    );
    if (prevIncomplete) {
      return `请先完成第 ${prevIncomplete.order + 1} 章，再生成第 ${targetChapter.order + 1} 章`;
    }

    return null;
  };

  const handleGenerateChapterDraft = async (targetChapter: Chapter | null) => {
    if (!targetChapter) return;
    if (generatingChapterId || activeChapterGenerateJobByChapterId.size > 0) {
      const runningChapter = chapters.find(
        (chapter) => generatingChapterId === chapter.id || activeChapterGenerateJobByChapterId.has(chapter.id)
      );
      const message = runningChapter
        ? `第 ${runningChapter.order + 1} 章正在生成中，请稍候再试`
        : '当前有章节正在生成中，请稍候再试';
      setError(message);
      return;
    }

    const blockReason = getChapterGenerationBlockReason(targetChapter);
    if (blockReason) {
      setError(blockReason);
      return;
    }

    setGeneratingChapterId(targetChapter.id);
    setError(null);

    try {
      await queueChapterGenerateJob(targetChapter.id);
      toast({
        variant: 'info',
        description: `第 ${targetChapter.order + 1} 章已加入生成队列，稍后将自动刷新状态`,
      });
    } catch (error) {
      console.error('Failed to queue chapter generation', error);
      const message = error instanceof Error ? error.message : '章节生成失败，请稍后重试';
      setError(message);
      toast({
        variant: 'error',
        description: message,
      });
      setGeneratingChapterId(null);
    }
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

  const updateNodeChildren = (
    id: string,
    children: OutlineNode[],
    baseNodes: OutlineNode[] = outlineNodes,
  ): OutlineNode[] => {
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
    const nextNodes = updateRecursive(baseNodes);
    setOutlineNodes(nextNodes);
    return nextNodes;
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
        setError('未解析到细纲节点，请重试');
      }
    } catch (error) {
      console.error('Failed to generate detailed outline', error);
      setError('生成细纲失败，请重试');
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
        const nextOutlineNodes = updateNodeChildren(node.id, normalizedChildren);
        await syncOutlineChaptersToList(nextOutlineNodes);
      } else {
        setError('未解析到章节纲节点，请重试');
      }
    } catch (error) {
      console.error('Failed to generate chapters', error);
      setError('生成章节失败，请重试');
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
              const nextOutlineNodes = updateChapterNode(outlineNodes);
              setOutlineNodes(nextOutlineNodes);
              await syncOutlineChaptersToList(nextOutlineNodes);
            }
          }
        } catch (error) {
          console.error('Failed to regenerate node', error);
          setError('重新生成失败，请重试');
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
          const nextOutlineNodes = updateChapterNode(outlineNodes);
          setOutlineNodes(nextOutlineNodes);
          await syncOutlineChaptersToList(nextOutlineNodes);
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
            const nextOutlineNodes = normalized.blocks as OutlineNode[];
            setOutlineNodes(nextOutlineNodes);
            setNovel(prev => prev ? { ...prev, ...persistence } : null);
            await syncOutlineChaptersToList(nextOutlineNodes);
          }
          
        } catch (error) {
          console.error(`Failed to regenerate ${type} outline`, error);
          setError(`重新生成${typeLabels[type]}失败，请重试`);
        } finally {
          setRegeneratingOutline(null);
        }
      },
    });
  };

  const buildDetailedEntries = () => {
    const roughNodes = outlineNodes.filter((node) => node.level === 'rough');
    return roughNodes.flatMap((roughNode) =>
      (roughNode.children || [])
        .filter((detailedNode) => detailedNode.level === 'detailed')
        .map((detailedNode) => ({
          roughNode,
          detailedNode,
        }))
    );
  };

  const openContinueSelectionModal = (type: ContinueSelectionType) => {
    const roughNodes = outlineNodes.filter((node) => node.level === 'rough');
    const detailedEntries = buildDetailedEntries();

    if (type === 'detailed') {
      const targetRough = roughNodes[roughNodes.length - 1];
      if (!targetRough) {
        setError('请先生成粗纲后再续写细纲');
        return;
      }
      setContinueSelectionState({
        isOpen: true,
        type,
        roughId: targetRough.id,
        detailedId: '',
      });
      return;
    }

    const targetEntry = detailedEntries[detailedEntries.length - 1];
    if (!targetEntry) {
      setError('请先生成细纲后再续写章节纲');
      return;
    }
    setContinueSelectionState({
      isOpen: true,
      type,
      roughId: targetEntry.roughNode.id,
      detailedId: targetEntry.detailedNode.id,
    });
  };

  const closeContinueSelectionModal = () => {
    setContinueSelectionState({
      isOpen: false,
      type: null,
      roughId: '',
      detailedId: '',
    });
  };

  const handleContinueOutline = async (
    type: OutlineMutationKind,
    options?: { roughId?: string; detailedId?: string },
  ) => {
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
        const targetRough = options?.roughId
          ? roughNodes.find((node) => node.id === options.roughId)
          : roughNodes[roughNodes.length - 1];
        if (!targetRough) {
          throw new Error('未找到目标粗纲，请重新选择后再续写细纲');
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
        const detailedEntries = buildDetailedEntries();
        const targetEntry = options?.detailedId
          ? detailedEntries.find((entry) => entry.detailedNode.id === options.detailedId)
          : detailedEntries[detailedEntries.length - 1];
        if (!targetEntry) {
          throw new Error('未找到目标细纲，请重新选择后再续写章节纲');
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

        const nextOutlineNodes = appendNodeChildren(targetEntry.detailedNode.id, generated);
        await syncOutlineChaptersToList(nextOutlineNodes);
      }
    } catch (error) {
      console.error('Failed to continue outline', error);
      setError(error instanceof Error ? error.message : '续写失败，请重试');
    } finally {
      setContinuingOutline(null);
    }
  };

  const handleConfirmContinueSelection = async () => {
    const { type, roughId, detailedId } = continueSelectionState;
    if (!type) return;

    if (type === 'detailed') {
      if (!roughId) {
        setError('请选择续写细纲的粗纲目标');
        return;
      }
      closeContinueSelectionModal();
      await handleContinueOutline('detailed', { roughId });
      return;
    }

    if (!detailedId) {
      setError('请选择续写章节纲的细纲目标');
      return;
    }
    closeContinueSelectionModal();
    await handleContinueOutline('chapters', { detailedId });
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
  const approvedCount = chapters.filter((c) => c.generationStage === 'approved' || c.generationStage === 'completed').length;
  const reviewDoneCount = chapters.filter((c) => (
    c.generationStage === 'reviewed' ||
    c.generationStage === 'humanized' ||
    c.generationStage === 'approved' ||
    c.generationStage === 'completed'
  )).length;
  const workflowAlertCount = workflowStats.overdueHooks || 0;
  const chapterTotal = chapters.length || 0;
  const approvedRate = chapterTotal > 0 ? Math.round((approvedCount / chapterTotal) * 100) : 0;
  const reviewRate = chapterTotal > 0 ? Math.round((reviewDoneCount / chapterTotal) * 100) : 0;
  const filteredChapterTotal = filteredChapters.length;
  const hiddenChapterCount = Math.max(chapterTotal - filteredChapterTotal, 0);
  const avgWordsPerChapter = chapterTotal > 0 ? Math.round(totalWords / chapterTotal) : 0;
  const filteredWordTotal = filteredChapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);
  const latestChapterDate =
    chapterTotal > 0
      ? new Date(
          chapters.reduce((latest, chapter) => {
            const current = new Date(chapter.updatedAt).getTime();
            return current > latest ? current : latest;
          }, 0)
        ).toLocaleDateString()
      : null;
  const chapterStageSummary = WORKFLOW_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    count: chapters.filter((chapter) => normalizeChapterStage(chapter.generationStage) === step.id).length,
  }));
  const isAnyChapterGenerating =
    generatingChapterId !== null || activeChapterGenerateJobByChapterId.size > 0;
  const orderedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const nextDraftChapter = orderedChapters.find((chapter) => (chapter.generationStage || 'draft') === 'draft') || null;
  const nextDraftBlockReasonBase = nextDraftChapter
    ? getChapterGenerationBlockReason(nextDraftChapter, orderedChapters)
    : '暂无可生成章节';
  const nextDraftBlockReason = isAnyChapterGenerating
    ? '当前有章节正在生成，请稍候'
    : nextDraftBlockReasonBase;
  const generatingChapter = generatingChapterId
    ? chapters.find((chapter) => chapter.id === generatingChapterId) || null
    : chapters.find((chapter) => activeChapterGenerateJobByChapterId.has(chapter.id)) || null;
  const workflowHealthLabel = workflowAlertCount > 0 ? '待处理风险' : '流程健康';
  const workflowHealthValue = workflowAlertCount > 0 ? `${workflowAlertCount} 项` : '正常';
  const activeTabLabel = (TAB_META as Record<string, { label: string }>)[activeTab]?.label || '小说详情';
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
  const workbenchRiskCount = workflowStats.overdueHooks;
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

  const continueRoughOptions = outlineNodes
    .filter((node) => node.level === 'rough')
    .map((roughNode, index) => ({
      id: roughNode.id,
      label: `${index + 1}. ${roughNode.title || `粗纲 ${index + 1}`}`,
      detailedCount: roughNode.children?.length || 0,
    }));
  const continueDetailedOptions = outlineNodes.flatMap((roughNode, roughIndex) =>
    (roughNode.children || [])
      .filter((detailedNode) => detailedNode.level === 'detailed')
      .map((detailedNode, detailedIndex) => ({
        id: detailedNode.id,
        roughId: roughNode.id,
        label: `${roughIndex + 1}-${detailedIndex + 1}. ${roughNode.title || `粗纲 ${roughIndex + 1}`} / ${detailedNode.title || '未命名细纲'}`,
      }))
  );
  const isContinueSelectionSubmitting = continueSelectionState.type
    ? continuingOutline === continueSelectionState.type
    : false;
  const canConfirmContinueSelection = continueSelectionState.type === 'detailed'
    ? Boolean(continueSelectionState.roughId)
    : continueSelectionState.type === 'chapters'
      ? Boolean(continueSelectionState.detailedId)
      : false;

  const outlineActionPanel = (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/45 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">批量操作</div>
          {outlineSelectionMode && (
            <Badge variant="outline" className="border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
              已选 {selectedOutlineIds.size}
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {outlineSelectionMode ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBatchRegenerate}
                disabled={selectedOutlineIds.size === 0 || isOutlineMutating}
                className="h-8 w-full justify-start text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
              >
                批量重新生成
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBatchDelete}
                disabled={selectedOutlineIds.size === 0 || isOutlineMutating}
                className="h-8 w-full justify-start text-xs border border-red-500/30 bg-red-500/12 text-red-200 hover:bg-red-500/22 hover:text-red-100 disabled:opacity-50"
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
                className="h-8 w-full justify-start text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
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
              className="h-8 w-full justify-start text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
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
            loadingText="生成中..."
            disabled={isOutlineMutating}
            className="h-8 w-full justify-start text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
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
            loadingText="生成中..."
            disabled={isOutlineMutating}
            className="h-8 w-full justify-start text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
          >
              生成全部章节
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3 space-y-2.5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-300/80">续写追加</div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleContinueOutline('rough')}
            isLoading={continuingOutline === 'rough'}
            loadingText="续写中..."
            disabled={isOutlineMutating}
            className="h-8 w-full justify-start border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
            title="基于当前结尾追加下一卷粗纲"
          >
            续写粗纲
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openContinueSelectionModal('detailed')}
            isLoading={continuingOutline === 'detailed'}
            loadingText="续写中..."
            disabled={isOutlineMutating || !canContinueDetailed}
            className="h-8 w-full justify-start border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
            title="承接最后一卷，追加细纲节点"
          >
            续写细纲
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openContinueSelectionModal('chapters')}
            isLoading={continuingOutline === 'chapters'}
            loadingText="续写中..."
            disabled={isOutlineMutating || !canContinueChapters}
            className="h-8 w-full justify-start border border-emerald-500/25 bg-emerald-500/[0.08] text-[11px] text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100 disabled:opacity-50"
            title="承接最近章节，追加章节纲"
          >
            续写章节
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-700/75 bg-zinc-950/45 p-3 space-y-2.5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">阶段重建</div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRegenerateOutline('rough')}
            disabled={isOutlineMutating}
            className="h-8 w-full justify-start border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
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
              className="h-8 w-full justify-start border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
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
              className="h-8 w-full justify-start border border-zinc-700/80 bg-zinc-900/70 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
              title="重新生成章节"
            >
              重置章节
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-x-clip bg-zinc-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[12%] h-72 w-72 rounded-full bg-emerald-500/16 blur-[110px]" />
        <div className="absolute top-1/3 -left-20 h-80 w-80 rounded-full bg-sky-500/12 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-amber-500/12 blur-[120px]" />
      </div>
      <div className="relative z-10 mx-auto max-w-[1560px] space-y-6 px-4 pb-10 pt-5 md:px-6 xl:px-8">
        {error && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={slideUp}
            className="fixed right-4 top-5 z-50 flex items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/90 px-4 py-3 text-sm text-white shadow-2xl shadow-red-500/20 backdrop-blur-md"
          >
            <div className="rounded-full bg-white/20 p-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-medium">{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-7 w-7 rounded-md px-0 text-white/85 hover:bg-white/20 hover:text-white"
              aria-label="关闭错误提示"
              title="关闭"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </motion.div>
        )}

        <section className="grid grid-cols-1 items-start gap-4 xl:auto-rows-min xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="relative h-fit self-start overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-950/65 p-5 md:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(56,189,248,0.13),transparent_48%),radial-gradient(circle_at_82%_22%,rgba(16,185,129,0.16),transparent_50%)]" />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/novels"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  <span className="rounded-lg bg-zinc-800/70 p-1.5 transition-colors group-hover:bg-zinc-700">
                    <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </span>
                  返回作品库
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="border-sky-500/25 bg-sky-500/15 text-sky-300">
                    {novel.type === 'long' ? '长篇小说' : '作品'}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/75 font-mono text-zinc-400">
                    {novel.id.slice(0, 8)}
                  </Badge>
                  {novel.genre && (
                    <Badge variant="outline" className="border-zinc-700/70 bg-zinc-900/65 text-zinc-300">
                      {novel.genre}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      workflowAlertCount > 0
                        ? 'border-red-500/35 bg-red-500/12 text-red-300'
                        : 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                    }
                  >
                    {workflowHealthLabel} · {workflowHealthValue}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {isEditingTitle ? (
                  <InlineInput
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={handleUpdateTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateTitle();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelTitleEdit();
                      }
                    }}
                    className="w-full rounded-xl border border-emerald-500/40 bg-zinc-900/80 px-3 py-2 text-3xl font-bold text-white outline-none transition-colors focus:border-emerald-400 md:text-4xl"
                    aria-label="小说标题"
                    autoFocus
                  />
                ) : (
                  <h1
                    onClick={() => setIsEditingTitle(true)}
                    className="group flex cursor-pointer items-center gap-3 text-3xl font-bold tracking-tight text-white transition-colors hover:text-emerald-200 md:text-4xl"
                    title="点击修改标题"
                  >
                    <span className="truncate">{novel.title}</span>
                    <svg className="h-5 w-5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </h1>
                )}

                {synopsisText && (
                  <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/65 px-4 py-3">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">作品摘要</div>
                    <p
                      className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 transition-all ${
                        isSynopsisExpanded ? '' : 'line-clamp-3'
                      }`}
                    >
                      {synopsisText}
                    </p>
                    {canToggleSynopsis && (
                      <button
                        type="button"
                        onClick={() => setIsSynopsisExpanded((prev) => !prev)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
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
              </div>

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/75 px-3 py-2.5">
                  <div className="text-[11px] text-zinc-500">章节总数</div>
                  <div className="mt-0.5 text-lg font-semibold text-zinc-100">{chapterTotal}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/75 px-3 py-2.5">
                  <div className="text-[11px] text-zinc-500">累计字数</div>
                  <div className="mt-0.5 text-lg font-semibold text-zinc-100">{totalWords.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/75 px-3 py-2.5">
                  <div className="text-[11px] text-zinc-500">单章均字</div>
                  <div className="mt-0.5 text-lg font-semibold text-zinc-100">{avgWordsPerChapter.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.08] px-3 py-2.5">
                  <div className="text-[11px] text-sky-200/75">评审覆盖</div>
                  <div className="mt-0.5 text-lg font-semibold text-sky-200">{reviewRate}%</div>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5">
                  <div className="text-[11px] text-emerald-200/75">定稿完成</div>
                  <div className="mt-0.5 text-lg font-semibold text-emerald-200">{approvedRate}%</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  最后更新：{new Date(novel.updatedAt).toLocaleDateString()}
                </span>
                {latestChapterDate && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-zinc-600" />
                    <span>最近章节更新：{latestChapterDate}</span>
                  </>
                )}
                <span className="h-1 w-1 rounded-full bg-zinc-600" />
                <span>当前视图：{activeTabLabel}</span>
              </div>

              {novel.keywords && novel.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {novel.keywords.slice(0, 10).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-zinc-700/80 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-300"
                    >
                      #{keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <aside className="self-start space-y-3">
            <Card className="relative overflow-visible rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
              <div className="space-y-2.5">
                <Button
                  variant="primary"
                  onClick={handleCreateChapter}
                  leftIcon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  }
                  className="w-full"
                >
                  添加新章节
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setIsExportOpen((prev) => !prev)}
                  leftIcon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  }
                  className="w-full justify-between"
                >
                  导出作品
                </Button>
                {isExportOpen && (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={fadeIn}
                    className="absolute left-3.5 right-3.5 top-[calc(100%-4px)] z-20 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/95 shadow-xl shadow-black/50"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto w-full justify-start rounded-none border-0 bg-transparent px-4 py-3 text-left text-sm text-zinc-300 hover:bg-emerald-500/20 hover:text-white"
                    >
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono">TXT</span>
                      纯文本格式
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto w-full justify-start rounded-none border-0 bg-transparent px-4 py-3 text-left text-sm text-zinc-300 hover:bg-emerald-500/20 hover:text-white"
                    >
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono">MD</span>
                      Markdown格式
                    </Button>
                  </motion.div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-zinc-500">章节完成度</div>
                <div className="text-xs font-medium text-emerald-300">{approvedRate}%</div>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${approvedRate}%` }} />
              </div>
              <div className="text-xs text-zinc-400">{approvedCount}/{chapterTotal} 章定稿</div>
            </Card>

            <Card className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
              <div className="mb-1 text-xs text-zinc-500">大纲阶段</div>
              <div className="mb-1 text-sm font-semibold text-zinc-100">{outlineStageText}</div>
              <div className="text-xs leading-relaxed text-zinc-400">{outlineStageDescription}</div>
            </Card>

            <Card className={`rounded-2xl border p-4 ${workflowAlertCount > 0 ? 'border-red-500/35 bg-red-500/10' : 'border-zinc-800/80 bg-zinc-900/70'}`}>
              <div className="mb-1 text-xs text-zinc-500">{workflowHealthLabel}</div>
              <div className={`text-lg font-semibold ${workflowAlertCount > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {workflowHealthValue}
              </div>
              <div className="mt-1 text-xs text-zinc-400">逾期钩子 {workflowStats.overdueHooks || 0}</div>
            </Card>
          </aside>
        </section>

        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-5">
          <div className="sticky dashboard-sticky-offset z-30 space-y-3">
            <TabsList variant="pills" className="w-fit max-w-full justify-start overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/75 p-1 shadow-lg shadow-black/25 backdrop-blur no-scrollbar mask-linear-fade">
              {tabs.map((tab) => {
                const meta = TAB_META[tab as DisplayTab];
                return (
                  <TabsTrigger key={tab} value={tab} className="group relative min-h-12 gap-2.5 rounded-xl px-3.5 py-1.5 text-left md:px-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm">
                      {meta.icon}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-zinc-100">{meta.label}</span>
                      <span className="hidden text-[11px] leading-tight text-zinc-400 xl:block">{meta.hint}</span>
                    </span>

                    {tab === 'workbench' && workflowStats.overdueHooks > 0 && (
                      <Badge variant="error" size="sm" className="ml-1 animate-pulse">
                        {workflowStats.overdueHooks || 0}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <AnimatePresence mode="wait">
            <TabsContent value="outline" key="outline">
              {novel?.type === 'long' && (
                <div className="max-w-[1360px] mx-auto space-y-6">
                  {outlineNodes.length > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_262px] gap-4 items-start">
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
                                      if (outlineDeviation.action.target === 'detailed') {
                                        openContinueSelectionModal('detailed');
                                      } else if (outlineDeviation.action.target === 'chapters') {
                                        openContinueSelectionModal('chapters');
                                      } else {
                                        handleContinueOutline(outlineDeviation.action.target);
                                      }
                                    } else {
                                      handleRegenerateOutline(outlineDeviation.action.target);
                                    }
                                  }}
                                  disabled={outlineDeviation.action.disabled}
                                  isLoading={outlineDeviation.action.isLoading}
                                  loadingText="处理中..."
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
                            <div className="flex-1 min-w-0">
                              <SearchInput
                                value={outlineSearchKeyword}
                                onChange={(event) => setOutlineSearchKeyword(event.target.value)}
                                onClear={() => setOutlineSearchKeyword('')}
                                placeholder="搜索节点标题、内容或编号..."
                                className="h-9 text-sm"
                                aria-label="搜索大纲节点"
                              />
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
                    <aside className="order-last xl:order-none xl:sticky xl:top-[11.5rem] max-h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar">
                      {outlineActionPanel}
                    </aside>
                    </div>
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
                <Card className="rounded-2xl border border-zinc-800/75 bg-zinc-900/70 px-4 py-4 md:px-5 md:py-5">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-3 text-xl font-semibold text-zinc-100">章节列表</h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          支持关键词检索与流程阶段筛选，也可直接在列表中生成章节草稿并进入编辑。
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/65 px-2.5 py-1 text-zinc-300">
                          总章节 {chapterTotal}
                        </Badge>
                        <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/65 px-2.5 py-1 text-zinc-300">
                          当前字数 {filteredWordTotal.toLocaleString()}
                        </Badge>
                        <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/65 px-2.5 py-1 text-zinc-300">
                          待评审 {Math.max(chapterTotal - reviewDoneCount, 0)}
                        </Badge>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleGenerateChapterDraft(nextDraftChapter)}
                          disabled={!nextDraftChapter || !!nextDraftBlockReason}
                          isLoading={!!nextDraftChapter && isAnyChapterGenerating}
                          loadingText={generatingChapter ? `生成第 ${generatingChapter.order + 1} 章中...` : '生成中...'}
                          title={nextDraftBlockReason || ''}
                          leftIcon={
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          }
                          className="min-w-[136px]"
                        >
                          {nextDraftChapter ? `生成第 ${nextDraftChapter.order + 1} 章` : '生成下一章'}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                      <SearchInput
                        value={chapterSearchKeyword}
                        onChange={(event) => setChapterSearchKeyword(event.target.value)}
                        onClear={() => setChapterSearchKeyword('')}
                        placeholder="搜索章节号、标题、字数..."
                        className="h-10 text-sm"
                        aria-label="搜索章节"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setChapterSearchKeyword('');
                          setChapterStageFilter('all');
                        }}
                        className="h-10 border border-zinc-700/80 bg-zinc-900/70 px-3 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                      >
                        清空筛选
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChapterStageFilter('all')}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                          chapterStageFilter === 'all'
                            ? 'border-emerald-500/35 bg-emerald-500/18 text-emerald-200'
                            : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                        }`}
                      >
                        全部
                        <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-300">{chapterTotal}</span>
                      </button>
                      {chapterStageSummary.map((stage) => {
                        const meta = CHAPTER_STAGE_META[stage.id];
                        const isActiveFilter = chapterStageFilter === stage.id;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => setChapterStageFilter(stage.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                              isActiveFilter
                                ? meta.badgeClassName
                                : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                            }`}
                          >
                            <span>{stage.label}</span>
                            <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-200">{stage.count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                      <div>当前结果：{filteredChapterTotal} / {chapterTotal}</div>
                      {hiddenChapterCount > 0 && <div>已隐藏 {hiddenChapterCount} 章</div>}
                    </div>

                    {generatingChapter && (
                      <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-200">
                        正在生成第 {generatingChapter.order + 1} 章《{generatingChapter.title}》草稿，请稍候...
                      </div>
                    )}
                  </div>
                </Card>

                {chapterTotal > 0 ? (
                  filteredChapterTotal > 0 ? (
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
                          const chapter = filteredChapters[virtualItem.index];
                          if (!chapter) return null;

                          const chapterStage = normalizeChapterStage(chapter.generationStage);
                          const stageMeta = CHAPTER_STAGE_META[chapterStage];
                          const currentStageIdx = WORKFLOW_STEPS.findIndex((step) => step.id === chapterStage);
                          const reviewScore =
                            typeof chapter.reviewFeedback?.overallScore === 'number'
                              ? chapter.reviewFeedback.overallScore.toFixed(1)
                              : null;
                          const isChapterGenerating =
                            generatingChapterId === chapter.id || activeChapterGenerateJobByChapterId.has(chapter.id);
                          const chapterGenerateBlockReason =
                            (chapter.generationStage || 'draft') === 'draft'
                              ? isAnyChapterGenerating && !isChapterGenerating
                                ? '当前有章节正在生成，请稍候'
                                : getChapterGenerationBlockReason(chapter, orderedChapters)
                              : null;

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
                                paddingBottom: '14px',
                              }}
                            >
                              <Card
                                variant="interactive"
                                className="group rounded-2xl border border-zinc-800/75 bg-zinc-900/65 p-4 transition-all duration-300 hover:border-emerald-500/30 hover:bg-zinc-900/85 md:p-5"
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                  <div className="min-w-0 flex-1 space-y-2.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-md border border-zinc-700/80 bg-zinc-800/75 px-2 py-0.5 font-mono text-xs text-zinc-300">
                                        #{chapter.order + 1}
                                      </span>
                                      <Badge variant="outline" className={stageMeta.badgeClassName}>
                                        {stageMeta.label}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={
                                          (chapter.wordCount || 0) >= 2000
                                            ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200'
                                            : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-400'
                                        }
                                      >
                                        {(chapter.wordCount || 0).toLocaleString()} 字
                                      </Badge>
                                      {reviewScore && (
                                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-200">
                                          评分 {reviewScore}
                                        </Badge>
                                      )}
                                    </div>

                                    <h3 className="truncate text-lg font-semibold text-zinc-100 transition-colors group-hover:text-emerald-200">
                                      {chapter.title}
                                    </h3>

                                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                                      <span className="inline-flex items-center gap-1.5">
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {new Date(chapter.updatedAt).toLocaleDateString()}
                                      </span>
                                      <span className={`font-medium ${stageMeta.indicatorClassName}`}>流程阶段：{stageMeta.label}</span>
                                    </div>
                                  </div>

                                  <div className="w-full space-y-2 lg:w-64">
                                    <div className="flex items-center justify-between px-0.5 text-xs text-zinc-500">
                                      <span>流程进度</span>
                                      <span className={stageMeta.indicatorClassName}>{stageMeta.label}</span>
                                    </div>
                                    <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
                                      {WORKFLOW_STEPS.map((step, idx) => {
                                        const isCompleted = idx <= currentStageIdx;
                                        return (
                                          <div
                                            key={step.id}
                                            className={`flex-1 border-r border-black/20 transition-all last:border-0 ${
                                              isCompleted ? 'bg-emerald-500' : 'bg-transparent'
                                            }`}
                                            title={step.label}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                                    {(chapter.generationStage || 'draft') === 'draft' && (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleGenerateChapterDraft(chapter)}
                                        disabled={!!chapterGenerateBlockReason}
                                        isLoading={isChapterGenerating}
                                        loadingText="生成中..."
                                        title={chapterGenerateBlockReason || `生成第 ${chapter.order + 1} 章草稿`}
                                        className="h-9"
                                      >
                                        生成草稿
                                      </Button>
                                    )}
                                    <Link href={`/novels/${id}/chapters/${chapter.id}`}>
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        leftIcon={
                                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        }
                                      >
                                        编辑
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
                                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <Card className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-900/45 py-16 text-center">
                      <div className="text-4xl">🔎</div>
                      <div>
                        <h3 className="text-lg font-semibold text-zinc-100">未找到匹配章节</h3>
                        <p className="mt-1 text-sm text-zinc-400">请调整关键词或阶段筛选条件后重试。</p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setChapterSearchKeyword('');
                          setChapterStageFilter('all');
                        }}
                      >
                        清空筛选
                      </Button>
                    </Card>
                  )
                ) : (
                  <Card className="group flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-900/35 py-20 text-center transition-all hover:border-emerald-500/20 hover:bg-zinc-900/60">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 transition-transform duration-300 group-hover:scale-110">
                      <span className="text-4xl">📝</span>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold text-white">暂无章节</h3>
                      <p className="mb-6 max-w-sm text-zinc-400">开始你的创作之旅，添加第一个章节或让 AI 为你生成。</p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleCreateChapter}
                      leftIcon={
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-5">
                  <Card className="rounded-3xl border border-zinc-800/80 bg-zinc-900/55 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">工坊总览</div>
                        <h3 className="mt-1 text-lg font-semibold text-zinc-100">运行状态</h3>
                      </div>
                      <Badge
                        variant={workbenchRiskCount > 0 ? 'error' : 'success'}
                        className="w-fit px-2.5 py-1 text-[11px]"
                      >
                        {workbenchRiskLabel}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-500">未解决钩子</div>
                        <div className="mt-1 text-lg font-semibold text-zinc-100">{workflowStats.unresolvedHooks}</div>
                      </div>
                      <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5">
                        <div className="text-[11px] text-red-200/70">逾期钩子</div>
                        <div className="mt-1 text-lg font-semibold text-red-200">{workflowStats.overdueHooks}</div>
                      </div>
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-500">逾期占比</div>
                        <div className="mt-1 text-lg font-semibold text-amber-300">{hookOverdueRate}%</div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5">
                        <div className="text-[11px] text-emerald-200/75">实体入库</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-200">自动同步</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-zinc-500">
                      {workflowStats.unresolvedHooks === 0
                        ? '当前无待处理钩子，流程稳定。'
                        : `钩子逾期占比 ${hookOverdueRate}%，建议优先处理高风险章节。`}
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-zinc-800/80 bg-zinc-900/45 p-5">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">资源入口</div>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-100">素材与钩子</h3>
                    <p className="mt-1 text-sm text-zinc-400">实体已并入素材库，不再提供独立实体页面。</p>

                    <div className="mt-4 space-y-2.5">
                      <Link href={`/novels/${id}/materials`} className="block">
                        <Button variant="secondary" className="w-full justify-between group/btn">
                          打开素材库
                          <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                        </Button>
                      </Link>
                      <Link href={`/novels/${id}/hooks`} className="block">
                        <Button variant="secondary" className="w-full justify-between group/btn">
                          打开钩子管理
                          <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </div>

                <Card className="rounded-3xl border border-zinc-800/80 bg-zinc-900/45 p-5 md:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">剧情推演</div>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-100">多分支路线评估</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        按章节规模、采样次数和分支数生成下一阶段路线，并结合钩子状态给出优先方案。
                      </p>
                    </div>
                    {plotLastGeneratedAt && (
                      <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-400">
                        最近推演：{new Date(plotLastGeneratedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      type="number"
                      label="推演章节数"
                      min={1}
                      max={10}
                      value={plotSimulationControls.steps}
                      onChange={(event) =>
                        updatePlotSimulationControls({
                          steps: Number(event.target.value) || 1,
                        })
                      }
                      className="h-10 rounded-xl px-3 py-2 text-sm"
                    />
                    <Input
                      type="number"
                      label="采样迭代"
                      min={20}
                      max={500}
                      step={10}
                      value={plotSimulationControls.iterations}
                      onChange={(event) =>
                        updatePlotSimulationControls({
                          iterations: Number(event.target.value) || 20,
                        })
                      }
                      className="h-10 rounded-xl px-3 py-2 text-sm"
                    />
                    <Input
                      type="number"
                      label="分支数量"
                      min={2}
                      max={5}
                      value={plotSimulationControls.branchCount}
                      onChange={(event) =>
                        updatePlotSimulationControls({
                          branchCount: Number(event.target.value) || 2,
                        })
                      }
                      className="h-10 rounded-xl px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                      <Checkbox
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

                  <div className="mt-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/35 p-4">
                    {plotBranches.length > 0 ? (
                      <div className="space-y-3">
                        <PlotBranchingView
                          branches={plotBranches}
                          deadEndWarnings={plotDeadEndWarnings}
                          hookOpportunities={plotHookOpportunities}
                          selectedBranchId={plotSelectedBranchId || undefined}
                          onSelectBranch={(branchId) => setPlotSelectedBranchId(branchId)}
                        />
                        {plotBestBranchId && (
                          <div className="text-xs text-emerald-300">已自动选中当前最优路线。</div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-zinc-400">
                        尚未生成推演结果。点击下方按钮开始分析下一阶段路线。
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={handleGeneratePlot}
                      disabled={isGeneratingPlot}
                      isLoading={isGeneratingPlot}
                      loadingText="推演中..."
                      className="min-w-[180px] justify-between gap-2 group/btn"
                    >
                      开始推演
                      <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" key="settings">
              <div className="mx-auto grid max-w-[1220px] grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-5">
                  <Card className="rounded-3xl p-6 md:p-7 space-y-7">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold text-white">作品参数</h3>
                        <p className="mt-1 text-sm text-zinc-400">基础信息与创作导向配置，决定后续生成风格和节奏。</p>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-200">
                        高级设置
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <Input
                        type="text"
                        label="标题"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl"
                      />
                      <Textarea
                        label="简介"
                        className="w-full px-4 py-3 rounded-xl min-h-32 resize-none"
                        placeholder="添加简介..."
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                      />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          type="number"
                          label="目标字数（万）"
                          value={editedTargetWords}
                          onChange={(e) => setEditedTargetWords(parseInt(e.target.value) || 200)}
                          min={1}
                          max={1000}
                          className="w-full px-4 py-3 rounded-xl"
                        />
                        <Input
                          type="number"
                          label="预计章节数"
                          value={editedChapterCount}
                          onChange={(e) => setEditedChapterCount(parseInt(e.target.value) || 100)}
                          min={10}
                          max={2000}
                          className="w-full px-4 py-3 rounded-xl"
                        />
                      </div>
                      <Input
                        type="text"
                        label="核心主题/卖点"
                        value={editedTheme}
                        onChange={(e) => setEditedTheme(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl"
                        placeholder="例如：废柴逆袭、穿越重生、系统流..."
                      />
                      <Textarea
                        label="创作意图（作者目标）"
                        value={editedCreativeIntent}
                        onChange={(e) => setEditedCreativeIntent(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl min-h-24 resize-none"
                        placeholder="例如：偏现实主义、强调角色弧光与群像推进，减少套路打脸桥段..."
                      />
                      <Input
                        type="text"
                        label="关键词/灵感"
                        value={editedKeywords}
                        onChange={(e) => setEditedKeywords(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl"
                        placeholder="用逗号分隔多个关键词..."
                      />
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
                    </div>
                  </Card>

                  <Card className="rounded-3xl p-6 md:p-7 space-y-6">
                    <h3 className="text-xl font-bold text-white">世界观与角色</h3>
                    <div className="space-y-5">
                      <Textarea
                        label="主角设定"
                        value={editedProtagonist}
                        onChange={(e) => setEditedProtagonist(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl min-h-28 resize-none"
                        placeholder="主角的背景、性格、金手指..."
                      />
                      <Textarea
                        label="世界观设定"
                        value={editedWorldSetting}
                        onChange={(e) => setEditedWorldSetting(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl min-h-28 resize-none"
                        placeholder="修炼体系、势力分布、时代背景..."
                      />
                      <Textarea
                        label="特殊要求"
                        value={editedSpecialRequirements}
                        onChange={(e) => setEditedSpecialRequirements(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl min-h-20 resize-none"
                        placeholder="其他要求或注意事项..."
                      />
                    </div>
                  </Card>

                  <Card className="rounded-3xl p-6 md:p-7 space-y-6">
                    <h3 className="text-xl font-bold text-white">连续性门禁</h3>
                    <div className="space-y-6">
                      <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-100">启用章节连续性门禁</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            章节生成后自动评分，低分会触发修复或拦截，减少前后文断层。
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                          <Checkbox
                            checked={editedContinuityGateEnabled}
                            onChange={(event) => setEditedContinuityGateEnabled(event.target.checked)}
                            className="h-4 w-4 rounded border-zinc-500 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                          />
                          启用
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          type="number"
                          label="通过阈值（1-10）"
                          step={0.1}
                          min={1}
                          max={10}
                          value={editedContinuityPassScore}
                          onChange={(event) => setEditedContinuityPassScore(parseFloat(event.target.value) || 6.8)}
                          disabled={!editedContinuityGateEnabled}
                          className="w-full rounded-xl px-4 py-3"
                        />
                        <Input
                          type="number"
                          label="拒绝阈值（1-10）"
                          step={0.1}
                          min={1}
                          max={10}
                          value={editedContinuityRejectScore}
                          onChange={(event) => setEditedContinuityRejectScore(parseFloat(event.target.value) || 4.9)}
                          disabled={!editedContinuityGateEnabled}
                          className="w-full rounded-xl px-4 py-3"
                        />
                        <Input
                          type="number"
                          label="自动修复次数"
                          min={0}
                          max={5}
                          value={editedContinuityMaxRepairAttempts}
                          onChange={(event) => setEditedContinuityMaxRepairAttempts(parseInt(event.target.value, 10) || 0)}
                          disabled={!editedContinuityGateEnabled}
                          className="w-full rounded-xl px-4 py-3"
                        />
                      </div>

                      <p className="text-xs text-zinc-500">
                        建议：通过阈值 6.5-7.2；拒绝阈值比通过阈值低至少 0.4；自动修复次数 1-2 次。
                      </p>
                    </div>
                  </Card>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-[11.5rem]">
                  <Card className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">操作中心</div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      修改参数后点击保存，后续章节生成与流程门禁将按新设置执行。
                    </p>
                    <Button
                      variant="primary"
                      onClick={handleSaveSettings}
                      isLoading={isSavingSettings}
                      loadingText="保存中..."
                      disabled={isSavingSettings}
                      className="mt-4 w-full"
                    >
                      保存设置
                    </Button>
                  </Card>

                  <Card className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">当前参数快照</div>
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 py-2">
                        <span className="text-zinc-500">小说类型</span>
                        <span className="text-zinc-200">{editedGenre || '未设置'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 py-2">
                        <span className="text-zinc-500">目标字数</span>
                        <span className="text-zinc-200">{editedTargetWords} 万</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 py-2">
                        <span className="text-zinc-500">预计章节</span>
                        <span className="text-zinc-200">{editedChapterCount} 章</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 py-2">
                        <span className="text-zinc-500">连续门禁</span>
                        <span className={editedContinuityGateEnabled ? 'text-emerald-300' : 'text-zinc-300'}>
                          {editedContinuityGateEnabled ? '已启用' : '已关闭'}
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card className="rounded-2xl border border-red-500/25 bg-red-500/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-red-300/80">危险操作</div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      删除作品后，章节、素材和设定会被永久清空，且无法恢复。
                    </p>
                    <Button
                      variant="danger"
                      onClick={() =>
                        setConfirmState({
                          isOpen: true,
                          title: '确认删除小说',
                          message: `确定要删除《${novel.title}》吗？此操作不可撤销。`,
                          confirmText: '确认删除',
                          variant: 'danger',
                          onConfirm: handleDeleteNovel,
                        })
                      }
                      className="mt-4 w-full"
                    >
                      删除小说
                    </Button>
                  </Card>
                </aside>
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

      <Modal
        isOpen={continueSelectionState.isOpen}
        onClose={closeContinueSelectionModal}
        title={continueSelectionState.type === 'detailed' ? '选择续写细纲目标' : '选择续写章节纲目标'}
        size="lg"
      >
        <div className="px-6 py-5 space-y-4">
          {continueSelectionState.type === 'detailed' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">选择粗纲范围</label>
              <select
                value={continueSelectionState.roughId}
                onChange={(event) =>
                  setContinueSelectionState((prev) => ({
                    ...prev,
                    roughId: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 text-sm text-zinc-200 outline-none transition-colors focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
              >
                <option value="" className="bg-zinc-900">请选择粗纲</option>
                {continueRoughOptions.map((option) => (
                  <option key={option.id} value={option.id} className="bg-zinc-900">
                    {option.label}（已含细纲 {option.detailedCount}）
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                将在所选粗纲下继续追加新的细纲节点，不影响其他粗纲分支。
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">选择细纲范围</label>
              <select
                value={continueSelectionState.detailedId}
                onChange={(event) =>
                  setContinueSelectionState((prev) => ({
                    ...prev,
                    detailedId: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 text-sm text-zinc-200 outline-none transition-colors focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
              >
                <option value="" className="bg-zinc-900">请选择细纲</option>
                {continueDetailedOptions.map((option) => (
                  <option key={option.id} value={option.id} className="bg-zinc-900">
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                将在所选细纲下继续追加章节纲节点，并同步到章节列表。
              </p>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={closeContinueSelectionModal} disabled={isContinueSelectionSubmitting}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmContinueSelection}
              isLoading={isContinueSelectionSubmitting}
              loadingText="续写中..."
              disabled={!canConfirmContinueSelection || isContinueSelectionSubmitting}
              className="min-w-[110px]"
            >
              开始续写
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
