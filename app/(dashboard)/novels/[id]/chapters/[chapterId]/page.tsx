'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import * as Diff from 'diff';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogTrigger, Skeleton, Progress, Tooltip, TooltipProvider, TooltipTrigger, TooltipContent, Textarea, Checkbox } from '@/app/components/ui';
import { ConfirmModal, ModalFooter } from '@/app/components/ui/Modal';
import { useToast } from '@/app/components/ui/Toast';
import { fadeIn, slideUp, scaleIn, staggerContainer } from '@/app/lib/animations';
import {
  isJobForChapter,
  isTerminalJobStatus,
  mergeActiveJobsById,
  parseJobQueueItem,
  parseJobsStreamPayload,
  type JobQueueItem,
  type JobQueueStatus,
} from '@/src/shared/jobs';
import {
  buildBranchIterationInput,
  composeReviewIterationFeedback,
  getNextBranchIterationRound,
  getReviewIterationRound,
  normalizeBranchCandidates,
} from '@/src/shared/chapter-branch-review';
import {
  buildDefaultSuggestionSelection,
  buildHighPrioritySuggestionSelection,
  buildReviewSuggestionKey,
  formatReviewTimestamp,
  isReviewStale,
  normalizeChapterReviewData,
  normalizeConsistencyCheckData,
  parseChapterReviewState,
  pickSelectedSuggestions,
  type ChapterReviewState,
  type NormalizedConsistencyData,
  type NormalizedReviewData,
} from '@/src/shared/chapter-review';

const Icons = {
  ChevronLeft: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m15 18-6-6 6-6"/></svg>
  ),
  Save: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  ),
  History: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 3v9h9"/><path d="M12 7v5l4 2"/></svg>
  ),
  Sparkles: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 5h4"/><path d="M3 9h4"/></svg>
  ),
  CheckCircle: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  Wand2: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.648 15.252-2.9 2.9a2 2 0 0 1-2.828 0L9.344 11.576a2 2 0 0 1 0-2.828l2.9-2.9a2 2 0 0 1 2.828 0l6.576 6.576a2 2 0 0 1 0 2.828Z"/><path d="m2 22 5-5"/><path d="m8 8 2-2"/><path d="m9 15 2-2"/><path d="m15 9 2-2"/></svg>
  ),
  X: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  ),
  Loader2: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  ),
  PanelRight: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
  ),
  Eye: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  RotateCcw: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 3v9h9"/></svg>
  ),
  GitBranch: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
  ),
  Brain: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>
  ),
  Maximize: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
  ),
  Minimize: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
  ),
  BookOpen: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  )
};

interface Chapter {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  generationStage?: string;
  reviewIterations?: number;
}

interface Version {
  id: string;
  content: string;
  createdAt: string;
}

interface Branch {
  id: string;
  content: string;
  createdAt: string;
  branchNumber?: number;
  continuityScore?: number;
  continuityVerdict?: 'pass' | 'revise' | 'reject';
  continuityIssues?: string[];
  continuityRecommended?: boolean;
  status?: 'pending' | 'succeeded' | 'failed';
}

type BranchSortMode = 'recommended' | 'latest' | 'score';
type BranchVerdictFilter = 'all' | 'pass' | 'revise' | 'reject';
type BranchDetailMode = 'preview' | 'diff';
type BranchDiffLayout = 'split' | 'unified';

interface BranchDiffRow {
  status: 'unchanged' | 'added' | 'removed' | 'changed';
  leftLine?: string;
  rightLine?: string;
  leftLineNo?: number;
  rightLineNo?: number;
}

const BRANCH_COUNT_OPTIONS = [3] as const;
const BRANCH_FEEDBACK_PRESETS = [
  '增强冲突张力',
  '补充环境与氛围描写',
  '加快节奏，减少铺垫',
  '强化主角主动性',
  '结尾钩子更强',
] as const;

const POST_PROCESS_JOB_TYPES = [
  'MEMORY_EXTRACT',
  'HOOKS_EXTRACT',
  'PENDING_ENTITY_EXTRACT',
  'CHAPTER_SUMMARY_GENERATE',
] as const;

type PostProcessJobType = (typeof POST_PROCESS_JOB_TYPES)[number];
type PostProcessDisplayStatus = 'running' | 'succeeded' | 'failed';

interface PostProcessStatusEntry {
  status: PostProcessDisplayStatus;
  error?: string;
  updatedAt?: string;
}

const POST_PROCESS_LABELS: Record<PostProcessJobType, string> = {
  MEMORY_EXTRACT: '记忆',
  HOOKS_EXTRACT: '钩子',
  PENDING_ENTITY_EXTRACT: '待确认实体',
  CHAPTER_SUMMARY_GENERATE: '摘要',
};

function isPostProcessJobType(type: string): type is PostProcessJobType {
  return (POST_PROCESS_JOB_TYPES as readonly string[]).includes(type);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizePostProcessStatus(status: JobQueueStatus | string): PostProcessDisplayStatus | null {
  if (status === 'failed') return 'failed';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'queued' || status === 'running' || status === 'processing') return 'running';
  return null;
}

const MAX_POST_PROCESS_ERROR_LENGTH = 140;

function formatPostProcessErrorMessage(error?: string | null): string | undefined {
  if (typeof error !== 'string') return undefined;
  const normalized = error.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  if (
    normalized.includes('Unknown field `metadata`') &&
    normalized.includes('model `Material`')
  ) {
    return '素材字段查询失败：metadata 字段不存在，请使用 data 字段。';
  }

  if (normalized.includes('Invalid `prisma.') && normalized.includes('invocation')) {
    return '数据库查询失败，请稍后重试。';
  }

  if (normalized.length > MAX_POST_PROCESS_ERROR_LENGTH) {
    return `${normalized.slice(0, MAX_POST_PROCESS_ERROR_LENGTH)}...`;
  }
  return normalized;
}

function buildPostProcessWarningMessage(type: PostProcessJobType, error?: string | null): string {
  return `${POST_PROCESS_LABELS[type]}任务失败：${formatPostProcessErrorMessage(error) || '请稍后重试'}`;
}

function getContinuityTone(verdict?: Branch['continuityVerdict']): string {
  if (verdict === 'pass') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200';
  if (verdict === 'reject') return 'border-red-500/30 bg-red-500/15 text-red-200';
  return 'border-amber-500/30 bg-amber-500/15 text-amber-200';
}

function getContinuityVerdictLabel(verdict?: Branch['continuityVerdict']): string {
  if (verdict === 'pass') return '承接通过';
  if (verdict === 'reject') return '承接断层';
  return '承接待优化';
}

function isReviewScoreJobType(type: string): boolean {
  return type === 'REVIEW_SCORE' || type === 'REVIEW_SCORE_5DIM';
}

function buildPostProcessSnapshot(
  jobs: Array<{ type: string; status: string; error?: string | null; updatedAt?: string | Date }>
): Partial<Record<PostProcessJobType, PostProcessStatusEntry>> {
  const next: Partial<Record<PostProcessJobType, PostProcessStatusEntry>> = {};

  for (const type of POST_PROCESS_JOB_TYPES) {
    const latest = jobs.find((job) => job.type === type);
    if (!latest) continue;
    const normalizedStatus = normalizePostProcessStatus(latest.status);
    if (!normalizedStatus) continue;
    next[type] = {
      status: normalizedStatus,
      error: formatPostProcessErrorMessage(latest.error),
      updatedAt: latest.updatedAt ? new Date(latest.updatedAt).toISOString() : undefined,
    };
  }

  return next;
}

const DEFAULT_CHAPTER_REVIEW_STATE: ChapterReviewState = {
  hasReview: false,
  feedback: null,
  pendingReview: false,
  lastReviewAt: null,
  approvedAt: null,
};

const REVIEW_DIMENSION_LABELS: Record<string, string> = {
  'standaloneQuality': '章节独立质量',
  'standalone_quality': '章节独立质量',
  'continuity': '前文连贯性',
  'outlineAdherence': '大纲符合度',
  'outline_adherence': '大纲符合度',
  'characterConsistency': '人物一致性',
  'character_consistency': '人物一致性',
  'hookManagement': '钩子管理',
  'hook_management': '钩子管理',
  'plot': '情节发展',
  'plot_development': '情节发展',
  'pacing': '叙事节奏',
  'narrative_pacing': '叙事节奏',
  'character': '角色刻画',
  'character_development': '角色刻画',
  'characterization': '角色刻画',
  'dialogue': '对话质量',
  'dialogue_quality': '对话质量',
  'description': '描写质量',
  'descriptive_quality': '描写质量',
  'emotional_impact': '情感张力',
  'emotion': '情感张力',
  'tension': '张力构建',
  'conflict': '冲突设置',
  'hook': '吸引力',
  'readability': '可读性',
  'consistency': '一致性',
  'world_building': '世界观构建',
  'originality': '创意性',
  'overall': '综合评价',
};

const CANON_DIMENSION_LABELS: Record<string, string> = {
  'ooc_assessment': 'OOC 评估',
  'character_consistency': '角色一致性',
  'plot_logic_consistency': '剧情逻辑一致性',
  'tone_style_consistency': '语气风格一致性',
  'world_building_consistency': '世界观一致性',
  'relationship_dynamics': '人物关系动态',
  'power_system_adherence': '力量体系遵循',
  'timeline_consistency': '时间线一致性',
};

const CONSISTENCY_DIMENSION_LABELS: Record<string, string> = {
  'character_consistency': '角色一致性',
  'timeline_consistency': '时间线一致性',
  'world_consistency': '世界观一致性',
  'geography_consistency': '空间地理一致性',
  'power_system_consistency': '力量体系一致性',
  'plot_logic_consistency': '情节逻辑一致性',
  'detail_consistency': '细节一致性',
  'consistency': '综合一致性',
};

function getPriorityLabel(priority?: string): string {
  if (priority === 'high') return '高优先';
  if (priority === 'medium') return '中优先';
  if (priority === 'low') return '低优先';
  if (priority === 'normal') return '普通';
  return '未分级';
}

function getSeverityLabel(severity?: string): string {
  if (severity === 'critical') return '致命';
  if (severity === 'major') return '重要';
  if (severity === 'minor') return '次要';
  if (severity === 'nitpick') return '细节';
  if (severity === 'warning') return '警告';
  if (severity === 'info') return '提示';
  if (severity === 'creative_liberty') return '创作自由';
  return '普通';
}

