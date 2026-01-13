'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import * as Diff from 'diff';

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
  Maximize: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
  ),
  Minimize: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
  )
};

interface Chapter {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
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
  status?: 'pending' | 'completed' | 'failed';
}

interface Job {
  id: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

function Button({ 
  children, 
  variant = 'primary', 
  className = '', 
  loading = false,
  disabled = false,
  onClick,
  ...props 
}: any) {
  const baseClass = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm active:scale-95";
  const variants = {
    primary: "btn-primary shadow-indigo-500/20",
    secondary: "btn-secondary",
    ghost: "text-gray-400 hover:text-white hover:bg-white/5",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20"
  };

  return (
    <button 
      className={`${baseClass} ${variants[variant as keyof typeof variants]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <Icons.Loader2 className="animate-spin w-4 h-4" />}
      {children}
    </button>
  );
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
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  
  // Branch Iteration State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [iterationRound, setIterationRound] = useState(1);
  const [feedback, setFeedback] = useState('');
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContent = useRef('');

  useEffect(() => {
    const fetchChapter = async () => {
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
    };
    fetchChapter();
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
            novelId, 
            chapterId, 
            content,
            ...additionalInput
          },
        }),
      });
      if (res.ok) {
        const { job } = await res.json();
        setActiveJobs(prev => [...prev, job]);
        pollJob(job.id);
        
        if (type === 'CHAPTER_GENERATE_BRANCHES') {
          setShowBranchPanel(true);
        }
      }
    } catch (err) {
      console.error('Failed to create job', err);
    }
  };

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (res.ok) {
          const { job } = await res.json();
          if (job.status === 'completed') {
            clearInterval(interval);
            setActiveJobs(prev => prev.filter(j => j.id !== jobId));
            
            if (job.type === 'CHAPTER_GENERATE_BRANCHES') {
              fetchBranches();
            } else if (job.type === 'CHAPTER_GENERATE') {
              const chapterRes = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`);
              const data = await chapterRes.json();
              setChapter(data.chapter);
              setContent(data.chapter.content || '');
            } else if (job.type === 'REVIEW_SCORE') {
              setReviewResult(job.output);
              setShowReviewPanel(true);
            }
          } else if (job.status === 'failed') {
             clearInterval(interval);
             setActiveJobs(prev => prev.filter(j => j.id !== jobId));
             alert('任务执行失败');
          }
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
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

