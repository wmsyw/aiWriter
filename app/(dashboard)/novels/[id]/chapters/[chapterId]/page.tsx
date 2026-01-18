'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import * as Diff from 'diff';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogTrigger, Skeleton, Progress, Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/app/components/ui';
import { fadeIn, slideUp, scaleIn, staggerContainer } from '@/app/lib/animations';

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
  status?: 'pending' | 'succeeded' | 'failed';
}

interface Job {
  id: string;
  type: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
}

const REVIEW_DIMENSION_LABELS: Record<string, string> = {
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

interface NormalizedDimension {
  key: string;
  label: string;
  score: number;
  comment?: string;
}

interface NormalizedReview {
  avgScore: number;
  grade: string;
  summary: string;
  dimensions: NormalizedDimension[];
  suggestions: Array<{
    aspect: string;
    priority: string;
    issue: string;
    suggestion: string;
    current?: string;
  }>;
  critique: {
    weakest_aspect?: string;
    strongest_aspect?: string;
    priority_fix?: string;
    [key: string]: string | undefined;
  };
  revisionDirection?: string;
  toneAdjustment?: string;
  pacingSuggestion?: string;
}

function normalizeReviewData(data: any, labelMap: Record<string, string>): NormalizedReview {
  if (!data) {
    return {
      avgScore: 0,
      grade: '未评估',
      summary: '',
      dimensions: [],
      suggestions: [],
      critique: {},
    };
  }

  const rawDims = data.dimensions || data.dimension_scores || {};
  const dimensions: NormalizedDimension[] = Object.entries(rawDims)
    .map(([key, val]: [string, any]) => ({
      key,
      label: labelMap[key] || key.replace(/_/g, ' '),
      score: typeof val === 'object' ? (val?.score || 0) : (typeof val === 'number' ? val : 0),
      comment: typeof val === 'object' ? val?.comment : undefined,
    }))
    .filter(d => typeof d.score === 'number');

  const scores = dimensions.map(d => d.score);
  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : (data.overall_score || data.score || data.totalScore || 0);

  const grade = avgScore >= 9 ? '卓越' : avgScore >= 8 ? '优秀' : avgScore >= 7 ? '良好' : avgScore >= 6 ? '及格' : '需改进';

  const rawSuggestions = data.suggestions || data.revision_suggestions || data.improvements || [];
  const suggestions = rawSuggestions.map((s: any) => ({
    aspect: s.aspect || s.type || '修改建议',
    priority: s.priority || 'normal',
    issue: s.issue || s.problem || s.description || '',
    suggestion: s.suggestion || s.fix || s.recommendation || '',
    current: s.current,
  })).filter((s: any) => s.issue || s.suggestion);

  return {
    avgScore,
    grade,
    summary: data.comment || data.summary || data.overall_comment || '',
    dimensions,
    suggestions,
    critique: data.critique || {},
    revisionDirection: data.revision_direction || data.improvement_focus,
    toneAdjustment: data.tone_adjustment,
    pacingSuggestion: data.pacing_suggestion,
  };
}

export default function ChapterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { id: novelId, chapterId } = params as { id: string; chapterId: string };

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [novel, setNovel] = useState<{ id: string; genre?: string; isFanfiction: boolean } | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [versions, setVersions] = useState<Version[]>([]);
  const [showDiff, setShowDiff] = useState<Version | null>(null);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [reviewResult, setReviewResult] = useState<any>(null);
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
  const [feedback, setFeedback] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Review panel state
  const [reviewPanelActiveTab, setReviewPanelActiveTab] = useState<'review' | 'consistency'>('review');
  const [isIterating, setIsIterating] = useState(false);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContent = useRef('');
  // const pollIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Deprecated in favor of SSE

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

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/branches`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [novelId, chapterId]);

  useEffect(() => {
    setMounted(true);
    refreshChapter();

    // SSE Connection for Real-time Updates
    const eventSource = new EventSource('/api/jobs/stream');
    
    eventSource.addEventListener('jobs', async (e: any) => {
      try {
        const data = JSON.parse(e.data);
        const updatedJobs = data.jobs || [];
        
        // Filter jobs relevant to this chapter
        const chapterJobs = Array.isArray(updatedJobs) 
          ? updatedJobs.filter((job: any) => job?.input?.chapterId === chapterId)
          : [];
        
        if (chapterJobs.length === 0) return;

        setActiveJobs(prev => {
          const next = [...prev];
          chapterJobs.forEach((job: any) => {
            const idx = next.findIndex(j => j.id === job.id);
            if (job.status === 'succeeded' || job.status === 'failed') {
              if (idx !== -1) next.splice(idx, 1);
            } else {
              if (idx === -1) next.push(job);
              else next[idx] = job;
            }
          });
          return next;
        });

        // Handle completions
        for (const job of chapterJobs) {
          if (job.status === 'succeeded') {
            if (job.type === 'CHAPTER_GENERATE_BRANCHES') {
              fetchBranches();
            } else if (job.type === 'CHAPTER_GENERATE' || job.type === 'DEAI_REWRITE') {
              await refreshChapter();
            } else if (job.type === 'REVIEW_SCORE') {
              await refreshChapter();
              setReviewResult(job.output);
              setShowReviewPanel(true);
            } else if (job.type === 'CONSISTENCY_CHECK') {
              setConsistencyResult(job.output);
            } else if (job.type === 'CANON_CHECK') {
              setCanonCheckResult(job.output);
              setCanonCheckError(null);
              setShowCanonCheckPanel(true);
            } else if (job.type === 'MEMORY_EXTRACT') {
              // 静默完成，不弹通知
              console.log('Memory extraction completed silently');
            }
          } else if (job.status === 'failed') {
            if (job.type === 'CANON_CHECK') {
              setCanonCheckError(job.error || job.errorMessage || '检测失败，请稍后重试');
              setCanonCheckResult(null);
              setShowCanonCheckPanel(true);
            }
            // Optional: show toast error
            console.error(`Job ${job.type} failed`);
          }
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [refreshChapter, chapterId, fetchBranches]);

  const handleMemoryExtract = async () => {
    if (saveStatus !== 'saved') {
      alert('请先保存章节内容');
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

  const createJob = async (type: string, additionalInput: any = {}) => {
    try {
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
        const { job } = await res.json();
        if (job?.id) {
          setActiveJobs(prev => [...prev, job]);
          // pollJob(job.id); // Replaced by SSE
        }
        
        if (type === 'CHAPTER_GENERATE_BRANCHES') {
          setShowBranchPanel(true);
        }
      }
    } catch (err) {
      console.error('Failed to create job', err);
    }
  };



  const handleRestore = async (versionId: string) => {
    if (!confirm('确定要恢复此版本吗？当前更改将被覆盖。')) return;
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/versions/${versionId}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setContent(data.chapter.content);
        setSaveStatus('saved');
        setShowDiff(null);
        lastSavedContent.current = data.chapter.content;
      }
    } catch (err) {
      console.error('Restore failed', err);
    }
  };

  const handleApplyBranch = async (branch: Branch) => {
    if (!confirm('确定要应用此分支吗？当前内容将被覆盖。')) return;
    
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: branch.id })
      });

      if (res.ok) {
        setContent(branch.content);
        setShowBranchPanel(false);
        setIterationRound(1);
        setFeedback('');
        setSelectedBranch(null);
        setSaveStatus('unsaved');
        await updateChapterMeta({
          generationStage: 'generated',
          reviewIterations: (chapter?.reviewIterations || 0) + 1,
        });
      }
    } catch (err) {
      console.error('Failed to apply branch', err);
    }
  };

  const handleIterate = () => {
    if (!selectedBranch) return;
    createJob('CHAPTER_GENERATE_BRANCHES', {
      selectedContent: selectedBranch.content,
      feedback,
      iterationRound: iterationRound + 1
    });
    setIterationRound(prev => prev + 1);
    setFeedback('');
    setSelectedBranch(null);
  };

  const hasContent = !!content && content.trim().length > 0;
  const canGenerate = true;
  const canGenerateBranches = hasContent;
  const canReview = hasContent;
  const canDeai = hasContent;
  const canComplete = hasContent;
  const canCanonCheck = hasContent && novel?.isFanfiction;

  const renderBranchPanel = () => {
    if (!mounted) return null;
    const isLoading = activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES');

    return createPortal(
      <AnimatePresence>
        {showBranchPanel && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-6xl h-[85vh]"
            >
              <Card className="w-full h-full flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Icons.GitBranch className="w-5 h-5 text-emerald-400" />
                      分支迭代生成
                      <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        第 {iterationRound} 轮
                      </span>
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      选择一个满意的分支应用到正文，或者基于它进行下一轮迭代
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowBranchPanel(false)}
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                  >
                    <Icons.X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  <div className={`${selectedBranch ? 'w-1/3' : 'w-full'} p-6 overflow-y-auto custom-scrollbar transition-all duration-300 grid grid-cols-1 ${!selectedBranch ? 'md:grid-cols-3' : ''} gap-4`}>
                    {isLoading ? (
                      <div className="col-span-full flex flex-col items-center justify-center h-full text-gray-400">
                        <Icons.Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                        <p className="animate-pulse">AI 正在疯狂构思中...</p>
                      </div>
                    ) : branches.length === 0 ? (
                      <div className="col-span-full text-center py-20 text-gray-500">
                        暂无生成的分支，请点击"生成分支"开始
                      </div>
                    ) : (
                      branches.map((branch, idx) => (
                        <Card 
                          key={branch.id}
                          onClick={() => setSelectedBranch(branch)}
                          className={`
                            group relative p-5 rounded-xl border transition-all cursor-pointer hover:-translate-y-1 hover:shadow-xl
                            ${selectedBranch?.id === branch.id 
                              ? 'bg-emerald-500/10 border-emerald-500/50 shadow-emerald-500/20' 
                              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}
                          `}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">选项 {idx + 1}</span>
                            <span className="text-xs text-gray-600">{new Date(branch.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-sm text-gray-300 line-clamp-6 leading-relaxed font-serif opacity-80 group-hover:opacity-100">
                            {branch.content}
                          </div>
                        </Card>
                      ))
                    )}
                  </div>

                  {selectedBranch && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-2/3 border-l border-white/10 flex flex-col bg-[#0f1117]/50"
                    >
                      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                        <div className="prose prose-invert max-w-none font-serif text-lg text-gray-200">
                           {selectedBranch.content.split('\n').map((paragraph, i) => (
                             paragraph.trim() && (
                               <p key={i} className="indent-[2em] mb-2 text-justify leading-loose">
                                 {paragraph}
                               </p>
                             )
                           ))}
                        </div>
                      </div>
                      
                      <div className="p-6 border-t border-white/10 bg-white/5 backdrop-blur-xl space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-400 mb-2 block">迭代反馈 (告诉 AI 如何改进此版本)</label>
                          <textarea 
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="例如：稍微增加一些环境描写，或者让主角的语气更强硬一点..."
                            className="w-full p-3 h-24 text-sm resize-none rounded-lg bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-white placeholder-gray-500 outline-none"
                          />
                        </div>
                        
                        <div className="flex gap-4">
                          <Button 
                            variant="primary" 
                            className="flex-1 py-3"
                            onClick={() => handleApplyBranch(selectedBranch)}
                          >
                            <Icons.CheckCircle className="w-4 h-4" /> 采用此版本
                          </Button>
                          <Button 
                            variant="secondary" 
                            className="flex-1 py-3"
                            onClick={handleIterate}
                            isLoading={isLoading}
                          >
                            <Icons.RotateCcw className="w-4 h-4" /> 基于反馈迭代
                          </Button>
                        </div>
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

  const handleAcceptReview = async () => {
    await updateChapterMeta({ generationStage: 'approved' });
    setShowReviewPanel(false);
  };

  const handleRequestRevision = () => {
    if (!reviewFeedback.trim()) return;
    createJob('CHAPTER_GENERATE_BRANCHES', {
      selectedContent: content,
      feedback: reviewFeedback,
      iterationRound: (chapter?.reviewIterations || 0) + 1,
    });
    setIterationRound((chapter?.reviewIterations || 0) + 1);
    setReviewFeedback('');
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
    const hasReview = !!reviewResult;
    const hasConsistency = !!consistencyResult;

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

    const normalized = normalizeReviewData(reviewResult, REVIEW_DIMENSION_LABELS);

    const handleOneClickIterate = async () => {
      const aiSuggestions = normalized.suggestions
        .map(s => s.suggestion)
        .filter(Boolean)
        .join('\n');
      const combinedFeedback = [
        aiSuggestions && `【AI修改建议】\n${aiSuggestions}`,
        reviewFeedback.trim() && `【用户补充意见】\n${reviewFeedback.trim()}`
      ].filter(Boolean).join('\n\n');
      
      if (!combinedFeedback) return;
      
      setIsIterating(true);
      try {
        await createJob('CHAPTER_GENERATE_BRANCHES', {
          selectedContent: content,
          feedback: combinedFeedback,
          iterationRound: (chapter?.reviewIterations || 0) + 1,
        });
        setIterationRound((chapter?.reviewIterations || 0) + 1);
        setReviewFeedback('');
        setShowReviewPanel(false);
      } finally {
        setIsIterating(false);
      }
    };

    return createPortal(
      <AnimatePresence>
        {showReviewPanel && (hasReview || hasConsistency) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-6xl h-[85vh]"
            >
              <Card className="w-full h-full flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                      章节评审报告
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      AI 对情节、节奏、人物等多维度的专业质量评审
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowReviewPanel(false)}
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                  >
                    <Icons.X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex border-b border-white/10 px-6">
                  {hasReview && (
                    <button 
                      onClick={() => setReviewPanelActiveTab('review')}
                      className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${reviewPanelActiveTab === 'review' ? 'border-emerald-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                      质量评审
                    </button>
                  )}
                  {hasConsistency && (
                    <button 
                      onClick={() => setReviewPanelActiveTab('consistency')}
                      className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${reviewPanelActiveTab === 'consistency' ? 'border-emerald-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                      一致性检查
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  {reviewPanelActiveTab === 'review' && reviewResult && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="md:col-span-1 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-purple-500/10 border-emerald-500/20 flex flex-col items-center justify-center text-center">
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
                            <Card key={dim.key} className="p-4 rounded-xl flex flex-col justify-center">
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
                          <Card className="p-6 rounded-2xl border border-white/5">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                              <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                              评审详情与修改建议
                            </h3>
                            
                            {normalized.summary && (
                              <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/5 text-gray-300 leading-relaxed text-sm">
                                {normalized.summary}
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
                                {normalized.suggestions.map((suggestion, idx) => (
                                  <details key={idx} className="group glass-card border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden open:bg-white/[0.04] transition-colors">
                                    <summary className="flex items-start gap-3 p-4 cursor-pointer select-none">
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
                                          }`}>{suggestion.priority}</span>
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
                                  <div key={key} className="bg-white/5 p-4 rounded-xl border border-white/5">
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
                          <Card className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">AI 修改方向</h3>
                            <div className="space-y-4">
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
                                    {normalized.suggestions.slice(0, 3).map(s => s.suggestion).filter(Boolean).join('；')}
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

                  {reviewPanelActiveTab === 'consistency' && consistencyResult && (
                     <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                       <Card className="p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/10 to-purple-900/10">
                         <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                           <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                           一致性检查报告
                         </h3>
                         <div className="space-y-4">
                           {consistencyResult.issues && consistencyResult.issues.length > 0 ? (
                             consistencyResult.issues.map((issue: any, i: number) => (
                               <div key={i} className="bg-white/5 p-4 rounded-xl border border-red-500/20">
                                  <div className="flex items-start gap-3">
                                    <div className="mt-1 w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                    <div>
                                      <h4 className="font-bold text-red-200 mb-1">{issue.type || '潜在冲突'}</h4>
                                      <p className="text-gray-300 text-sm">{issue.description}</p>
                                      {issue.reference && (
                                        <div className="mt-2 text-xs text-gray-500 bg-black/20 p-2 rounded">
                                          参考: {issue.reference}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                               </div>
                             ))
                           ) : (
                             <div className="text-center py-10 text-gray-400">
                               <Icons.CheckCircle className="w-12 h-12 text-green-500/50 mx-auto mb-3" />
                               <p>未发现明显的一致性问题，您的设定保持得很好！</p>
                             </div>
                           )}
                         </div>
                       </Card>
                     </motion.div>
                  )}
                </div>
                
                <div className="p-4 border-t border-white/10 bg-white/5 space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-400 mb-2 block">补充修改意见（可选）</label>
                      <textarea
                        value={reviewFeedback}
                        onChange={(e) => setReviewFeedback(e.target.value)}
                        placeholder="补充您的修改意见，将与 AI 建议一起作为迭代方向..."
                        className="w-full p-3 h-20 text-sm resize-none rounded-lg bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-white placeholder-gray-500 outline-none"
                        disabled={isIterating}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                      {normalized.suggestions.length > 0 && `将采用 ${normalized.suggestions.length} 条 AI 修改建议`}
                      {reviewFeedback.trim() && normalized.suggestions.length > 0 && ' + '}
                      {reviewFeedback.trim() && '您的补充意见'}
                    </div>
                    <div className="flex gap-3">
                      <Button variant="secondary" onClick={() => setShowReviewPanel(false)} disabled={isIterating}>关闭</Button>
                      <Button 
                        variant="primary" 
                        onClick={handleOneClickIterate}
                        disabled={(!normalized.suggestions.length && !reviewFeedback.trim()) || isIterating}
                        isLoading={isIterating}
                      >
                        <Icons.RotateCcw className="w-4 h-4" /> 一键迭代优化
                      </Button>
                      <Button variant="ghost" onClick={handleAcceptReview} disabled={isIterating}>
                        <Icons.CheckCircle className="w-4 h-4" /> 接受评审
                      </Button>
                    </div>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg"
              >
                <Card className="w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                    <Icons.X className="w-8 h-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">检测失败</h2>
                  <p className="text-gray-400 mb-8">{canonCheckError}</p>
                  <div className="flex gap-4 justify-center">
                    <Button variant="ghost" onClick={() => setShowCanonCheckPanel(false)}>关闭</Button>
                    <Button 
                      variant="primary" 
                      onClick={() => {
                        setCanonCheckError(null);
                        createJob('CANON_CHECK');
                      }}
                    >
                      <Icons.RotateCcw className="w-4 h-4" /> 重试
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </div>
          ) : (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-6xl h-[85vh]"
              >
                <Card className="w-full h-full flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                  <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Icons.BookOpen className="w-5 h-5 text-amber-400" />
                        原作符合度检查
                      </h2>
                      <p className="text-sm text-gray-400 mt-1">
                        基于设定集(Lorebook)的深度一致性分析报告
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowCanonCheckPanel(false)}
                      className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                      <Icons.X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                      <Card className="md:col-span-1 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-purple-500/10 border-emerald-500/20 flex flex-col items-center justify-center text-center">
                        <div className="text-sm text-gray-400 mb-2 uppercase tracking-wider font-bold">综合得分</div>
                        <div className={`text-5xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                          {avgScore}<span className="text-xl text-gray-500">/10</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10">
                          {overallGrade}
                        </div>
                      </Card>

                      <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {Object.entries(dimensionScores).map(([key, value]: [string, any]) => {
                           const score = value?.score || 0;
                           const comment = value?.comment;
                            const label = CANON_DIMENSION_LABELS[key] || key.replace(/_/g, ' ');
                           return (
                             <Card key={key} className="p-4 rounded-xl flex flex-col justify-center">
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
                        <Card className="p-6 rounded-2xl border border-white/5">
                          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                            检测详情与建议
                          </h3>
                          

                          {(summaryText || summaryObj) && (
                            <div className="mb-6 space-y-3">
                              {summaryText && (
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-gray-300 leading-relaxed text-sm">
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
                                <details key={idx} className="group glass-card border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden open:bg-white/[0.04] transition-colors">
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
                                        }`}>{issue.severity || 'normal'}</span>
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
                        <Card className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                           <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">AI 分析</h3>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl h-[80vh]"
            >
              <Card className="w-full h-full flex flex-col overflow-hidden rounded-2xl border border-white/10">
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                  <div>
                    <h3 className="text-xl font-bold text-white">版本对比</h3>
                    <p className="text-sm text-gray-400">对比 {new Date(showDiff.createdAt).toLocaleString()} 的版本与当前版本</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setShowDiff(null)}>关闭</Button>
                    <Button variant="primary" onClick={() => handleRestore(showDiff.id)}>
                      <Icons.RotateCcw className="w-4 h-4" /> 恢复此版本
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed">
                  {Diff.diffLines(showDiff.content || '', content || '').map((part, index) => (
                    <div 
                      key={index}
                      className={`
                        ${part.added ? 'bg-green-500/20 text-green-200 border-l-2 border-green-500' : ''}
                        ${part.removed ? 'bg-red-500/20 text-red-200 border-l-2 border-red-500 decoration-line-through opacity-70' : ''}
                        ${!part.added && !part.removed ? 'text-gray-300' : ''}
                        px-4 py-1 whitespace-pre-wrap
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
      className={`flex flex-col h-[calc(100vh-56px)] overflow-hidden bg-[var(--color-dark-bg)] transition-all duration-500 ${focusMode ? 'fixed inset-0 z-50 h-screen' : ''}`}
    >
      <header className={`h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0f1117]/80 backdrop-blur-md z-10 shrink-0 transition-all duration-300 ${focusMode ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors hover:bg-white/5 p-1.5 rounded-lg">
            <Icons.ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>小说列表</span>
              <span>/</span>
              <span className="truncate max-w-[150px]">{title}</span>
            </div>
            <div className="flex items-center gap-2">
               <h1 className="text-sm font-bold text-white truncate max-w-[300px]">{title}</h1>
               <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'saved' ? 'bg-green-500' : saveStatus === 'saving' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 mr-4 bg-white/5 p-1 rounded-xl border border-white/5 shadow-inner">
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('CHAPTER_GENERATE')}
              isLoading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE')}
              disabled={!canGenerate}
            >
              <Icons.Sparkles className="w-3.5 h-3.5 text-emerald-400" /> 
              <span className="ml-1.5">生成</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('CHAPTER_GENERATE_BRANCHES', { branchCount: 3 })}
              isLoading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES')}
              disabled={!canGenerateBranches}
            >
              <Icons.GitBranch className="w-3.5 h-3.5 text-blue-400" /> 
              <span className="ml-1.5">生成分支</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => {
                createJob('REVIEW_SCORE');
                createJob('CONSISTENCY_CHECK');
              }}
              isLoading={activeJobs.some(j => j.type === 'REVIEW_SCORE' || j.type === 'CONSISTENCY_CHECK')}
              disabled={!canReview}
            >
              <Icons.CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> 
              <span className="ml-1.5">审阅</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('DEAI_REWRITE')}
              isLoading={activeJobs.some(j => j.type === 'DEAI_REWRITE')}
              disabled={!canDeai}
            >
              <Icons.Wand2 className="w-3.5 h-3.5 text-purple-400" /> 
              <span className="ml-1.5">润色</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={handleMemoryExtract}
              isLoading={activeJobs.some(j => j.type === 'MEMORY_EXTRACT')}
              disabled={saveStatus !== 'saved'}
              title="提取记忆到设定集"
            >
              <Icons.Brain className="w-3.5 h-3.5 text-pink-400" /> 
              <span className="ml-1.5">提取记忆</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => {
                setCanonCheckError(null);
                createJob('CANON_CHECK');
              }}
              isLoading={activeJobs.some(j => j.type === 'CANON_CHECK')}
              disabled={!canCanonCheck || saveStatus !== 'saved'}
              title="检查章节内容是否符合原作设定（同人文专用）"
            >
              <Icons.BookOpen className="w-3.5 h-3.5 text-amber-400" /> 
              <span className="ml-1.5">原作符合度</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button
              variant="ghost"
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={handleCompleteChapter}
              disabled={!canComplete}
            >
              <Icons.CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="ml-1.5">完成</span>
            </Button>
          </div>
          
          <button 
            onClick={() => setFocusMode(!focusMode)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title={focusMode ? "退出专注模式" : "专注模式"}
          >
            {focusMode ? <Icons.Minimize className="w-5 h-5" /> : <Icons.Maximize className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          >
            <Icons.PanelRight className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <motion.main 
          layout
          className="flex-1 relative flex flex-col h-full bg-[#0f1117] transition-all duration-300"
        >
          {focusMode && (
            <div className="absolute top-4 right-4 z-50">
               <button 
                onClick={() => setFocusMode(false)}
                className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white backdrop-blur-md border border-white/10 hover:bg-black/70 transition-all"
                title="退出专注模式"
               >
                 <Icons.Minimize className="w-5 h-5" />
               </button>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
            <div className={`mx-auto py-16 px-12 min-h-full transition-all duration-500 ${focusMode ? 'max-w-4xl' : 'max-w-3xl'}`}>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaveStatus('unsaved');
                  if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                  saveTimeoutRef.current = setTimeout(() => saveContent(content, e.target.value), 2000);
                }}
                className="w-full bg-transparent text-4xl font-serif font-bold text-white mb-8 border-none focus:outline-none focus:ring-0 placeholder-gray-700 tracking-tight"
                placeholder="章节标题"
              />
              <textarea
                value={content}
                onChange={handleContentChange}
                onBlur={handleBlur}
                className="w-full min-h-[calc(100vh-300px)] bg-transparent text-xl text-gray-300 leading-loose resize-none border-none focus:outline-none focus:ring-0 placeholder-gray-800 selection:bg-emerald-500/30 font-serif tracking-wide"
                placeholder="开始创作你的杰作..."
                spellCheck={false}
              />
            </div>
          </div>
          
          <div className={`absolute bottom-0 left-0 right-0 h-10 bg-[#0f1117]/90 backdrop-blur border-t border-white/5 flex items-center justify-between px-6 text-xs text-gray-500 select-none transition-all duration-300 ${focusMode ? 'translate-y-full' : 'translate-y-0'}`}>
            <div className="flex gap-6 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
                {wordCount} 字
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
                {charCount} 字符
              </span>
            </div>
            <div>
              {saveStatus === 'saved' ? (
                  <span className="text-green-500/70 flex items-center gap-1.5">
                      <Icons.CheckCircle className="w-3 h-3" /> 所有更改已保存
                  </span>
              ) : saveStatus === 'saving' ? (
                  <span className="text-yellow-500/70 flex items-center gap-1.5">
                      <Icons.Loader2 className="w-3 h-3 animate-spin" /> 保存中...
                  </span>
              ) : (
                  <span className="text-red-500/70 flex items-center gap-1.5">
                      <Icons.X className="w-3 h-3" /> 未保存
                  </span>
              )}
            </div>
          </div>
        </motion.main>

        <motion.aside 
          initial={false}
          animate={{ 
            width: isSidebarOpen && !focusMode ? 320 : 0,
            opacity: isSidebarOpen && !focusMode ? 1 : 0
          }}
          transition={{ ease: "easeInOut", duration: 0.3 }}
          className="border-l border-white/5 bg-[#13141f] shadow-2xl flex flex-col z-20 overflow-hidden"
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] min-w-[320px]">
            <h2 className="font-semibold text-white flex items-center gap-2 text-sm tracking-wide">
              <Icons.History className="w-4 h-4 text-emerald-400" /> 版本历史
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-w-[320px]">
            {versions.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600">
                    <Icons.History className="w-6 h-6" />
                </div>
                <div className="text-gray-500 text-sm">暂无历史版本</div>
                <div className="text-gray-600 text-xs mt-1">系统会自动保存您的写作进度</div>
              </div>
            ) : (
              versions.map((version) => (
                <Card key={version.id} className="group p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all cursor-pointer relative overflow-hidden">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-gray-400 group-hover:text-emerald-300 transition-colors">{new Date(version.createdAt).toLocaleString()}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 bg-[#1e1f2b] rounded-lg p-0.5 shadow-lg border border-white/10">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowDiff(version); }}
                        className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors"
                        title="查看变更"
                      >
                        <Icons.Eye className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px bg-white/10 my-0.5"></div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRestore(version.id); }}
                        className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors"
                        title="恢复"
                      >
                        <Icons.RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-2 font-serif leading-relaxed">
                    {version.content.substring(0, 100)}...
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
    </motion.div>
  );
}