export default function ChapterEditorPage() {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const { id: novelId, chapterId } = params as { id: string; chapterId: string };

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [novel, setNovel] = useState<{ id: string; genre?: string; isFanfiction: boolean } | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [versions, setVersions] = useState<Version[]>([]);
  const [showDiff, setShowDiff] = useState<Version | null>(null);
  const [activeJobs, setActiveJobs] = useState<JobQueueItem[]>([]);
  const [postProcessStatus, setPostProcessStatus] = useState<Partial<Record<PostProcessJobType, PostProcessStatusEntry>>>({});
  const [postProcessWarning, setPostProcessWarning] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [reviewState, setReviewState] = useState<ChapterReviewState>(
    DEFAULT_CHAPTER_REVIEW_STATE
  );
  const [deaiRollbackVersionId, setDeaiRollbackVersionId] = useState<string | null>(null);
  const [consistencyResult, setConsistencyResult] = useState<any>(null);
  const [canonCheckResult, setCanonCheckResult] = useState<any>(null);
  const [canonCheckError, setCanonCheckError] = useState<string | null>(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [showCanonCheckPanel, setShowCanonCheckPanel] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  
  // Branch Iteration State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [iterationRound, setIterationRound] = useState(1);
  const [branchSortMode, setBranchSortMode] = useState<BranchSortMode>('recommended');
  const [branchVerdictFilter, setBranchVerdictFilter] = useState<BranchVerdictFilter>('all');
  const [branchCountSetting, setBranchCountSetting] = useState<number>(3);
  const [branchCacheLoaded, setBranchCacheLoaded] = useState<boolean>(false);
  const [branchDetailMode, setBranchDetailMode] = useState<BranchDetailMode>('preview');
  const [branchDiffLayout, setBranchDiffLayout] = useState<BranchDiffLayout>('split');
  const [branchDiffOnlyChanges, setBranchDiffOnlyChanges] = useState<boolean>(false);
  const [feedback, setFeedback] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Review panel state
  const [reviewPanelActiveTab, setReviewPanelActiveTab] = useState<'review' | 'consistency'>('review');
  const [isIterating, setIsIterating] = useState(false);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState<string[]>([]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContent = useRef('');
  // const pollIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Deprecated in favor of SSE
  const shortcutSaveHint = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl+S';
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘S' : 'Ctrl+S';
  }, []);

  const normalizedReview = useMemo<NormalizedReviewData>(
    () => normalizeChapterReviewData(reviewResult, REVIEW_DIMENSION_LABELS),
    [reviewResult]
  );

  const normalizedConsistency = useMemo<NormalizedConsistencyData>(
    () => normalizeConsistencyCheckData(consistencyResult, CONSISTENCY_DIMENSION_LABELS),
    [consistencyResult]
  );

  const selectedReviewSuggestions = useMemo(
    () => pickSelectedSuggestions(normalizedReview.suggestions, selectedSuggestionKeys),
    [normalizedReview.suggestions, selectedSuggestionKeys]
  );

  const isReviewResultStale = useMemo(
    () => isReviewStale(chapter?.updatedAt ?? null, reviewState.lastReviewAt),
    [chapter?.updatedAt, reviewState.lastReviewAt]
  );

  const recommendedBranch = useMemo<Branch | null>(() => {
    if (branches.length === 0) return null;
    return branches.find((branch) => branch.continuityRecommended) || branches[0];
  }, [branches]);

  const displayedBranches = useMemo(() => {
    const filtered = branches.filter((branch) => {
      if (branchVerdictFilter === 'all') return true;
      return branch.continuityVerdict === branchVerdictFilter;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      const leftCreatedAt = Number.isNaN(Date.parse(left.createdAt)) ? 0 : Date.parse(left.createdAt);
      const rightCreatedAt = Number.isNaN(Date.parse(right.createdAt)) ? 0 : Date.parse(right.createdAt);
      const leftScore = typeof left.continuityScore === 'number' ? left.continuityScore : Number.NEGATIVE_INFINITY;
      const rightScore = typeof right.continuityScore === 'number' ? right.continuityScore : Number.NEGATIVE_INFINITY;

      if (branchSortMode === 'latest') {
        return rightCreatedAt - leftCreatedAt;
      }

      if (branchSortMode === 'score') {
        if (rightScore !== leftScore) return rightScore - leftScore;
        return rightCreatedAt - leftCreatedAt;
      }

      const leftRecommended = left.continuityRecommended ? 1 : 0;
      const rightRecommended = right.continuityRecommended ? 1 : 0;
      if (rightRecommended !== leftRecommended) return rightRecommended - leftRecommended;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return rightCreatedAt - leftCreatedAt;
    });

    return sorted;
  }, [branchSortMode, branchVerdictFilter, branches]);

  const selectedBranchDiff = useMemo(() => {
    if (!selectedBranch) {
      return {
        parts: [] as ReturnType<typeof Diff.diffLines>,
        rows: [] as BranchDiffRow[],
        addedLines: 0,
        removedLines: 0,
        changedBlocks: 0,
        unchangedLines: 0,
      };
    }

    const parts = Diff.diffLines(content || '', selectedBranch.content || '');
    const rows: BranchDiffRow[] = [];
    let addedLines = 0;
    let removedLines = 0;
    let changedBlocks = 0;
    let unchangedLines = 0;

    const toLines = (value: string): string[] => {
      if (!value) return [];
      const lines = value.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines;
    };

    let leftLineNo = 1;
    let rightLineNo = 1;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];

      if (part.removed && parts[index + 1]?.added) {
        const removedPart = part;
        const addedPart = parts[index + 1];
        const leftLines = toLines(removedPart.value);
        const rightLines = toLines(addedPart.value);
        const maxLen = Math.max(leftLines.length, rightLines.length);

        changedBlocks += 1;
        addedLines += rightLines.length;
        removedLines += leftLines.length;

        for (let rowIndex = 0; rowIndex < maxLen; rowIndex += 1) {
          const leftLine = leftLines[rowIndex];
          const rightLine = rightLines[rowIndex];
          const hasLeft = typeof leftLine === 'string';
          const hasRight = typeof rightLine === 'string';

          rows.push({
            status: hasLeft && hasRight ? 'changed' : hasLeft ? 'removed' : 'added',
            ...(hasLeft ? { leftLine, leftLineNo } : {}),
            ...(hasRight ? { rightLine, rightLineNo } : {}),
          });

          if (hasLeft) leftLineNo += 1;
          if (hasRight) rightLineNo += 1;
        }

        index += 1;
        continue;
      }

      if (part.added) {
        changedBlocks += 1;
        const rightLines = toLines(part.value);
        addedLines += rightLines.length;
        rightLines.forEach((rightLine) => {
          rows.push({
            status: 'added',
            rightLine,
            rightLineNo,
          });
          rightLineNo += 1;
        });
        continue;
      }

      if (part.removed) {
        changedBlocks += 1;
        const leftLines = toLines(part.value);
        removedLines += leftLines.length;
        leftLines.forEach((leftLine) => {
          rows.push({
            status: 'removed',
            leftLine,
            leftLineNo,
          });
          leftLineNo += 1;
        });
        continue;
      }

      const unchanged = toLines(part.value);
      unchangedLines += unchanged.length;
      unchanged.forEach((line) => {
        rows.push({
          status: 'unchanged',
          leftLine: line,
          rightLine: line,
          leftLineNo,
          rightLineNo,
        });
        leftLineNo += 1;
        rightLineNo += 1;
      });
    }

    return { parts, rows, addedLines, removedLines, changedBlocks, unchangedLines };
  }, [content, selectedBranch]);

  const applyQueuedPostProcess = useCallback((summary: any) => {
    if (!summary?.results || !Array.isArray(summary.results)) return;

    setPostProcessStatus((prev) => {
      const next = { ...prev };
      for (const item of summary.results) {
        const itemType = typeof item?.type === 'string' ? item.type : '';
        if (!isPostProcessJobType(itemType)) continue;
        next[itemType] = {
          status: item.ok ? 'running' : 'failed',
          error: item.ok ? undefined : (formatPostProcessErrorMessage(item.error) || '任务派发失败'),
          updatedAt: new Date().toISOString(),
        };
      }
      return next;
    });
  }, []);

  const applyPostProcessJobUpdate = useCallback((job: { type: string; status: string; error?: string | null }) => {
    if (!job?.type || !isPostProcessJobType(job.type)) return;
    const normalizedStatus = normalizePostProcessStatus(job.status);
    if (!normalizedStatus) return;

    setPostProcessStatus((prev) => ({
      ...prev,
      [job.type]: {
        status: normalizedStatus,
        error: normalizedStatus === 'failed' ? (formatPostProcessErrorMessage(job.error) || '任务执行失败') : undefined,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const refreshChapter = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`);
      if (!res.ok) throw new Error('Failed to load chapter');
      const data = await res.json();
      setChapter(data.chapter);
      setNovel(data.novel);
      setContent(data.chapter.content || '');
      setTitle(data.chapter.title || '');
      lastSavedContent.current = data.chapter.content || '';
      if (Array.isArray(data.postGenerationJobs)) {
        setPostProcessStatus(buildPostProcessSnapshot(data.postGenerationJobs));
      }
    } catch (err) {
      console.error(err);
    }
  }, [novelId, chapterId]);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [novelId, chapterId]);

  const fetchBranches = useCallback(async (): Promise<Branch[]> => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/branches`);
      if (res.ok) {
        const data = await res.json();
        const rawBranches = Array.isArray(data.branches) ? (data.branches as Branch[]) : [];
        const normalized = normalizeBranchCandidates<Branch>(rawBranches);
        setBranches(normalized);
        return normalized;
      }
    } catch (err) {
      console.error(err);
    }
    setBranches([]);
    return [];
  }, [novelId, chapterId]);

  const fetchLatestReview = useCallback(async () => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/review-5dim`);
      if (!res.ok) return;
      const payload = await res.json();
      const parsed = parseChapterReviewState(payload);
      setReviewState(parsed);
      if (parsed.hasReview) {
        setReviewResult(parsed.feedback);
      } else {
        setReviewResult(null);
      }
    } catch (err) {
      console.error('Failed to fetch review', err);
    }
  }, [chapterId]);

  const applyChapterGenerationOutput = useCallback((output: unknown) => {
    const jobOutput = toRecord(output);
    if (jobOutput?.postProcess) {
      applyQueuedPostProcess(jobOutput.postProcess);
    }

    const analysisQueueError =
      typeof jobOutput?.analysisQueueError === 'string'
        ? jobOutput.analysisQueueError
        : null;
    if (analysisQueueError) {
      setPostProcessWarning(`后处理派发失败：${formatPostProcessErrorMessage(analysisQueueError) || '请稍后重试'}`);
      return;
    }

    const continuityGate = toRecord(jobOutput?.continuityGate);
    const continuityVerdict =
      continuityGate && typeof continuityGate.verdict === 'string'
        ? continuityGate.verdict
        : null;
    const continuityScore =
      continuityGate && typeof continuityGate.score === 'number'
        ? continuityGate.score
        : null;
    if (continuityVerdict && continuityVerdict !== 'pass') {
      const scoreText =
        continuityScore === null ? '' : `（得分 ${continuityScore.toFixed(2)}）`;
      setPostProcessWarning(`连续性提示：本章承接存在改进空间${scoreText}`);
    }
  }, [applyQueuedPostProcess]);

  const applyIncomingContent = useCallback((nextContent: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setContent(nextContent);
    lastSavedContent.current = nextContent;
    setSaveStatus('saved');
  }, []);

  const handleSucceededChapterJob = useCallback((job: JobQueueItem) => {
    if (job.type === 'CHAPTER_GENERATE_BRANCHES') {
      setBranchCacheLoaded(false);
      void fetchBranches();
      return;
    }

    if (job.type === 'CHAPTER_GENERATE' || job.type === 'DEAI_REWRITE') {
      const output = toRecord(job.output);
      if (typeof output?.content === 'string' && output.content.trim()) {
        applyIncomingContent(output.content);
      }
      if (job.type === 'DEAI_REWRITE') {
        setDeaiRollbackVersionId(
          typeof output?.prePolishVersionId === 'string' ? output.prePolishVersionId : null
        );
      } else {
        setDeaiRollbackVersionId(null);
      }
      applyChapterGenerationOutput(job.output);
      void refreshChapter();
      return;
    }

    if (isReviewScoreJobType(job.type)) {
      if (job.output) {
        setReviewResult(job.output);
      }
      void fetchLatestReview();
      void refreshChapter();
      return;
    }

    if (job.type === 'CONSISTENCY_CHECK') {
      setConsistencyResult(job.output);
      return;
    }

    if (job.type === 'CANON_CHECK') {
      setCanonCheckResult(job.output);
      setCanonCheckError(null);
    }
  }, [applyChapterGenerationOutput, applyIncomingContent, fetchBranches, fetchLatestReview, refreshChapter]);

  const handleFailedChapterJob = useCallback((job: JobQueueItem) => {
    if (job.type === 'CANON_CHECK') {
      setCanonCheckError(job.error || '检测失败，请稍后重试');
      setCanonCheckResult(null);
    }

    if (isPostProcessJobType(job.type)) {
      setPostProcessWarning(buildPostProcessWarningMessage(job.type, job.error));
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refreshChapter();
    void fetchLatestReview();

    // SSE Connection for Real-time Updates
    const eventSource = new EventSource('/api/jobs/stream');

    const handleJobs = (event: Event) => {
      try {
        const messageEvent = event as MessageEvent<string>;
        const payload = JSON.parse(messageEvent.data);
        const parsed = parseJobsStreamPayload(payload);
        if (!parsed) return;

        const chapterJobs = parsed.jobs.filter((job) => isJobForChapter(job, chapterId));
        if (chapterJobs.length === 0) return;

        setActiveJobs((prev) => mergeActiveJobsById(prev, chapterJobs));

        // Handle completions
        for (const job of chapterJobs) {
          applyPostProcessJobUpdate(job);

          if (job.status === 'succeeded') {
            handleSucceededChapterJob(job);
          } else if (job.status === 'failed') {
            handleFailedChapterJob(job);
            console.error(`Job ${job.type} failed`);
          }
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };

    eventSource.addEventListener('jobs', handleJobs);

    return () => {
      eventSource.removeEventListener('jobs', handleJobs);
      eventSource.close();
    };
  }, [
    applyPostProcessJobUpdate,
    chapterId,
    fetchLatestReview,
    handleFailedChapterJob,
    handleSucceededChapterJob,
    refreshChapter,
  ]);

  const handleMemoryExtract = async () => {
    if (saveStatus !== 'saved') {
      toast({
        variant: 'warning',
        description: '请先保存章节内容',
      });
      return;
    }
    createJob('MEMORY_EXTRACT', { content });
    // Feedback is handled by activeJobs and SSE
  };

  useEffect(() => {
    if (showBranchPanel) {
      fetchBranches();
    }
  }, [showBranchPanel, fetchBranches]);

  useEffect(() => {
    if (isSidebarOpen) {
      fetchVersions();
    }
  }, [isSidebarOpen, fetchVersions]);

  useEffect(() => {
    if (
      showReviewPanel &&
      reviewPanelActiveTab === 'review' &&
      !reviewResult &&
      novel?.isFanfiction &&
      !!consistencyResult
    ) {
      setReviewPanelActiveTab('consistency');
    }
  }, [showReviewPanel, reviewPanelActiveTab, reviewResult, consistencyResult, novel?.isFanfiction]);

  useEffect(() => {
    setSelectedSuggestionKeys(
      buildDefaultSuggestionSelection(normalizedReview.suggestions)
    );
  }, [normalizedReview.suggestions]);

  useEffect(() => {
    const text = content || '';
    setCharCount(text.length);
    setWordCount(text.trim() === '' ? 0 : text.trim().split(/\s+/).length);
  }, [content]);

  const saveContent = useCallback(async (newContent: string, newTitle: string) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent, title: newTitle }),
      });
      
      if (res.ok) {
        setSaveStatus('saved');
        lastSavedContent.current = newContent;
      } else {
        setSaveStatus('unsaved');
      }
    } catch (err) {
      console.error('Save failed', err);
      setSaveStatus('unsaved');
    }
  }, [novelId, chapterId]);

  const handleManualSave = useCallback(async () => {
    if (saveStatus === 'saving') return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await saveContent(content, title);
  }, [content, saveContent, saveStatus, title]);

  const updateChapterMeta = useCallback(async (updates: { generationStage?: string; reviewIterations?: number }) => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setChapter(data.chapter);
      }
    } catch (err) {
      console.error('Failed to update chapter stage', err);
    }
  }, [novelId, chapterId]);
 
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSaveStatus('unsaved');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent, title);
    }, 2000);
  };

  const handleBlur = () => {
    if (content !== lastSavedContent.current) {
      saveContent(content, title);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void handleManualSave();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const createJob = async (
    type: string,
    additionalInput: object = {}
  ): Promise<boolean> => {
    try {
      if (type === 'CHAPTER_GENERATE' || type === 'CHAPTER_GENERATE_BRANCHES') {
        setPostProcessWarning(null);
      }
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          input: { 
            chapterId,
            ...additionalInput
          },
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        const job = parseJobQueueItem(payload?.job);
        if (job && isJobForChapter(job, chapterId) && !isTerminalJobStatus(job.status)) {
          setActiveJobs((prev) => mergeActiveJobsById(prev, [job]));
          if (isPostProcessJobType(type)) {
            setPostProcessStatus((prev) => ({
              ...prev,
              [type]: { status: 'running', updatedAt: new Date().toISOString() },
            }));
          }
          // pollJob(job.id); // Replaced by SSE
        }
        
        if (type === 'CHAPTER_GENERATE_BRANCHES') {
          setBranchCacheLoaded(false);
          setShowBranchPanel(true);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to create job', err);
      return false;
    }
  };

  const handleOpenBranchPanel = useCallback(async () => {
    setShowBranchPanel(true);
    const cachedBranches = await fetchBranches();
    if (cachedBranches.length > 0) {
      setBranchCacheLoaded(true);
      setSelectedBranch((previous) => previous && cachedBranches.some((item) => item.id === previous.id)
        ? previous
        : cachedBranches[0]);
      toast({
        variant: 'info',
        description: '已加载上次缓存分支，可直接采用，或点击“重新生成”覆盖缓存。',
      });
      return;
    }

    setBranchCacheLoaded(false);
    await createJob('CHAPTER_GENERATE_BRANCHES', { branchCount: branchCountSetting });
  }, [branchCountSetting, createJob, fetchBranches, toast]);

  const requestBranchIteration = useCallback(
    async ({
      selectedContent,
      feedbackText,
      iterationRound: targetRound,
      branchCount,
      clearSelectedBranch = false,
      closeReviewPanel = false,
      clearReviewFeedback = false,
    }: {
      selectedContent: string;
      feedbackText?: string;
      iterationRound: number;
      branchCount?: number;
      clearSelectedBranch?: boolean;
      closeReviewPanel?: boolean;
      clearReviewFeedback?: boolean;
    }) => {
      const input = buildBranchIterationInput({
        selectedContent,
        feedback: feedbackText,
        iterationRound: targetRound,
      });
      if (!input) return false;

      const normalizedBranchCount = typeof branchCount === 'number' && Number.isFinite(branchCount)
        ? Math.max(2, Math.min(5, Math.floor(branchCount)))
        : branchCountSetting;
      setBranchCacheLoaded(false);
      const queued = await createJob('CHAPTER_GENERATE_BRANCHES', {
        ...input,
        branchCount: normalizedBranchCount,
      });
      if (!queued) return false;

      setIterationRound(input.iterationRound);
      setFeedback('');
      if (clearSelectedBranch) {
        setSelectedBranch(null);
        setBranchDetailMode('preview');
      }
      if (clearReviewFeedback) {
        setReviewFeedback('');
      }
      if (closeReviewPanel) {
        setShowReviewPanel(false);
      }
      return true;
    },
    [branchCountSetting, createJob]
  );



  const handleRestore = (
    versionId: string,
    options?: {
      title?: string;
      message?: string;
      confirmText?: string;
      successMessage?: string;
      onSuccess?: () => void;
    }
  ) => {
    setConfirmState({
      isOpen: true,
      title: options?.title || '确认恢复版本',
      message: options?.message || '确定要恢复此版本吗？当前更改将被覆盖。',
      confirmText: options?.confirmText || '恢复版本',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/versions/${versionId}`, {
            method: 'POST'
          });
          if (!res.ok) {
            throw new Error('恢复版本失败');
          }

          await res.json();
          await refreshChapter();
          await fetchVersions();
          setShowDiff(null);
          setDeaiRollbackVersionId(null);
          options?.onSuccess?.();
          toast({
            variant: 'success',
            description: options?.successMessage || '已恢复到所选版本',
          });
        } catch (err) {
          console.error('Restore failed', err);
          toast({
            variant: 'error',
            description: err instanceof Error ? err.message : '恢复版本失败',
          });
        }
      },
    });
  };

  const handleRollbackBeforeDeai = () => {
    if (!deaiRollbackVersionId) return;
    handleRestore(deaiRollbackVersionId, {
      title: '确认回退润色',
      message: '将恢复到本次润色前的版本。当前内容会被覆盖，是否继续？',
      confirmText: '回退润色',
      successMessage: '已回退到润色前版本',
      onSuccess: () => setDeaiRollbackVersionId(null),
    });
  };

  const handleApplyBranch = (branch: Branch) => {
    setConfirmState({
      isOpen: true,
      title: '确认采用分支',
      message: '确定要应用此分支吗？当前内容将被覆盖。',
      confirmText: '采用分支',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId: branch.id })
          });

          if (!res.ok) {
            throw new Error('采用分支失败');
          }

          const data = await res.json();
          if (data?.postProcess) {
            applyQueuedPostProcess(data.postProcess);
          }
          if (data?.analysisQueueError) {
            setPostProcessWarning(`后处理派发失败：${data.analysisQueueError}`);
          }
          applyIncomingContent(typeof data?.content === 'string' ? data.content : branch.content);
          setShowBranchPanel(false);
          setIterationRound(1);
          setFeedback('');
          setSelectedBranch(null);
          setBranchCacheLoaded(false);
          setBranchDetailMode('preview');
          setReviewResult(null);
          setConsistencyResult(null);
          setDeaiRollbackVersionId(null);
          setReviewState({ ...DEFAULT_CHAPTER_REVIEW_STATE });
          await updateChapterMeta({
            generationStage: 'generated',
            reviewIterations: (chapter?.reviewIterations || 0) + 1,
          });
          toast({
            variant: 'success',
            description: '已采用所选分支内容',
          });
        } catch (err) {
          console.error('Failed to apply branch', err);
          toast({
            variant: 'error',
            description: err instanceof Error ? err.message : '采用分支失败',
          });
        }
      },
    });
  };

  const handleIterate = async () => {
    if (!selectedBranch) return;
    await requestBranchIteration({
      selectedContent: selectedBranch.content,
      feedbackText: feedback,
      iterationRound: getNextBranchIterationRound(iterationRound),
      branchCount: branchCountSetting,
      clearSelectedBranch: true,
    });
  };

  const handleRegenerateBranches = async () => {
    setBranchCacheLoaded(false);
    const queued = await createJob('CHAPTER_GENERATE_BRANCHES', {
      branchCount: branchCountSetting,
    });
    if (!queued) return;
    setSelectedBranch(null);
    setBranchDetailMode('preview');
    setFeedback('');
  };

  const handleCopyBranchContent = useCallback(
    async (branch: Branch) => {
      if (!branch.content) return;
      try {
        await navigator.clipboard.writeText(branch.content);
        toast({
          variant: 'success',
          description: '已复制分支全文',
        });
      } catch (error) {
        console.error('Copy branch failed', error);
        toast({
          variant: 'error',
          description: '复制失败，请手动复制',
        });
      }
    },
    [toast]
  );

  const hasContent = !!content && content.trim().length > 0;
  const shouldRunConsistencyCheck = novel?.isFanfiction === true;
  const canGenerate = true;
  const canGenerateBranches = hasContent;
  const canReview = hasContent;
  const canDeai = hasContent;
  const canComplete = hasContent;
  const canCanonCheck = hasContent && novel?.isFanfiction;
  const hasConsistencyArtifacts = shouldRunConsistencyCheck && !!consistencyResult;
  const hasReviewArtifacts = !!(
    reviewState.hasReview ||
    reviewResult ||
    hasConsistencyArtifacts ||
    canonCheckResult ||
    canonCheckError
  );
  const runningJobCount = activeJobs.length;
  const postProcessEntries = POST_PROCESS_JOB_TYPES
    .map((type) => {
      const item = postProcessStatus[type];
      if (!item) return null;
      return { type, ...item };
    })
    .filter(Boolean) as Array<{ type: PostProcessJobType } & PostProcessStatusEntry>;
  const postProcessFailureCount = postProcessEntries.filter((item) => item.status === 'failed').length;

  const stageLabelMap: Record<string, string> = {
    draft: '草稿',
    generated: '已生成',
    reviewed: '已审阅',
    humanized: '已润色',
    approved: '已通过',
    completed: '已完成',
  };

  const stageToneMap: Record<string, string> = {
    draft: 'badge-neutral',
    generated: 'badge-info',
    reviewed: 'badge-warning',
    humanized: 'badge-info',
    approved: 'badge-success',
    completed: 'badge-success',
  };

  const stageKey = chapter?.generationStage || 'draft';
  const stageLabel = stageLabelMap[stageKey] || stageKey;
  const stageTone = stageToneMap[stageKey] || 'badge-neutral';

  const saveStatusTone = saveStatus === 'saved'
    ? 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30'
    : saveStatus === 'saving'
      ? 'text-amber-300 bg-amber-500/12 border-amber-500/30'
      : 'text-red-300 bg-red-500/12 border-red-500/30';
  const saveStatusDot = saveStatus === 'saved'
    ? 'bg-emerald-400'
    : saveStatus === 'saving'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-red-400';
  const saveStatusLabel = saveStatus === 'saved'
    ? '已保存'
    : saveStatus === 'saving'
      ? '保存中'
      : '待保存';
  const editorContainerMaxWidthClass = focusMode
    ? 'max-w-6xl'
    : isSidebarOpen
      ? 'max-w-[1120px]'
      : 'max-w-[1320px]';
  const editorTextMaxWidthClass = focusMode
    ? 'max-w-[980px]'
    : isSidebarOpen
      ? 'max-w-[860px]'
      : 'max-w-[980px]';
  const postProcessBadgeTone: Record<PostProcessDisplayStatus, string> = {
    running: 'border-sky-500/35 bg-sky-500/12 text-sky-200',
    succeeded: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
    failed: 'border-red-500/35 bg-red-500/12 text-red-200',
  };
  const postProcessStatusLabel: Record<PostProcessDisplayStatus, string> = {
    running: '进行中',
    succeeded: '完成',
    failed: '失败',
  };
  const modalCloseButtonClass = 'w-9 rounded-xl border border-white/10 bg-white/[0.03] px-0 text-zinc-400 hover:bg-white/10 hover:text-white';
  const modalPanelClass = 'w-full h-full flex flex-col rounded-[26px] overflow-hidden shadow-2xl border border-white/10 bg-[#0d111a]/96';

  const renderBranchPanel = () => {
    if (!mounted) return null;
    const isLoading = activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES');
    const selectedBranchCharCount = selectedBranch
      ? selectedBranch.content.replace(/\s+/g, '').length
      : 0;
    const visibleDiffRows = branchDiffOnlyChanges
      ? selectedBranchDiff.rows.filter((row) => row.status !== 'unchanged')
      : selectedBranchDiff.rows;

    return createPortal(
      <AnimatePresence>
        {showBranchPanel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="h-[90vh] w-full max-w-[1480px]"
            >
              <Card className={modalPanelClass}>
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-500/14 via-sky-500/8 to-transparent px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                      <Icons.GitBranch className="w-5 h-5 text-emerald-400" />
                      分支迭代生成
                      <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                        第 {iterationRound} 轮
                      </span>
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      选择一个满意的分支应用到正文，或者基于它进行下一轮迭代
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBranchPanel(false)}
                    className={modalCloseButtonClass}
                    aria-label="关闭分支面板"
                    title="关闭"
                  >
                    <Icons.X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-zinc-900/70 px-6 py-3">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                    候选分支 {branches.length}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">
                    当前展示 {displayedBranches.length}
                  </span>
                  {recommendedBranch && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border border-emerald-500/35 bg-emerald-500/12 px-2.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
                      onClick={() => {
                        setSelectedBranch(recommendedBranch);
                        setBranchDetailMode('preview');
                      }}
                    >
                      定位推荐分支
                    </Button>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="text-xs text-zinc-500">数量</label>
                    <select
                      value={branchCountSetting}
                      onChange={(event) => setBranchCountSetting(Number(event.target.value))}
                      className="h-8 rounded-lg border border-white/10 bg-zinc-950/75 px-2 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/35"
                    >
                      {BRANCH_COUNT_OPTIONS.map((count) => (
                        <option key={count} value={count}>
                          {count} 个
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-zinc-500">缓存最多保留 3 条</span>
                    <label className="text-xs text-zinc-500">筛选</label>
                    <select
                      value={branchVerdictFilter}
                      onChange={(event) => setBranchVerdictFilter(event.target.value as BranchVerdictFilter)}
                      className="h-8 rounded-lg border border-white/10 bg-zinc-950/75 px-2 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/35"
                    >
                      <option value="all">全部承接</option>
                      <option value="pass">承接通过</option>
                      <option value="revise">承接待优化</option>
                      <option value="reject">承接断层</option>
                    </select>
                    <label className="text-xs text-zinc-500">排序</label>
                    <select
                      value={branchSortMode}
                      onChange={(event) => setBranchSortMode(event.target.value as BranchSortMode)}
                      className="h-8 rounded-lg border border-white/10 bg-zinc-950/75 px-2 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/35"
                    >
                      <option value="recommended">推荐优先</option>
                      <option value="score">连续性得分</option>
                      <option value="latest">生成时间</option>
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8"
                      onClick={() => void handleRegenerateBranches()}
                      isLoading={isLoading}
                      loadingText="生成中..."
                    >
                      <Icons.RotateCcw className="h-3.5 w-3.5" />
                      重新生成
                    </Button>
                  </div>
                </div>

                {branchCacheLoaded && !isLoading && branches.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/8 px-6 py-2.5 text-xs text-emerald-100">
                    <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
                      已加载缓存
                    </span>
                    <span>这是你上次生成但未应用的分支结果。</span>
                    <span className="text-emerald-200/80">可直接采用，或点击右上“重新生成”覆盖缓存。</span>
                  </div>
                )}

                <div className="flex-1 flex overflow-hidden">
                  <div className={`${selectedBranch ? 'w-[42%] xl:w-[38%]' : 'w-full'} grid grid-cols-1 gap-4 overflow-y-auto p-5 transition-all duration-300 custom-scrollbar ${!selectedBranch ? 'lg:grid-cols-2 2xl:grid-cols-3' : ''}`}>
                    {isLoading ? (
                      <div className="col-span-full flex h-full flex-col items-center justify-center text-zinc-400">
                        <Icons.Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                        <p className="animate-pulse">AI 正在疯狂构思中...</p>
                      </div>
                    ) : branches.length === 0 ? (
                      <div className="col-span-full rounded-2xl border border-white/10 bg-zinc-900/40 py-20 text-center text-zinc-500">
                        暂无生成的分支，请点击"生成分支"开始
                      </div>
                    ) : displayedBranches.length === 0 ? (
                      <div className="col-span-full rounded-2xl border border-white/10 bg-zinc-900/40 py-20 text-center text-zinc-500">
                        当前筛选条件下没有可展示的分支
                      </div>
                    ) : (
                      displayedBranches.map((branch, idx) => {
                        const branchCharCount = branch.content.replace(/\s+/g, '').length;
                        const isSelected = selectedBranch?.id === branch.id;
                        return (
                        <Card 
                          key={branch.id}
                          onClick={() => {
                            setSelectedBranch(branch);
                            setBranchDetailMode('preview');
                          }}
                          className={`
                            group relative flex min-h-[290px] cursor-pointer flex-col rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl
                            ${isSelected
                              ? 'border-emerald-500/45 bg-emerald-500/12 shadow-emerald-500/20' 
                              : 'border-white/10 bg-zinc-900/55 hover:border-white/25 hover:bg-zinc-900/80'}
                          `}
                        >
                          <div className="mb-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">选项 {idx + 1}</span>
                              <div className="flex items-center gap-2">
                                {branch.continuityRecommended && (
                                  <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">
                                    推荐
                                  </span>
                                )}
                                <span className="text-xs text-zinc-600">{new Date(branch.createdAt).toLocaleTimeString()}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {typeof branch.continuityScore === 'number' && (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getContinuityTone(branch.continuityVerdict)}`}>
                                  连续性 {branch.continuityScore.toFixed(2)} · {getContinuityVerdictLabel(branch.continuityVerdict)}
                                </span>
                              )}
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
                                {branchCharCount} 字
                              </span>
                            </div>
                            {branch.continuityIssues && branch.continuityIssues.length > 0 && (
                              <p className="line-clamp-2 text-[11px] text-zinc-500">
                                {branch.continuityIssues[0]}
                              </p>
                            )}
                          </div>
                          <div className="line-clamp-8 flex-1 font-serif text-[15px] leading-7 text-zinc-300 opacity-85 group-hover:opacity-100">
                            {branch.content}
                          </div>
                          <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                            <Button
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="sm"
                              className="h-8 flex-1"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedBranch(branch);
                                setBranchDetailMode('preview');
                              }}
                            >
                              <Icons.Eye className="h-3.5 w-3.5" />
                              预览全文
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 flex-1 border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleApplyBranch(branch);
                              }}
                            >
                              <Icons.CheckCircle className="h-3.5 w-3.5" />
                              直接采用
                            </Button>
                          </div>
                        </Card>
                      )})
                    )}
                  </div>

                  {selectedBranch && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-[58%] border-l border-white/10 flex flex-col bg-[#0f1117]/65 xl:w-[62%]"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-white">
                            分支详情 {selectedBranch.branchNumber ? `#${selectedBranch.branchNumber}` : ''}
                          </div>
                          <div className="text-xs text-zinc-500">
                            生成于 {new Date(selectedBranch.createdAt).toLocaleString()} · {selectedBranchCharCount} 字
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 border border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-200 hover:bg-white/10"
                            onClick={() => void handleCopyBranchContent(selectedBranch)}
                          >
                            复制全文
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 border border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                            onClick={() => {
                              setSelectedBranch(null);
                              setBranchDetailMode('preview');
                            }}
                          >
                            收起预览
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        {typeof selectedBranch.continuityScore === 'number' && (
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-xs ${getContinuityTone(selectedBranch.continuityVerdict)}`}>
                              连续性 {selectedBranch.continuityScore.toFixed(2)} · {getContinuityVerdictLabel(selectedBranch.continuityVerdict)}
                            </span>
                            {selectedBranch.continuityRecommended && (
                              <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">
                                当前推荐分支
                              </span>
                            )}
                          </div>
                        )}
                        {selectedBranch.continuityIssues && selectedBranch.continuityIssues.length > 0 && (
                          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3">
                            <div className="mb-2 text-xs font-semibold text-amber-200">连续性风险提示</div>
                            <div className="space-y-2">
                              {selectedBranch.continuityIssues.map((issue, issueIdx) => (
                                <div key={`${issue}-${issueIdx}`} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-300" />
                                  <p className="flex-1 text-xs leading-relaxed text-amber-100/90">{issue}</p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 border border-amber-500/25 bg-amber-500/10 px-2 text-[10px] text-amber-200 hover:bg-amber-500/20"
                                    onClick={() =>
                                      setFeedback((prev) =>
                                        prev.trim() ? `${prev}\n处理点：${issue}` : `处理点：${issue}`
                                      )
                                    }
                                  >
                                    加入反馈
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <Button
                            variant={branchDetailMode === 'preview' ? 'primary' : 'ghost'}
                            size="sm"
                            className={`h-8 px-3 text-xs ${
                              branchDetailMode === 'preview'
                                ? ''
                                : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10'
                            }`}
                            onClick={() => setBranchDetailMode('preview')}
                          >
                            全文预览
                          </Button>
                          <Button
                            variant={branchDetailMode === 'diff' ? 'primary' : 'ghost'}
                            size="sm"
                            className={`h-8 px-3 text-xs ${
                              branchDetailMode === 'diff'
                                ? ''
                                : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10'
                            }`}
                            onClick={() => setBranchDetailMode('diff')}
                          >
                            差异对比
                          </Button>
                          {branchDetailMode === 'diff' && (
                            <>
                              <Button
                                variant={branchDiffLayout === 'split' ? 'primary' : 'ghost'}
                                size="sm"
                                className={`h-8 px-3 text-xs ${
                                  branchDiffLayout === 'split'
                                    ? ''
                                    : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10'
                                }`}
                                onClick={() => setBranchDiffLayout('split')}
                              >
                                并排视图
                              </Button>
                              <Button
                                variant={branchDiffLayout === 'unified' ? 'primary' : 'ghost'}
                                size="sm"
                                className={`h-8 px-3 text-xs ${
                                  branchDiffLayout === 'unified'
                                    ? ''
                                    : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10'
                                }`}
                                onClick={() => setBranchDiffLayout('unified')}
                              >
                                统一视图
                              </Button>
                              <label className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300">
                                <Checkbox
                                  checked={branchDiffOnlyChanges}
                                  onChange={(event) => setBranchDiffOnlyChanges(event.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-emerald-500"
                                  aria-label="仅查看变更行"
                                />
                                仅看变更
                              </label>
                              <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                                  +{selectedBranchDiff.addedLines} 行
                                </span>
                                <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 text-red-200">
                                  -{selectedBranchDiff.removedLines} 行
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-400">
                                  变更块 {selectedBranchDiff.changedBlocks}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-500">
                                  显示 {visibleDiffRows.length}/{selectedBranchDiff.rows.length} 行
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        {branchDetailMode === 'preview' ? (
                          <div className="prose prose-invert max-w-none font-serif text-[17px] text-zinc-200">
                             {selectedBranch.content.split('\n').map((paragraph, i) => (
                               paragraph.trim() && (
                                 <p key={i} className="mb-2 indent-[2em] text-justify leading-loose">
                                   {paragraph}
                                 </p>
                               )
                             ))}
                          </div>
                        ) : (
                          branchDiffLayout === 'split' ? (
                            <div className="overflow-auto rounded-2xl border border-white/10 bg-black/20">
                              <div className="sticky top-0 z-10 grid min-w-[820px] grid-cols-2 border-b border-white/10 bg-zinc-900/95 text-[11px] font-semibold tracking-wide text-zinc-400">
                                <div className="border-r border-white/10 px-3 py-2">当前正文</div>
                                <div className="px-3 py-2">候选分支</div>
                              </div>
                              <div className="min-w-[820px] font-mono text-[12px] leading-6">
                                {visibleDiffRows.length === 0 ? (
                                  <div className="px-4 py-8 text-center text-zinc-500">无差异内容</div>
                                ) : (
                                  visibleDiffRows.map((row, index) => (
                                    <div
                                      key={`${row.leftLineNo || 0}-${row.rightLineNo || 0}-${index}`}
                                      className="grid grid-cols-2 border-b border-white/5"
                                    >
                                      <div
                                        className={`border-r border-white/10 px-3 py-1.5 ${
                                          row.status === 'removed'
                                            ? 'bg-red-500/12 text-red-100'
                                            : row.status === 'changed'
                                              ? 'bg-amber-500/10 text-amber-100'
                                              : 'text-zinc-300'
                                        }`}
                                      >
                                        <span className="mr-2 inline-block min-w-[34px] select-none text-[10px] text-zinc-500">
                                          {typeof row.leftLineNo === 'number' ? row.leftLineNo : ''}
                                        </span>
                                        <span className={row.status === 'removed' ? 'line-through opacity-80' : ''}>
                                          {row.leftLine || ''}
                                        </span>
                                      </div>
                                      <div
                                        className={`px-3 py-1.5 ${
                                          row.status === 'added'
                                            ? 'bg-emerald-500/12 text-emerald-100'
                                            : row.status === 'changed'
                                              ? 'bg-amber-500/10 text-amber-100'
                                              : 'text-zinc-300'
                                        }`}
                                      >
                                        <span className="mr-2 inline-block min-w-[34px] select-none text-[10px] text-zinc-500">
                                          {typeof row.rightLineNo === 'number' ? row.rightLineNo : ''}
                                        </span>
                                        <span>{row.rightLine || ''}</span>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[13px] leading-6 text-zinc-200">
                              {selectedBranchDiff.parts
                                .filter((part) => !branchDiffOnlyChanges || part.added || part.removed)
                                .map((part, index) => (
                                  <div
                                    key={`${part.value.slice(0, 20)}-${index}`}
                                    className={`whitespace-pre-wrap px-2 py-1.5 ${
                                      part.added
                                        ? 'border-l-2 border-emerald-400 bg-emerald-500/12 text-emerald-100'
                                        : part.removed
                                          ? 'border-l-2 border-red-400 bg-red-500/12 text-red-100 line-through opacity-80'
                                          : 'text-zinc-300'
                                    }`}
                                  >
                                    {part.value}
                                  </div>
                                ))}
                            </div>
                          )
                        )}
                      </div>
                      
                      <div className="space-y-3 border-t border-white/10 bg-zinc-900/75 p-5 backdrop-blur-xl">
                        <Textarea
                          label="迭代反馈 (告诉 AI 如何改进此版本)"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="例如：稍微增加一些环境描写，或者让主角的语气更强硬一点..."
                          className="h-24 resize-none p-3 text-sm text-white placeholder-zinc-500"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          {BRANCH_FEEDBACK_PRESETS.map((preset) => (
                            <Button
                              key={preset}
                              variant="ghost"
                              size="sm"
                              className="h-7 border border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                              onClick={() =>
                                setFeedback((prev) => (prev.trim() ? `${prev}\n${preset}` : preset))
                              }
                            >
                              {preset}
                            </Button>
                          ))}
                          <span className="ml-auto text-[11px] text-zinc-500">
                            反馈 {feedback.trim().length} 字
                          </span>
                        </div>
                        
                        <ModalFooter className="justify-stretch border-t-0 pt-0 [&>.inline-flex]:flex-1 [&>.inline-flex]:min-w-[160px]">
                          <Button 
                            variant="primary" 
                            size="sm"
                            className="flex-1"
                            onClick={() => handleApplyBranch(selectedBranch)}
                          >
                            <Icons.CheckCircle className="w-4 h-4" /> 采用此版本
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm"
                            className="flex-1"
                            onClick={handleIterate}
                            isLoading={isLoading}
                            loadingText="迭代中..."
                          >
                            <Icons.RotateCcw className="w-4 h-4" /> 基于反馈迭代
                          </Button>
                        </ModalFooter>
                      </div>
                    </motion.div>
                  )}
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  };

  const updateReviewDecision = useCallback(
    async (action: 'approve' | 'reject'): Promise<boolean> => {
      try {
        const res = await fetch(`/api/chapters/${chapterId}/review-5dim`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          return false;
        }
        await fetchLatestReview();
        return true;
      } catch (err) {
        console.error('Failed to update review status', err);
        return false;
      }
    },
    [chapterId, fetchLatestReview]
  );

  const handleAcceptReview = async () => {
    const updated = await updateReviewDecision('approve');
    if (!updated) return;
    await updateChapterMeta({ generationStage: 'approved' });
    setShowReviewPanel(false);
  };

  const handleRejectReview = async () => {
    const updated = await updateReviewDecision('reject');
    if (!updated) return;
    await updateChapterMeta({ generationStage: 'generated' });
    setShowReviewPanel(false);
  };

  const handleCompleteChapter = async () => {
    await updateChapterMeta({ generationStage: 'completed' });
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters`);
      if (!res.ok) {
        router.push(`/novels/${novelId}`);
        return;
      }
      const data = await res.json();
      const chapters = data.chapters || [];
      const currentIndex = chapters.findIndex((item: Chapter) => item.id === chapterId);
      const nextChapter = currentIndex >= 0 ? chapters[currentIndex + 1] : null;
      if (nextChapter) {
        router.push(`/novels/${novelId}/chapters/${nextChapter.id}`);
      } else {
        router.push(`/novels/${novelId}`);
      }
    } catch (error) {
      console.error('Failed to navigate to next chapter', error);
      router.push(`/novels/${novelId}`);
    }
  };

  const renderReviewPanel = () => {
    if (!mounted) return null;
    const hasReview = reviewState.hasReview || !!reviewResult;
    const hasConsistency = shouldRunConsistencyCheck && !!consistencyResult;
    const isReviewing = activeJobs.some(
      (job) =>
        isReviewScoreJobType(job.type) ||
        (shouldRunConsistencyCheck && job.type === 'CONSISTENCY_CHECK')
    );

    const getScoreColor = (score: number) => {
      if (score >= 8) return 'text-emerald-400';
      if (score >= 6) return 'text-amber-400';
      return 'text-red-400';
    };

    const getProgressBarColor = (score: number) => {
      if (score >= 8) return 'bg-emerald-500';
      if (score >= 6) return 'bg-amber-500';
      return 'bg-red-500';
    };

    const normalized = normalizedReview;
    const normalizedConsistencyData = normalizedConsistency;
    const selectedSuggestionCount = selectedReviewSuggestions.length;
    const totalSuggestionCount = normalized.suggestions.length;

    const getConsistencySeverityTone = (
      severity: string
    ): { dot: string; tag: string } => {
      if (severity === 'critical') {
        return {
          dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]',
          tag: 'text-red-300 border-red-500/25 bg-red-500/15',
        };
      }
      if (severity === 'major' || severity === 'warning') {
        return {
          dot: 'bg-orange-500',
          tag: 'text-orange-300 border-orange-500/25 bg-orange-500/15',
        };
      }
      if (severity === 'minor') {
        return {
          dot: 'bg-amber-500',
          tag: 'text-amber-300 border-amber-500/25 bg-amber-500/15',
        };
      }
      return {
        dot: 'bg-zinc-500',
        tag: 'text-zinc-300 border-zinc-500/25 bg-zinc-500/15',
      };
    };

    const handleOneClickIterate = async () => {
      const combinedFeedback = composeReviewIterationFeedback({
        suggestions: selectedReviewSuggestions,
        userFeedback: reviewFeedback,
      });

      if (!combinedFeedback) return;

      setIsIterating(true);
      try {
        await updateReviewDecision('reject');
        await requestBranchIteration({
          selectedContent: content,
          feedbackText: combinedFeedback,
          iterationRound: getReviewIterationRound(chapter?.reviewIterations),
          branchCount: branchCountSetting,
          closeReviewPanel: true,
          clearReviewFeedback: true,
        });
      } finally {
        setIsIterating(false);
      }
    };

    const applyAllSuggestions = () => {
      setSelectedSuggestionKeys(
        buildDefaultSuggestionSelection(normalized.suggestions)
      );
    };

    const applyHighPrioritySuggestions = () => {
      setSelectedSuggestionKeys(
        buildHighPrioritySuggestionSelection(normalized.suggestions)
      );
    };

    const clearSelectedSuggestions = () => {
      setSelectedSuggestionKeys([]);
    };

    return createPortal(
      <AnimatePresence>
        {showReviewPanel && (hasReview || hasConsistency || isReviewing) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 md:p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-6xl h-[88vh]"
            >
              <Card className={modalPanelClass}>
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-500/14 via-sky-500/8 to-transparent px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                      <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                      章节评审报告
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      AI 对情节、节奏、人物等多维度的专业质量评审
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReviewPanel(false)}
                    className={modalCloseButtonClass}
                    aria-label="关闭评审报告"
                    title="关闭"
                  >
                    <Icons.X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border-b border-white/10 px-6 py-3">
                  <div className="inline-flex rounded-xl border border-white/10 bg-zinc-900/70 p-1">
                    {hasReview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setReviewPanelActiveTab('review')}
                        className={`h-9 rounded-lg border px-4 text-sm font-medium transition-colors ${
                          reviewPanelActiveTab === 'review'
                            ? 'border-emerald-500/30 bg-emerald-500/18 text-emerald-200'
                            : 'border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        质量评审
                      </Button>
                    )}
                    {hasConsistency && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setReviewPanelActiveTab('consistency')}
                        className={`h-9 rounded-lg border px-4 text-sm font-medium transition-colors ${
                          reviewPanelActiveTab === 'consistency'
                            ? 'border-emerald-500/30 bg-emerald-500/18 text-emerald-200'
                            : 'border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        一致性检查
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  {!hasReview && !hasConsistency && isReviewing && (
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-10 text-center text-zinc-400">
                      <Icons.Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-400" />
                      <p>评审任务执行中，结果生成后将自动展示。</p>
                    </div>
                  )}
                  {reviewPanelActiveTab === 'review' && reviewResult && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="md:col-span-1 p-6 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 to-sky-500/10 flex flex-col items-center justify-center text-center">
                          <div className="text-sm text-gray-400 mb-2 uppercase tracking-wider font-bold">综合得分</div>
                          <div className={`text-5xl font-bold mb-2 ${getScoreColor(normalized.avgScore)}`}>
                            {normalized.avgScore}<span className="text-xl text-gray-500">/10</span>
                          </div>
                          <div className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                            {normalized.grade}
                          </div>
                        </Card>

                        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {normalized.dimensions.map((dim) => (
                            <Card key={dim.key} className="p-4 rounded-xl border border-white/10 bg-zinc-900/55 flex flex-col justify-center">
                              <div className="flex justify-between items-end mb-2">
                                <span className="text-gray-400 text-sm">{dim.label}</span>
                                <span className={`font-bold ${getScoreColor(dim.score)}`}>
                                  {dim.score}
                                </span>
                              </div>
                              <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden mb-1">
                                <div 
                                  className={`h-full rounded-full transition-all duration-1000 ${getProgressBarColor(dim.score)}`}
                                  style={{ width: `${dim.score * 10}%` }}
                                />
                              </div>
                              {dim.comment && <div className="text-[10px] text-gray-500 truncate">{dim.comment}</div>}
                            </Card>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                          <Card className="p-6 rounded-2xl border border-white/10 bg-zinc-900/60">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                              <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                              评审详情与修改建议
                            </h3>
                            
                            {normalized.summary && (
                              <div className="mb-6 p-4 rounded-xl bg-zinc-900/65 border border-white/10 text-zinc-300 leading-relaxed text-sm">
                                {normalized.summary}
                              </div>
                            )}

                            {normalized.highlights.length > 0 && (
                              <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                                  优点亮点
                                </div>
                                <ul className="space-y-2 text-sm text-emerald-100/90">
                                  {normalized.highlights.map((highlight, index) => (
                                    <li key={`${highlight}-${index}`} className="flex gap-2">
                                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                      <span>{highlight}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {Object.keys(normalized.critique).length > 0 && (
                              <div className="mb-6 grid grid-cols-3 gap-2">
                                {normalized.critique.weakest_aspect && (
                                  <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg text-xs">
                                    <span className="block text-red-400/70 mb-0.5">最弱环节</span>
                                    <span className="text-red-300 font-bold">{normalized.critique.weakest_aspect}</span>
                                  </div>
                                )}
                                {normalized.critique.strongest_aspect && (
                                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg text-xs">
                                    <span className="block text-emerald-400/70 mb-0.5">最佳表现</span>
                                    <span className="text-emerald-300 font-bold">{normalized.critique.strongest_aspect}</span>
                                  </div>
                                )}
                                {normalized.critique.priority_fix && (
                                  <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-xs">
                                    <span className="block text-amber-400/70 mb-0.5">优先修改</span>
                                    <span className="text-amber-300 font-bold">{normalized.critique.priority_fix}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {normalized.suggestions.length > 0 ? (
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 border border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                                    onClick={applyAllSuggestions}
                                    disabled={isIterating}
                                  >
                                    全选建议
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 border border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                                    onClick={applyHighPrioritySuggestions}
                                    disabled={isIterating}
                                  >
                                    仅高优先
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 border border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/10"
                                    onClick={clearSelectedSuggestions}
                                    disabled={isIterating}
                                  >
                                    清空选择
                                  </Button>
                                  <span className="ml-auto text-[11px] text-zinc-500">
                                    已选 {selectedSuggestionCount}/{totalSuggestionCount}
                                  </span>
                                </div>
                                {normalized.suggestions.map((suggestion, idx) => (
                                  <details key={idx} className="group rounded-xl border border-white/10 bg-zinc-900/55 overflow-hidden open:bg-zinc-900/80 transition-colors">
                                    <summary className="flex items-start gap-3 p-4 cursor-pointer select-none">
                                      <label
                                        className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-zinc-400"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <Checkbox
                                          checked={selectedSuggestionKeys.includes(buildReviewSuggestionKey(suggestion, idx))}
                                          onChange={(event) => {
                                            const key = buildReviewSuggestionKey(suggestion, idx);
                                            setSelectedSuggestionKeys((prev) => {
                                              if (event.target.checked) {
                                                return prev.includes(key) ? prev : [...prev, key];
                                              }
                                              return prev.filter((item) => item !== key);
                                            });
                                          }}
                                          className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-emerald-500"
                                          disabled={isIterating}
                                          aria-label={`采用建议 ${suggestion.aspect}`}
                                        />
                                        采用
                                      </label>
                                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                        suggestion.priority === 'high' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 
                                        suggestion.priority === 'medium' ? 'bg-orange-500' : 
                                        'bg-yellow-500'
                                      }`} />
                                      <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                          <h4 className="font-bold text-gray-200 text-sm">{suggestion.aspect}</h4>
                                          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                            suggestion.priority === 'high' ? 'text-red-400 border-red-500/20 bg-red-500/10' : 
                                            suggestion.priority === 'medium' ? 'text-orange-400 border-orange-500/20 bg-orange-500/10' : 
                                            'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
                                          }`}>{getPriorityLabel(suggestion.priority)}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 line-clamp-2 group-open:line-clamp-none transition-all">{suggestion.issue}</p>
                                      </div>
                                      <Icons.ChevronLeft className="w-4 h-4 text-gray-500 transition-transform -rotate-90 group-open:rotate-90" />
                                    </summary>
                                    <div className="px-4 pb-4 pl-9 space-y-2">
                                      {suggestion.current && (
                                        <div className="text-xs bg-black/30 p-2 rounded border border-white/5 text-gray-500 font-mono">
                                          当前: {suggestion.current}
                                        </div>
                                      )}
                                      {suggestion.suggestion && (
                                        <div className="text-xs text-emerald-400/80 flex gap-2">
                                          <Icons.Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                          {suggestion.suggestion}
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            ) : Object.keys(normalized.critique).filter(k => !['weakest_aspect', 'strongest_aspect', 'priority_fix'].includes(k)).length > 0 ? (
                              <div className="space-y-3">
                                {Object.entries(normalized.critique).filter(([k]) => !['weakest_aspect', 'strongest_aspect', 'priority_fix'].includes(k)).map(([key, value]) => (
                                  <div key={key} className="bg-zinc-900/55 p-4 rounded-xl border border-white/10">
                                    <h4 className="font-bold text-emerald-300 mb-2 text-sm">
                                      {REVIEW_DIMENSION_LABELS[key] || key.replace(/_/g, ' ')}
                                    </h4>
                                    <p className="text-gray-300 text-sm leading-relaxed">{String(value)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-10 text-gray-500">
                                <Icons.CheckCircle className="w-12 h-12 text-emerald-500/20 mx-auto mb-3" />
                                <p>章节质量优秀，未发现明显问题！</p>
                              </div>
                            )}
                          </Card>
                        </div>

                        <div className="space-y-6">
                          <Card className="p-6 rounded-2xl bg-zinc-900/55 border border-white/10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">AI 修改方向</h3>
                            <div className="space-y-4">
                              {normalized.revisionPriority.length > 0 && (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                                  <div className="mb-2 text-xs text-amber-300">优先改进事项</div>
                                  <ol className="space-y-1 text-sm text-amber-100/90">
                                    {normalized.revisionPriority.slice(0, 5).map((item, index) => (
                                      <li key={`${item}-${index}`} className="flex gap-2">
                                        <span className="text-amber-300">{index + 1}.</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {normalized.revisionDirection ? (
                                <>
                                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                    <div className="text-xs text-gray-500 mb-1">核心改进方向</div>
                                    <div className="text-sm text-gray-300">
                                      {normalized.revisionDirection}
                                    </div>
                                  </div>
                                  {normalized.toneAdjustment && (
                                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                      <div className="text-xs text-gray-500 mb-1">语气调整</div>
                                      <div className="text-sm text-gray-300">{normalized.toneAdjustment}</div>
                                    </div>
                                  )}
                                  {normalized.pacingSuggestion && (
                                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                      <div className="text-xs text-gray-500 mb-1">节奏建议</div>
                                      <div className="text-sm text-gray-300">{normalized.pacingSuggestion}</div>
                                    </div>
                                  )}
                                </>
                              ) : normalized.suggestions.length > 0 ? (
                                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                  <div className="text-xs text-gray-500 mb-1">修改方向汇总</div>
                                  <div className="text-sm text-gray-300">
                                    {normalized.suggestions
                                      .slice(0, 3)
                                      .map((s) => s.suggestion || s.issue)
                                      .filter(Boolean)
                                      .join('；')}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 text-center py-4">暂无修改建议</div>
                              )}
                            </div>
                          </Card>
                        </div>
                      </div>
                    </div>
                  )}

                  {reviewPanelActiveTab === 'consistency' && hasConsistency && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <Card className="md:col-span-1 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 to-sky-500/10 p-6 text-center">
                          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-zinc-400">一致性总分</div>
                          <div className={`mb-2 text-5xl font-bold ${getScoreColor(normalizedConsistencyData.overallScore)}`}>
                            {normalizedConsistencyData.overallScore}
                            <span className="text-xl text-zinc-500">/10</span>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                            {normalizedConsistencyData.isConsistent ? '整体稳定' : '存在冲突'}
                          </div>
                        </Card>

                        <div className="md:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {normalizedConsistencyData.dimensions.map((dimension) => (
                            <Card key={dimension.key} className="flex flex-col justify-center rounded-xl border border-white/10 bg-zinc-900/55 p-4">
                              <div className="mb-2 flex items-end justify-between">
                                <span className="text-sm text-zinc-400">{dimension.label}</span>
                                <span className={`font-bold ${getScoreColor(dimension.score)}`}>{dimension.score}</span>
                              </div>
                              <div className="mb-1 h-2 overflow-hidden rounded-full bg-zinc-700/50">
                                <div
                                  className={`h-full rounded-full transition-all duration-1000 ${getProgressBarColor(dimension.score)}`}
                                  style={{ width: `${dimension.score * 10}%` }}
                                />
                              </div>
                              {dimension.comment && (
                                <div className="truncate text-[10px] text-zinc-500">{dimension.comment}</div>
                              )}
                            </Card>
                          ))}
                          {normalizedConsistencyData.dimensions.length === 0 && (
                            <Card className="rounded-xl border border-white/10 bg-zinc-900/55 p-4 text-sm text-zinc-500">
                              暂无维度评分数据
                            </Card>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-2">
                          <Card className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
                            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                              <Icons.CheckCircle className="h-5 w-5 text-emerald-400" />
                              一致性检查详情
                            </h3>
                            {normalizedConsistencyData.summary && (
                              <div className="mb-4 rounded-xl border border-white/10 bg-zinc-900/65 p-4 text-sm leading-relaxed text-zinc-300">
                                {normalizedConsistencyData.summary}
                              </div>
                            )}

                            {normalizedConsistencyData.issues.length > 0 ? (
                              <div className="space-y-3">
                                {normalizedConsistencyData.issues.map((issue, index) => {
                                  const tone = getConsistencySeverityTone(issue.severity);
                                  return (
                                    <details
                                      key={`${issue.id}-${index}`}
                                      className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900/55 transition-colors open:bg-zinc-900/80"
                                    >
                                      <summary className="flex cursor-pointer select-none items-start gap-3 p-4">
                                        <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${tone.dot}`} />
                                        <div className="flex-1">
                                          <div className="mb-1 flex items-start justify-between gap-2">
                                            <h4 className="text-sm font-bold text-zinc-200">
                                              {issue.title}
                                            </h4>
                                            <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone.tag}`}>
                                              {getSeverityLabel(issue.severity)}
                                            </span>
                                          </div>
                                          <p className="line-clamp-2 text-xs text-zinc-400 transition-all group-open:line-clamp-none">
                                            {issue.description}
                                          </p>
                                        </div>
                                        <Icons.ChevronLeft className="h-4 w-4 -rotate-90 text-zinc-500 transition-transform group-open:rotate-90" />
                                      </summary>
                                      <div className="space-y-2 px-4 pb-4 pl-9">
                                        {issue.location && (
                                          <div className="text-xs text-zinc-500">位置：{issue.location}</div>
                                        )}
                                        {issue.evidence && (
                                          <div className="rounded border border-white/5 bg-black/30 p-2 font-mono text-xs text-zinc-500">
                                            证据：{issue.evidence}
                                          </div>
                                        )}
                                        {issue.suggestion && (
                                          <div className="flex gap-2 text-xs text-emerald-300/85">
                                            <Icons.Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                            {issue.suggestion}
                                          </div>
                                        )}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="py-10 text-center text-zinc-400">
                                <Icons.CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-500/40" />
                                <p>未发现明显一致性问题，设定承接良好。</p>
                              </div>
                            )}
                          </Card>
                        </div>

                        <div className="space-y-6">
                          <Card className="rounded-2xl border border-white/10 bg-zinc-900/55 p-6">
                            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">优点亮点</h3>
                            {normalizedConsistencyData.highlights.length > 0 ? (
                              <ul className="space-y-2 text-sm text-emerald-100/90">
                                {normalizedConsistencyData.highlights.map((highlight, index) => (
                                  <li key={`${highlight}-${index}`} className="flex gap-2">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    <span>{highlight}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-sm text-zinc-500">暂无优点摘要</div>
                            )}
                          </Card>

                          <Card className="rounded-2xl border border-white/10 bg-zinc-900/55 p-6">
                            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">改进点</h3>
                            {normalizedConsistencyData.improvements.length > 0 ? (
                              <ol className="space-y-2 text-sm text-amber-100/90">
                                {normalizedConsistencyData.improvements.map((item, index) => (
                                  <li key={`${item}-${index}`} className="flex gap-2">
                                    <span className="text-amber-300">{index + 1}.</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <div className="text-sm text-zinc-500">暂无改进建议</div>
                            )}

                            {normalizedConsistencyData.nextActions.length > 0 && (
                              <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                                <div className="mb-2 text-xs text-sky-300">下一步建议</div>
                                <ul className="space-y-1 text-xs text-sky-100/90">
                                  {normalizedConsistencyData.nextActions.map((action, index) => (
                                    <li key={`${action}-${index}`} className="flex gap-2">
                                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-300" />
                                      <span>{action}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </Card>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
                
                <div className="space-y-4 border-t border-white/10 bg-zinc-900/75 p-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Textarea
                        label="补充修改意见（可选）"
                        value={reviewFeedback}
                        onChange={(e) => setReviewFeedback(e.target.value)}
                        placeholder="补充您的修改意见，将与 AI 建议一起作为迭代方向..."
                        className="h-20 resize-none p-3 text-sm text-white placeholder-zinc-500"
                        disabled={isIterating}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-zinc-500">
                      {totalSuggestionCount > 0 && `将采用 ${selectedSuggestionCount} / ${totalSuggestionCount} 条 AI 修改建议`}
                      {reviewFeedback.trim() && totalSuggestionCount > 0 && ' + '}
                      {reviewFeedback.trim() && '您的补充意见'}
                      {(reviewState.lastReviewAt || reviewState.approvedAt) && (
                        <span className="ml-2 text-zinc-600">
                          最近审阅 {formatReviewTimestamp(reviewState.lastReviewAt)}
                          {reviewState.approvedAt && ` · 通过于 ${formatReviewTimestamp(reviewState.approvedAt)}`}
                        </span>
                      )}
                    </div>
                    <ModalFooter className="border-t-0 pt-0 sm:justify-end">
                      <Button variant="secondary" size="sm" onClick={() => setShowReviewPanel(false)} disabled={isIterating}>关闭</Button>
                      <Button 
                        variant="primary" 
                        size="sm"
                        onClick={handleOneClickIterate}
                        disabled={(!selectedSuggestionCount && !reviewFeedback.trim()) || isIterating}
                        isLoading={isIterating}
                        loadingText="优化中..."
                      >
                        <Icons.RotateCcw className="w-4 h-4" /> 一键迭代优化
                      </Button>
                      <Button variant="ghost" size="sm" className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10" onClick={handleAcceptReview} disabled={isIterating}>
                        <Icons.CheckCircle className="w-4 h-4" /> 接受评审
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
                        onClick={handleRejectReview}
                        disabled={isIterating}
                      >
                        <Icons.X className="w-4 h-4" /> 标记驳回
                      </Button>
                    </ModalFooter>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  };

  const renderCanonCheckPanel = () => {
    if (!mounted) return null;
    const getScoreColor = (score: any) => {
      if (typeof score !== 'number') return 'text-gray-400';
      if (score >= 8) return 'text-emerald-400';
      if (score >= 6) return 'text-amber-400';
      return 'text-red-400';
    };

    const getProgressBarColor = (score: number) => {
      if (score >= 8) return 'bg-emerald-500';
      if (score >= 6) return 'bg-amber-500';
      return 'bg-red-500';
    };

    const dimensionScores = canonCheckResult?.dimension_scores || {};
    const scores = Object.values(dimensionScores)
      .map((v: any) => v?.score || 0)
      .filter((s: any) => typeof s === 'number');
    const avgScore = scores.length > 0 
      ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 
      : 0;
    
    const overallGrade = canonCheckResult?.overall_assessment?.grade || (typeof canonCheckResult?.overall_assessment === 'string' ? canonCheckResult.overall_assessment : null) || (avgScore >= 8 ? '高度还原' : avgScore >= 6 ? '良' : '需改进');
    
    const rawSummary = canonCheckResult?.overall_assessment?.summary || canonCheckResult?.summary;
    const summaryText = typeof rawSummary === 'string' ? rawSummary : (typeof canonCheckResult?.summary === 'string' ? canonCheckResult.summary : '');
    const summaryObj = typeof rawSummary === 'object' ? rawSummary : (typeof canonCheckResult?.summary === 'object' ? canonCheckResult.summary : null);

    return createPortal(
      <AnimatePresence>
        {showCanonCheckPanel && (canonCheckResult || canonCheckError) && (
          canonCheckError ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 md:p-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
              >
                <Card className="w-full flex flex-col rounded-[26px] overflow-hidden shadow-2xl border border-white/10 bg-[#0d111a]/96 p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                    <Icons.X className="w-8 h-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">检测失败</h2>
                  <p className="text-zinc-400 mb-8">{canonCheckError}</p>
                  <ModalFooter className="justify-center border-t-0 pt-0 [&>.inline-flex]:min-w-[108px]">
                    <Button variant="secondary" size="sm" onClick={() => setShowCanonCheckPanel(false)}>关闭</Button>
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => {
                        setCanonCheckError(null);
                        createJob('CANON_CHECK');
                      }}
                    >
                      <Icons.RotateCcw className="w-4 h-4" /> 重试
                    </Button>
                  </ModalFooter>
                </Card>
              </motion.div>
            </div>
          ) : (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 md:p-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-6xl h-[88vh]"
              >
                <Card className={modalPanelClass}>
                  <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-amber-500/14 via-sky-500/8 to-transparent px-6 py-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                        <Icons.BookOpen className="w-5 h-5 text-amber-400" />
                        原作符合度检查
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        基于设定集(Lorebook)的深度一致性分析报告
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCanonCheckPanel(false)}
                      className={modalCloseButtonClass}
                      aria-label="关闭原作符合度面板"
                      title="关闭"
                    >
                      <Icons.X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                      <Card className="md:col-span-1 p-6 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 to-sky-500/10 flex flex-col items-center justify-center text-center">
                        <div className="text-sm text-zinc-400 mb-2 uppercase tracking-wider font-bold">综合得分</div>
                        <div className={`text-5xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                          {avgScore}<span className="text-xl text-zinc-500">/10</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white/5 text-xs text-zinc-300 border border-white/10">
                          {overallGrade}
                        </div>
                      </Card>

                      <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {Object.entries(dimensionScores).map(([key, value]: [string, any]) => {
                           const score = value?.score || 0;
                           const comment = value?.comment;
                            const label = CANON_DIMENSION_LABELS[key] || key.replace(/_/g, ' ');
                           return (
                             <Card key={key} className="p-4 rounded-xl border border-white/10 bg-zinc-900/55 flex flex-col justify-center">
                               <div className="flex justify-between items-end mb-2">
                                 <span className="text-gray-400 text-sm">{label}</span>
                                 <span className={`font-bold ${getScoreColor(score)}`}>
                                   {score}
                                 </span>
                               </div>
                               <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden mb-1">
                                 <div 
                                   className={`h-full rounded-full transition-all duration-1000 ${getProgressBarColor(score)}`}
                                   style={{ width: `${score * 10}%` }}
                                 />
                               </div>
                               {comment && <div className="text-[10px] text-gray-500 truncate">{comment}</div>}
                             </Card>
                           );
                         })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 space-y-6">
                        <Card className="p-6 rounded-2xl border border-white/10 bg-zinc-900/60">
                          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                            检测详情与建议
                          </h3>
                          

                          {(summaryText || summaryObj) && (
                            <div className="mb-6 space-y-3">
                              {summaryText && (
                                <div className="p-4 rounded-xl bg-zinc-900/65 border border-white/10 text-zinc-300 leading-relaxed text-sm">
                                  {summaryText}
                                </div>
                              )}
                              

                              {summaryObj && (
                                 <div className="grid grid-cols-3 gap-2">
                                    {summaryObj.most_problematic_character && (
                                      <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg text-xs">
                                        <span className="block text-red-400/70 mb-0.5">问题最大角色</span>
                                        <span className="text-red-300 font-bold">{summaryObj.most_problematic_character}</span>
                                      </div>
                                    )}
                                    {summaryObj.strongest_aspect && (
                                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg text-xs">
                                        <span className="block text-emerald-400/70 mb-0.5">最佳表现</span>
                                        <span className="text-emerald-300 font-bold">{summaryObj.strongest_aspect}</span>
                                      </div>
                                    )}
                                    {summaryObj.weakest_aspect && (
                                      <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-xs">
                                        <span className="block text-amber-400/70 mb-0.5">最弱环节</span>
                                        <span className="text-amber-300 font-bold">{summaryObj.weakest_aspect}</span>
                                      </div>
                                    )}
                                 </div>
                              )}
                            </div>
                          )}
                          
                          {canonCheckResult.issues && canonCheckResult.issues.length > 0 ? (
                            <div className="space-y-3">
                              {canonCheckResult.issues.map((issue: any, idx: number) => (
                                <details key={idx} className="group rounded-xl border border-white/10 bg-zinc-900/55 overflow-hidden open:bg-zinc-900/80 transition-colors">
                                  <summary className="flex items-start gap-3 p-4 cursor-pointer select-none">
                                    <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                      issue.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 
                                      issue.severity === 'major' ? 'bg-orange-500' : 
                                      'bg-yellow-500'
                                    }`} />
                                    <div className="flex-1">
                                      <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-gray-200 text-sm">{issue.type || '检测项'}</h4>
                                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                          issue.severity === 'critical' ? 'text-red-400 border-red-500/20 bg-red-500/10' : 
                                          issue.severity === 'major' ? 'text-orange-400 border-orange-500/20 bg-orange-500/10' : 
                                          'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
                                        }`}>{getSeverityLabel(issue.severity)}</span>
                                      </div>
                                      <p className="text-xs text-gray-400 line-clamp-2 group-open:line-clamp-none transition-all">{issue.description}</p>
                                    </div>
                                    <Icons.ChevronLeft className="w-4 h-4 text-gray-500 transition-transform -rotate-90 group-open:rotate-90" />
                                  </summary>
                                  <div className="px-4 pb-4 pl-9 space-y-2">
                                    {issue.reference && (
                                      <div className="text-xs bg-black/30 p-2 rounded border border-white/5 text-gray-500 font-mono">
                                        {issue.reference}
                                      </div>
                                    )}
                                    {issue.suggestion && (
                                      <div className="text-xs text-emerald-400/80 flex gap-2">
                                        <Icons.Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                        {issue.suggestion}
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-10 text-gray-500">
                              <Icons.CheckCircle className="w-12 h-12 text-emerald-500/20 mx-auto mb-3" />
                              <p>未发现严重冲突，继续保持！</p>
                            </div>
                          )}
                        </Card>
                      </div>

                      <div className="space-y-6">
                        <Card className="p-6 rounded-2xl bg-zinc-900/55 border border-white/10">
                           <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">AI 分析</h3>
                           <div className="space-y-4">
                             <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                               <div className="text-xs text-gray-500 mb-1">叙事节奏</div>
                               <div className="text-sm text-gray-300">
                                 {canonCheckResult?.pacing_analysis || '暂无分析'}
                               </div>
                             </div>
                             <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                               <div className="text-xs text-gray-500 mb-1">情感张力</div>
                               <div className="text-sm text-gray-300">
                                 {canonCheckResult?.emotional_resonance || '暂无分析'}
                               </div>
                             </div>
                           </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          )
        )}
      </AnimatePresence>,
      document.body
    );
  };

  const renderDiffModal = () => {
    if (!mounted) return null;
    
    return createPortal(
      <AnimatePresence>
        {showDiff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl h-[84vh]"
            >
              <Card className={modalPanelClass}>
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-sky-500/14 via-emerald-500/10 to-transparent p-6">
                  <div>
                    <h3 className="text-xl font-bold text-white">版本对比</h3>
                    <p className="text-sm text-zinc-400">对比 {new Date(showDiff.createdAt).toLocaleString()} 的版本与当前版本</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" size="sm" onClick={() => setShowDiff(null)}>关闭</Button>
                    <Button variant="primary" size="sm" onClick={() => handleRestore(showDiff.id)}>
                      <Icons.RotateCcw className="w-4 h-4" /> 恢复此版本
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed bg-zinc-950/35">
                  {Diff.diffLines(showDiff.content || '', content || '').map((part, index) => (
                    <div 
                      key={index}
                      className={`
                        ${part.added ? 'bg-emerald-500/15 text-emerald-200 border-l-2 border-emerald-400' : ''}
                        ${part.removed ? 'bg-red-500/18 text-red-200 border-l-2 border-red-400 decoration-line-through opacity-80' : ''}
                        ${!part.added && !part.removed ? 'text-zinc-300' : ''}
                        px-4 py-1.5 whitespace-pre-wrap
                      `}
                    >
                      {part.value}
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  };

  if (!chapter) return <div className="flex items-center justify-center h-screen bg-[var(--color-dark-bg)]"><Icons.Loader2 className="animate-spin w-8 h-8 text-emerald-500" /></div>;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={fadeIn}
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-dark-bg)] transition-all duration-500 ${focusMode ? 'fixed inset-0 z-50 h-screen' : ''}`}
    >
      <header className={`z-20 shrink-0 border-b border-white/10 bg-[#0d1017]/90 backdrop-blur-md transition-all duration-300 ${focusMode ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="mx-auto flex w-full flex-col gap-2 px-4 py-2 lg:px-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="mt-0.5 w-9 rounded-xl border border-white/10 bg-white/5 px-0 text-gray-300 hover:bg-white/10 hover:text-white"
                aria-label="返回"
                title="返回"
              >
                <Icons.ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="space-y-1">
                <div className="hidden items-center gap-2 text-xs text-gray-500 lg:flex">
                  <span>小说列表</span>
                  <span>/</span>
                  <span className="truncate max-w-[180px]">章节编辑</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="max-w-[420px] truncate text-base font-semibold text-zinc-100 sm:text-lg">
                    {title || '未命名章节'}
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${saveStatusTone}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${saveStatusDot}`} />
                    {saveStatusLabel}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${stageTone}`}>
                    {stageLabel}
                  </span>
                  {runningJobCount > 0 && (
                    <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/12 px-2.5 py-1 text-[11px] font-medium text-sky-300">
                      {runningJobCount} 个任务执行中
                    </span>
                  )}
                  {reviewState.pendingReview && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/12 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                      待审阅确认
                    </span>
                  )}
                  {!reviewState.pendingReview && reviewState.approvedAt && (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                      已审阅通过
                    </span>
                  )}
                  {isReviewResultStale && !reviewState.pendingReview && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/12 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                      评审已过期
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <Button
                variant={saveStatus === 'unsaved' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => void handleManualSave()}
                isLoading={saveStatus === 'saving'}
                loadingText="保存中..."
                className={`h-8 rounded-xl px-3 text-xs ${saveStatus === 'unsaved' ? 'shadow-lg shadow-emerald-500/20' : ''}`}
                title={`手动保存（${shortcutSaveHint}）`}
              >
                <Icons.Save className="h-3.5 w-3.5" />
                保存
                <span className="hidden rounded-md border border-white/15 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 lg:inline">
                  {shortcutSaveHint}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocusMode(!focusMode)}
                className="h-8 w-8 rounded-xl border border-white/10 bg-white/5 px-0 text-gray-300 hover:bg-white/10 hover:text-white"
                title={focusMode ? '退出专注模式' : '进入专注模式'}
                aria-label={focusMode ? '退出专注模式' : '进入专注模式'}
              >
                {focusMode ? <Icons.Minimize className="h-4 w-4" /> : <Icons.Maximize className="h-4 w-4" />}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`h-8 w-8 rounded-xl border px-0 transition-colors ${
                  isSidebarOpen
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200 shadow-lg shadow-emerald-500/20'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
                title={isSidebarOpen ? '隐藏版本历史' : '显示版本历史'}
                aria-label={isSidebarOpen ? '隐藏版本历史' : '显示版本历史'}
              >
                <Icons.PanelRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-2xl border border-white/10 bg-zinc-900/65 p-2 shadow-inner shadow-black/20">
              <Button
                variant="primary"
                size="sm"
                className="h-8 min-w-[88px] shrink-0"
                onClick={() => createJob('CHAPTER_GENERATE')}
                isLoading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE')}
                loadingText="生成中..."
                disabled={!canGenerate}
              >
                <Icons.Sparkles className="h-3.5 w-3.5" />
                生成
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 min-w-[96px] shrink-0"
                onClick={() => void handleOpenBranchPanel()}
                isLoading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES')}
                loadingText="生成中..."
                disabled={!canGenerateBranches}
              >
                <Icons.GitBranch className="h-3.5 w-3.5 text-sky-300" />
                生成分支
              </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 min-w-[82px] shrink-0"
                  onClick={() => {
                    createJob('REVIEW_SCORE_5DIM');
                    if (shouldRunConsistencyCheck) {
                      createJob('CONSISTENCY_CHECK');
                    }
                    setShowReviewPanel(true);
                    setReviewPanelActiveTab('review');
                  }}
                  isLoading={activeJobs.some(
                    (job) =>
                      isReviewScoreJobType(job.type) ||
                      (shouldRunConsistencyCheck && job.type === 'CONSISTENCY_CHECK')
                  )}
                  loadingText="审阅中..."
                  disabled={!canReview}
                >
                <Icons.CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
                审阅
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 min-w-[82px] shrink-0"
                onClick={() => createJob('DEAI_REWRITE')}
                isLoading={activeJobs.some(j => j.type === 'DEAI_REWRITE')}
                loadingText="润色中..."
                disabled={!canDeai}
              >
                <Icons.Wand2 className="h-3.5 w-3.5 text-violet-300" />
                润色
              </Button>
              {deaiRollbackVersionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 min-w-[128px] shrink-0 border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
                  onClick={handleRollbackBeforeDeai}
                  disabled={activeJobs.some((job) => job.type === 'DEAI_REWRITE')}
                  title="回退到最近一次润色前的内容"
                >
                  <Icons.RotateCcw className="h-3.5 w-3.5 text-amber-300" />
                  回退润色前
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="h-8 min-w-[92px] shrink-0"
                onClick={handleMemoryExtract}
                isLoading={activeJobs.some(j => j.type === 'MEMORY_EXTRACT')}
                loadingText="提取中..."
                disabled={saveStatus !== 'saved'}
                title="提取记忆到设定集"
              >
                <Icons.Brain className="h-3.5 w-3.5 text-pink-300" />
                提取记忆
              </Button>
              {novel?.isFanfiction && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 min-w-[106px] shrink-0 border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
                  onClick={() => {
                    setCanonCheckError(null);
                    createJob('CANON_CHECK');
                  }}
                  isLoading={activeJobs.some(j => j.type === 'CANON_CHECK')}
                  loadingText="检查中..."
                  disabled={!canCanonCheck || saveStatus !== 'saved'}
                  title="检查章节内容是否符合原作设定（同人文专用）"
                >
                  <Icons.BookOpen className="h-3.5 w-3.5 text-amber-300" />
                  原作符合度
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                className="h-8 min-w-[86px] shrink-0 from-emerald-500 to-teal-500"
                onClick={handleCompleteChapter}
                disabled={!canComplete}
              >
                <Icons.CheckCircle className="h-3.5 w-3.5" />
                完成章节
              </Button>
            </div>

            <div className="w-full space-y-2 2xl:w-auto 2xl:min-w-[500px] 2xl:max-w-[760px]">
              {postProcessWarning && (
                <div className="inline-flex w-full min-w-0 items-center gap-2 rounded-2xl border border-red-500/35 bg-red-500/12 px-3 py-2 text-[11px] text-red-200">
                  <span className="min-w-0 flex-1 truncate" title={postProcessWarning}>{postProcessWarning}</span>
                  <button
                    type="button"
                    onClick={() => setPostProcessWarning(null)}
                    className="shrink-0 rounded-md border border-red-400/30 px-1.5 py-0.5 text-[10px] text-red-100 hover:bg-red-500/20"
                  >
                    关闭
                  </button>
                </div>
              )}

              <div className={`rounded-2xl border px-3 py-2 ${
                postProcessFailureCount > 0
                  ? 'border-red-500/25 bg-red-500/10'
                  : 'border-white/10 bg-zinc-900/60'
              }`}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">
                    后处理
                  </span>
                  {postProcessEntries.length > 0 ? (
                    postProcessEntries.map((item) => (
                      <span
                        key={item.type}
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${postProcessBadgeTone[item.status]}`}
                        title={item.error || `${POST_PROCESS_LABELS[item.type]}${postProcessStatusLabel[item.status]}`}
                      >
                        {POST_PROCESS_LABELS[item.type]}·{postProcessStatusLabel[item.status]}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-zinc-500">暂无后处理任务</span>
                  )}

                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
                    {hasReviewArtifacts && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(reviewState.hasReview || reviewResult || hasConsistencyArtifacts) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 border border-emerald-500/30 bg-emerald-500/12 px-2.5 text-[11px] text-emerald-200 hover:bg-emerald-500/22"
                            onClick={() => setShowReviewPanel(true)}
                            title="查看审阅结果"
                          >
                            <Icons.CheckCircle className="h-3.5 w-3.5" />
                            审阅结果
                          </Button>
                        )}
                        {(canonCheckResult || canonCheckError) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={canonCheckError
                              ? 'h-8 border border-red-500/30 bg-red-500/12 px-2.5 text-[11px] text-red-200 hover:bg-red-500/22'
                              : 'h-8 border border-amber-500/30 bg-amber-500/12 px-2.5 text-[11px] text-amber-200 hover:bg-amber-500/22'}
                            onClick={() => setShowCanonCheckPanel(true)}
                            title="查看原作符合度结果"
                          >
                            <Icons.BookOpen className="h-3.5 w-3.5" />
                            {canonCheckError ? '检测失败' : '符合度结果'}
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-zinc-400">
                      <span className="font-mono">{wordCount} 字</span>
                      <span className="h-3 w-px bg-white/10" />
                      <span className="font-mono">{charCount} 字符</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <motion.main
          layout
          className="relative flex h-full flex-1 flex-col bg-[#0f1117] transition-all duration-300"
        >
          {focusMode && (
            <div className="absolute right-4 top-4 z-50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocusMode(false)}
                className="w-9 rounded-full border border-white/15 bg-black/55 px-0 text-white/80 backdrop-blur-md hover:bg-black/70 hover:text-white"
                title="退出专注模式"
                aria-label="退出专注模式"
              >
                <Icons.Minimize className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            <div className={`mx-auto flex h-full w-full px-4 pb-3 pt-2 transition-all duration-500 md:px-8 lg:px-10 ${editorContainerMaxWidthClass}`}>
              <div className="flex h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/70 shadow-[0_24px_70px_-28px_rgba(16,185,129,0.35)] backdrop-blur-md">
                <div className="flex h-full w-full flex-col px-6 pb-3 pt-3 md:px-8">
                  <div className={`mx-auto flex h-full w-full flex-col ${editorTextMaxWidthClass}`}>
                    <div className="mb-3 shrink-0 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/45 px-3 py-1.5 text-[11px] text-zinc-500">
                      <span>自动保存已开启，离开输入框会立即保存</span>
                    </div>
                    <textarea
                      value={content}
                      onChange={handleContentChange}
                      onBlur={handleBlur}
                      className="custom-scrollbar h-full min-h-0 w-full resize-none overflow-y-auto border-none bg-transparent pr-2 font-serif text-[1.04rem] leading-[1.9] tracking-[0.008em] text-zinc-300 placeholder-zinc-700 selection:bg-emerald-500/30 focus:outline-none focus:ring-0 md:text-[1.12rem]"
                      placeholder="开始创作你的章节内容..."
                      aria-label="章节正文"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`shrink-0 overflow-hidden transition-all duration-300 ${focusMode ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100'}`}>
            <div className="flex h-11 items-center justify-between border-t border-white/10 bg-[#0f1117]/92 px-4 text-xs text-zinc-500 backdrop-blur-md sm:px-6">
              <div className="flex items-center gap-4 font-mono sm:gap-6">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  {wordCount} 字
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  {charCount} 字符
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${saveStatusTone}`}>
                  {saveStatus === 'saved' ? (
                    <>
                      <Icons.CheckCircle className="h-3 w-3" />
                      所有更改已保存
                    </>
                  ) : saveStatus === 'saving' ? (
                    <>
                      <Icons.Loader2 className="h-3 w-3 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Icons.X className="h-3 w-3" />
                      等待保存
                    </>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleManualSave()}
                  disabled={saveStatus === 'saving'}
                  className="h-7 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white"
                  title={`手动保存（${shortcutSaveHint}）`}
                >
                  <Icons.Save className="h-3 w-3" />
                  保存
                </Button>
              </div>
            </div>
          </div>
        </motion.main>

        <motion.aside
          initial={false}
          animate={{
            width: isSidebarOpen && !focusMode ? 320 : 0,
            opacity: isSidebarOpen && !focusMode ? 1 : 0,
          }}
          transition={{ ease: 'easeInOut', duration: 0.3 }}
          className="z-20 flex flex-col overflow-hidden border-l border-white/10 bg-[#121521]/95 shadow-2xl"
        >
          <div className="min-w-[320px] border-b border-white/10 bg-white/[0.02] px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-100">
                <Icons.History className="h-4 w-4 text-emerald-300" />
                版本历史
              </h2>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void fetchVersions()}
                  className="h-7 w-7 rounded-lg border border-white/10 bg-white/[0.03] px-0 text-zinc-400 hover:bg-white/10 hover:text-white"
                  title="刷新版本历史"
                  aria-label="刷新版本历史"
                >
                  <Icons.RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
                  {versions.length}
                </span>
              </div>
            </div>
          </div>

          <div className="custom-scrollbar min-w-[320px] flex-1 space-y-3 overflow-y-auto p-4">
            {versions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-zinc-600">
                  <Icons.History className="h-6 w-6" />
                </div>
                <div className="text-sm text-zinc-500">暂无历史版本</div>
                <div className="mt-1 text-xs text-zinc-600">系统会自动保存你的写作进度</div>
                <div className="mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSidebarOpen(false)}
                    className="h-8 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                  >
                    收起侧栏
                  </Button>
                </div>
              </div>
            ) : (
              versions.map((version) => (
                <Card key={version.id} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="block text-[11px] font-mono text-zinc-400">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#1a1d28] p-1 shadow-lg">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setShowDiff(version); }}
                        className="h-8 w-8 rounded-md px-0 text-zinc-400 hover:bg-white/10 hover:text-white"
                        title="查看变更"
                        aria-label="查看变更"
                      >
                        <Icons.Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleRestore(version.id); }}
                        className="h-8 w-8 rounded-md px-0 text-zinc-400 hover:bg-white/10 hover:text-white"
                        title="恢复版本"
                        aria-label="恢复版本"
                      >
                        <Icons.RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="line-clamp-3 text-xs leading-relaxed text-zinc-500">
                    {version.content.substring(0, 140)}
                  </div>
                </Card>
              ))
            )}
          </div>
        </motion.aside>
      </div>

      {renderDiffModal()}
      {renderBranchPanel()}
      {renderCanonCheckPanel()}
      {renderReviewPanel()}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
      />
    </motion.div>
  );
}