  const renderBranchPanel = () => {
    if (!showBranchPanel) return null;

    const isLoading = activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES');

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-6">
        <div className="glass-card w-full max-w-6xl h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Icons.GitBranch className="w-5 h-5 text-indigo-400" />
                分支迭代生成
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
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
                  <Icons.Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
                  <p className="animate-pulse">AI 正在疯狂构思中...</p>
                </div>
              ) : branches.length === 0 ? (
                <div className="col-span-full text-center py-20 text-gray-500">
                  暂无生成的分支，请点击"生成分支"开始
                </div>
              ) : (
                branches.map((branch, idx) => (
                  <div 
                    key={branch.id}
                    onClick={() => setSelectedBranch(branch)}
                    className={`
                      group relative p-5 rounded-xl border transition-all cursor-pointer hover:-translate-y-1 hover:shadow-xl
                      ${selectedBranch?.id === branch.id 
                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-indigo-500/20' 
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
                  </div>
                ))
              )}
            </div>

            {selectedBranch && (
              <div className="w-2/3 border-l border-white/10 flex flex-col bg-[#0f1117]/50">
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
                      className="glass-input w-full p-3 h-24 text-sm resize-none"
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
                      disabled={isLoading}
                    >
                      <Icons.RotateCcw className="w-4 h-4" /> 基于反馈迭代
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderReviewPanel = () => {
    if (!showReviewPanel || !reviewResult) return null;

    const isMulti = reviewResult.isMultiReview;
    const [activeReviewIdx, setActiveReviewIdx] = useState(0);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-6">
        <div className="glass-card w-full max-w-5xl h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />
                章节评审
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                AI 评审员针对情节、节奏、人物等维度的专业反馈
              </p>
            </div>
            <button 
              onClick={() => setShowReviewPanel(false)}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <Icons.X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {isMulti ? (
              <div className="space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-card p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
                    <div className="text-sm text-gray-400 mb-1">平均评分</div>
                    <div className="text-3xl font-bold text-white">{reviewResult.aggregated.averageScore}</div>
                  </div>
                  <div className="glass-card p-4 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">最高分</div>
                    <div className="text-2xl font-bold text-emerald-400">{reviewResult.aggregated.maxScore}</div>
                  </div>
                   <div className="glass-card p-4 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">最低分</div>
                    <div className="text-2xl font-bold text-orange-400">{reviewResult.aggregated.minScore}</div>
                  </div>
                  <div className="glass-card p-4 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">评审员数量</div>
                    <div className="text-2xl font-bold text-blue-400">{reviewResult.aggregated.reviewCount}</div>
                  </div>
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
                             ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
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

                  <div className="flex-1 glass-card bg-black/20 rounded-2xl p-6 border border-white/5">
                    {reviewResult.reviews[activeReviewIdx] && (
                      <div className="space-y-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
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
                          <p className="text-lg font-serif italic border-l-4 border-indigo-500/50 pl-4 py-2 bg-indigo-500/5 rounded-r-lg">
                            "{reviewResult.reviews[activeReviewIdx].comment}"
                          </p>
                          
                          {reviewResult.reviews[activeReviewIdx].critique && (
                             <div className="mt-6 grid gap-4">
                               {Object.entries(reviewResult.reviews[activeReviewIdx].critique).map(([key, value]) => (
                                 <div key={key} className="bg-white/5 p-4 rounded-xl">
                                   <h4 className="font-bold text-indigo-300 mb-2 capitalize">{key}</h4>
                                   <p className="text-sm">{String(value)}</p>
                                 </div>
                               ))}
                             </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                 <div className="glass-card p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/30">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                        {reviewResult.score || reviewResult.totalScore || 0}
                        <span className="text-lg text-gray-500 font-normal ml-2">/ 10</span>
                      </div>
                    </div>
                    <p className="text-lg text-gray-200 font-serif leading-relaxed">
                      {reviewResult.comment || reviewResult.summary}
                    </p>
                 </div>
                 
                 {reviewResult.critique && (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {Object.entries(reviewResult.critique).map(([key, value]) => (
                       <div key={key} className="glass-card p-5 rounded-xl">
                         <h4 className="font-bold text-indigo-300 mb-2 capitalize border-b border-white/5 pb-2">
                           {key.replace(/([A-Z])/g, ' $1').trim()}
                         </h4>
                         <p className="text-gray-300 text-sm leading-relaxed">
                           {String(value)}
                         </p>
                       </div>
                     ))}
                   </div>
                 )}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
            <Button variant="secondary" onClick={() => setShowReviewPanel(false)}>关闭</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderDiffModal = () => {
    if (!showDiff) return null;
    
    const diffs = Diff.diffLines(showDiff.content || '', content || '');

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8 animate-fade-in">
        <div className="glass-card w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden rounded-2xl border border-white/10">
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
            {diffs.map((part, index) => (
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
        </div>
      </div>
    );
  };

  if (!chapter) return <div className="flex items-center justify-center h-screen bg-[var(--color-dark-bg)]"><Icons.Loader2 className="animate-spin w-8 h-8 text-indigo-500" /></div>;

  return (
    <div className={`flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--color-dark-bg)] transition-all duration-500 ${focusMode ? 'fixed inset-0 z-50 h-screen' : ''}`}>
      <header className={`h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0f1117]/80 backdrop-blur-md z-10 shrink-0 transition-all duration-300 ${focusMode ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
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
              loading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE')}
            >
              <Icons.Sparkles className="w-3.5 h-3.5 text-indigo-400" /> 
              <span className="ml-1.5">生成</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('CHAPTER_GENERATE_BRANCHES', { branchCount: 3 })}
              loading={activeJobs.some(j => j.type === 'CHAPTER_GENERATE_BRANCHES')}
            >
              <Icons.GitBranch className="w-3.5 h-3.5 text-blue-400" /> 
              <span className="ml-1.5">生成分支</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('REVIEW_SCORE')}
              loading={activeJobs.some(j => j.type === 'REVIEW_SCORE')}
            >
              <Icons.CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> 
              <span className="ml-1.5">审阅</span>
            </Button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <Button 
              variant="ghost" 
              className="text-xs py-1.5 h-8 px-3 rounded-lg"
              onClick={() => createJob('DEAI_REWRITE')}
              loading={activeJobs.some(j => j.type === 'DEAI_REWRITE')}
            >
              <Icons.Wand2 className="w-3.5 h-3.5 text-purple-400" /> 
              <span className="ml-1.5">润色</span>
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
            className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          >
            <Icons.PanelRight className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 relative flex flex-col h-full bg-[#0f1117] transition-all duration-300">
          {focusMode && (
            <div className="absolute top-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity">
               <button 
                onClick={() => setFocusMode(false)}
                className="p-2 rounded-full bg-black/50 text-white/50 hover:text-white backdrop-blur-md border border-white/10"
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
                className="w-full min-h-[calc(100vh-300px)] bg-transparent text-xl text-gray-300 leading-loose resize-none border-none focus:outline-none focus:ring-0 placeholder-gray-800 selection:bg-indigo-500/30 font-serif tracking-wide"
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
        </main>

        <aside 
          className={`
            border-l border-white/5 bg-[#13141f] shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col z-20
            ${isSidebarOpen && !focusMode ? 'w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden'}
          `}
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <h2 className="font-semibold text-white flex items-center gap-2 text-sm tracking-wide">
              <Icons.History className="w-4 h-4 text-indigo-400" /> 版本历史
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
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
                <div key={version.id} className="group p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all cursor-pointer relative overflow-hidden">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-gray-400 group-hover:text-indigo-300 transition-colors">{new Date(version.createdAt).toLocaleString()}</span>
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
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {renderDiffModal()}
      {renderBranchPanel()}
      {renderReviewPanel()}
    </div>
  );
}
