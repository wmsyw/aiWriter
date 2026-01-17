'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

export default function ChapterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { id: novelId, chapterId } = params as { id: string; chapterId: string };

  const [chapter, setChapter] = useState<Chapter | null>(null);
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
  
  // Review panel state (moved from renderReviewPanel to fix React Hooks rule violation)
  const [reviewPanelActiveTab, setReviewPanelActiveTab] = useState<'review' | 'consistency'>('review');
  const [activeReviewIdx, setActiveReviewIdx] = useState(0);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContent = useRef('');
  // const pollIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Deprecated in favor of SSE

  const refreshChapter = useCallback(async () => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`);
      if (!res.ok) throw new Error('Failed to load chapter');
      const data = await res.json();
      setChapter(data.chapter);
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
              // Show notification or visual cue?
              alert('记忆提取完成！'); 
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

  const stage = chapter?.generationStage || 'draft';
  const canGenerate = stage === 'draft' || stage === 'generated';
  const canGenerateBranches = stage === 'generated' || stage === 'reviewed';
  const canReview = stage === 'generated';
  const canDeai = stage === 'approved';
  const canComplete = stage === 'humanized';

  const renderBranchPanel = () => {
    const isLoading = activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES');

    return (
      <AnimatePresence>
        {showBranchPanel && (
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
                        <div className="prose prose-invert max-w-none font-serif leading-loose text-lg text-gray-200">
                          {selectedBranch.content}
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
      </AnimatePresence>
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
    const hasReview = !!reviewResult;
    const hasConsistency = !!consistencyResult;

    const isMulti = reviewResult?.isMultiReview;

    return (
      <AnimatePresence>
        {showReviewPanel && (hasReview || hasConsistency) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-5xl h-[85vh]"
            >
              <Card className="w-full h-full flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                      章节评审与检查
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      AI 评审员针对情节、节奏、一致性等维度的专业反馈
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
                    isMulti ? (
                    <div className="space-y-8">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-purple-500/10 border-emerald-500/20">
                          <div className="text-sm text-gray-400 mb-1">平均评分</div>
                          <div className="text-3xl font-bold text-white">{reviewResult.aggregated.averageScore}</div>
                        </Card>
                        <Card className="p-4 rounded-xl">
                          <div className="text-sm text-gray-400 mb-1">最高分</div>
                          <div className="text-2xl font-bold text-emerald-400">{reviewResult.aggregated.maxScore}</div>
                        </Card>
                         <Card className="p-4 rounded-xl">
                          <div className="text-sm text-gray-400 mb-1">最低分</div>
                          <div className="text-2xl font-bold text-orange-400">{reviewResult.aggregated.minScore}</div>
                        </Card>
                        <Card className="p-4 rounded-xl">
                          <div className="text-sm text-gray-400 mb-1">评审员数量</div>
                          <div className="text-2xl font-bold text-blue-400">{reviewResult.aggregated.reviewCount}</div>
                        </Card>
                      </div>

                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
                           <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">评审员观点</h3>
                           {reviewResult.reviews.map((review: any, idx: number) => (
                             <button
                               key={idx}
                               onClick={() => setActiveReviewIdx(idx)}
                               className={`w-full text-left p-3 rounded-xl transition-all border ${
                                 activeReviewIdx === idx
                                   ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-lg shadow-emerald-500/10'
                                   : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                               }`}
                             >
                               <div className="flex justify-between items-center mb-1">
                                 <span className="font-bold text-sm">{review.persona || 'AI Reviewer'}</span>
                                 <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                   review.score >= 8 ? 'bg-green-500/20 text-green-400' :
                                   review.score >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                   'bg-red-500/20 text-red-400'
                                 }`}>{review.score}</span>
                               </div>
                               <div className="text-xs opacity-70 truncate">{review.model}</div>
                             </button>
                           ))}
                        </div>

                        <Card className="flex-1 bg-black/20 rounded-2xl p-6 border border-white/5">
                          {reviewResult.reviews[activeReviewIdx] && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="space-y-6"
                            >
                              <div className="flex items-start gap-4">
                                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                   {reviewResult.reviews[activeReviewIdx].persona?.[0] || 'A'}
                                 </div>
                                 <div>
                                   <h3 className="text-lg font-bold text-white">
                                     {reviewResult.reviews[activeReviewIdx].persona || '评审员'}
                                   </h3>
                                   <p className="text-sm text-gray-400">
                                     模型: {reviewResult.reviews[activeReviewIdx].model}
                                   </p>
                                 </div>
                              </div>

                              <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                <p className="text-lg font-serif italic border-l-4 border-emerald-500/50 pl-4 py-2 bg-emerald-500/5 rounded-r-lg">
                                  "{reviewResult.reviews[activeReviewIdx].comment}"
                                </p>
                                
                                {reviewResult.reviews[activeReviewIdx].critique && (
                                   <div className="mt-6 grid gap-4">
                                     {Object.entries(reviewResult.reviews[activeReviewIdx].critique).map(([key, value]) => (
                                       <div key={key} className="bg-white/5 p-4 rounded-xl">
                                         <h4 className="font-bold text-emerald-300 mb-2 capitalize">{key}</h4>
                                         <p className="text-sm">{String(value)}</p>
                                       </div>
                                     ))}
                                   </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </Card>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       <Card className="p-6 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-purple-900/20 border-emerald-500/30">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-purple-400">
                              {reviewResult.score || reviewResult.totalScore || 0}
                              <span className="text-lg text-gray-500 font-normal ml-2">/ 10</span>
                            </div>
                          </div>
                          <p className="text-lg text-gray-200 font-serif leading-relaxed">
                            {reviewResult.comment || reviewResult.summary}
                          </p>
                       </Card>
                       
                       {reviewResult.critique && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {Object.entries(reviewResult.critique).map(([key, value]) => (
                             <Card key={key} className="p-5 rounded-xl">
                               <h4 className="font-bold text-emerald-300 mb-2 capitalize border-b border-white/5 pb-2">
                                 {key.replace(/([A-Z])/g, ' $1').trim()}
                               </h4>
                               <p className="text-gray-300 text-sm leading-relaxed">
                                 {String(value)}
                               </p>
                             </Card>
                           ))}
                         </div>
                       )}
                    </div>
                  ))}

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
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-2 block">用户反馈（可用于下一轮改写）</label>
                    <textarea
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      placeholder="告诉 AI 需要怎么改，比如节奏更快或补充情感描写..."
                      className="w-full p-3 h-24 text-sm resize-none rounded-lg bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-white placeholder-gray-500 outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setShowReviewPanel(false)}>关闭</Button>
                    <Button variant="secondary" onClick={handleRequestRevision} disabled={!reviewFeedback.trim()}>
                      <Icons.RotateCcw className="w-4 h-4" /> 按反馈迭代
                    </Button>
                    <Button variant="primary" onClick={handleAcceptReview}>
                      <Icons.CheckCircle className="w-4 h-4" /> 接受评审
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderCanonCheckPanel = () => {
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

    return (
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
                           return (
                             <Card key={key} className="p-4 rounded-xl flex flex-col justify-center">
                               <div className="flex justify-between items-end mb-2">
                                 <span className="text-gray-400 text-sm capitalize">{key.replace(/_/g, ' ')}</span>
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
                                      issue.severity === 'creative_liberty' ? 'bg-blue-400' : 'bg-yellow-500'
                                    }`} />
                                    <div className="flex-1">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-gray-200 font-medium text-sm">{issue.title || issue.description}</span>
                                          {issue.severity && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                              issue.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                              issue.severity === 'major' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                            }`}>
                                              {issue.severity === 'critical' ? '严重冲突' : issue.severity === 'major' ? '主要问题' : issue.severity === 'creative_liberty' ? '二创自由' : '一般瑕疵'}
                                            </span>
                                          )}
                                        </div>
                                        {issue.location && <div className="text-xs text-gray-500">位置: {issue.location}</div>}
                                      </div>
                                    </div>
                                    <div className="text-gray-500 group-open:rotate-180 transition-transform">
                                      <Icons.ChevronLeft className="w-4 h-4 -rotate-90" />
                                    </div>
                                  </summary>
                                  <div className="px-4 pb-4 pt-0 pl-9 space-y-3">
                                    {issue.contradiction && (
                                      <div className="text-sm text-gray-400 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">
                                        <span className="text-red-400/80 font-bold text-xs block mb-1">矛盾点</span>
                                        {issue.contradiction}
                                      </div>
                                    )}
                                     {issue.canon_reference && (
                                      <div className="text-xs text-gray-500 bg-white/5 p-2 rounded">
                                        <span className="font-bold">原作参考:</span> {issue.canon_reference}
                                      </div>
                                    )}
                                    {issue.suggestion && (
                                      <div className="flex gap-2 text-xs text-emerald-400/80">
                                        <Icons.Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <span>建议：{issue.suggestion}</span>
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </div>
                          ) : (
                             <div className="text-center py-12 text-gray-500">
                               <Icons.CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                               <p>未发现明显的设定冲突</p>
                             </div>
                          )}
                        </Card>

                        {canonCheckResult.improvement_suggestions && canonCheckResult.improvement_suggestions.length > 0 && (
                          <Card className="p-6 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/10 to-orange-900/10">
                            <h3 className="text-lg font-bold text-amber-200 mb-4 flex items-center gap-2">
                              <Icons.Sparkles className="w-5 h-5" />
                              改进建议
                            </h3>
                            <ul className="space-y-3">
                              {canonCheckResult.improvement_suggestions.map((s: any, i: number) => (
                                <li key={i} className="flex gap-3 text-sm text-amber-100/80 leading-relaxed">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs border border-amber-500/30">{i+1}</span>
                                  <div className="flex-1">
                                     {typeof s === 'string' ? (
                                       <span>{s}</span>
                                      ) : (
                                       <>
                                         <div className="font-bold text-amber-200/90 mb-0.5 flex items-center gap-2">
                                            {s.suggestion}
                                            {s.category && <span className="text-[10px] border border-amber-500/30 px-1 rounded opacity-70 bg-amber-500/10">{s.category}</span>}
                                            {s.priority && <span className="text-[10px] border border-amber-500/30 px-1 rounded opacity-70">{s.priority}</span>}
                                         </div>
                                         {s.example && <div className="text-xs opacity-70 italic mt-1">"{s.example}"</div>}
                                       </>
                                     )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </Card>
                        )}
                      </div>

                      <div className="lg:col-span-1 space-y-6">
                         <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">角色深度扫描</h3>
                         {canonCheckResult.character_analysis?.map((char: any, i: number) => (
                           <Card key={i} className="p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                             <div className="flex justify-between items-center mb-3">
                                <div className="font-bold text-white">{char.character_name || char.name}</div>
                                {(char.canon_alignment || char.score) && (
                                  <div className={`text-xs font-mono font-bold px-2 py-1 rounded bg-black/20 ${getScoreColor(char.canon_alignment || char.score)}`}>
                                    {char.canon_alignment || char.score}/10
                                  </div>
                                )}
                             </div>
                             
                             <div className="space-y-2 mb-3">

                                <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-400">
                                   <div className="bg-white/5 p-1 rounded text-center">
                                     <div className="opacity-50 mb-0.5">性格</div>
                                     <div className={typeof char.personality_match === 'number' ? getScoreColor(char.personality_match) : 'text-gray-300 leading-tight'}>
                                       {char.personality_match || '-'}
                                     </div>
                                   </div>
                                   <div className="bg-white/5 p-1 rounded text-center">
                                     <div className="opacity-50 mb-0.5">语气</div>
                                     <div className={typeof char.speech_pattern_match === 'number' ? getScoreColor(char.speech_pattern_match) : 'text-gray-300 leading-tight'}>
                                       {char.speech_pattern_match || '-'}
                                     </div>
                                   </div>
                                   <div className="bg-white/5 p-1 rounded text-center">
                                     <div className="opacity-50 mb-0.5">行为</div>
                                     <div className={typeof char.behavior_match === 'number' ? getScoreColor(char.behavior_match) : 'text-gray-300 leading-tight'}>
                                       {char.behavior_match || '-'}
                                     </div>
                                   </div>
                                </div>
                             </div>

                             {char.well_done && char.well_done.length > 0 && (
                                <div className="mb-2 space-y-1">
                                  <div className="text-[10px] text-emerald-400 font-bold uppercase">亮点</div>
                                  {char.well_done.slice(0, 2).map((m: string, idx: number) => (
                                    <div key={idx} className="text-xs text-emerald-300/70 bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10 truncate">
                                      {m}
                                    </div>
                                  ))}
                                </div>
                             )}

                             {char.ooc_moments?.length > 0 && (
                               <div className="space-y-1">
                                 <div className="text-[10px] text-red-400 font-bold uppercase">OOC 风险</div>
                                 {char.ooc_moments.slice(0, 2).map((m: string, idx: number) => (
                                   <div key={idx} className="text-xs text-red-300/70 bg-red-500/5 p-1.5 rounded border border-red-500/10 truncate">
                                     {m}
                                   </div>
                                 ))}
                               </div>
                             )}
                           </Card>
                         ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowCanonCheckPanel(false)}>关闭</Button>
                    <Button variant="primary" onClick={() => {
                      setShowCanonCheckPanel(false);
                    }}>
                      <Icons.CheckCircle className="w-4 h-4" /> 确认
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </div>
          )
        )}
      </AnimatePresence>
    );
  };

  const renderDiffModal = () => {
    
    return (
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
      </AnimatePresence>
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
              disabled={!content || saveStatus !== 'saved'}
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
