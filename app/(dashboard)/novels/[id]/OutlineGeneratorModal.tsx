'use client';

import { useMemo, useState } from 'react';

interface OutlineGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (outline: string) => void;
  novelId: string;
}

const GENRES = [
  '玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'
];

export default function OutlineGeneratorModal({ isOpen, onClose, onGenerated, novelId }: OutlineGeneratorModalProps) {
  const [formData, setFormData] = useState({
    genre: '',
    theme: '',
    protagonist: '',
    worldSetting: '',
    chapterCount: 100,
    targetWords: 200,
    keywords: '',
    specialRequirements: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutline, setGeneratedOutline] = useState('');
  const [roughOutline, setRoughOutline] = useState<any>(null);
  const [detailedOutline, setDetailedOutline] = useState<any>(null);
  const [chapterOutline, setChapterOutline] = useState<any>(null);
  const [stage, setStage] = useState<'rough' | 'detailed' | 'chapters' | null>(null);
  const stageLabel = useMemo(() => {
    if (stage === 'rough') return '粗略大纲';
    if (stage === 'detailed') return '细纲扩展';
    if (stage === 'chapters') return '章节大纲';
    return '';
  }, [stage]);

  if (!isOpen) return null;

  const pollJob = (id: string) => new Promise<any>((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) return;
        const { job } = await res.json();
        if (job.status === 'succeeded') {
          clearInterval(interval);
          resolve(job.output);
        } else if (job.status === 'failed') {
          clearInterval(interval);
          reject(new Error(job.error || '大纲生成失败'));
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    }, 2000);
  });

  const runJob = async (type: string, input: Record<string, unknown>) => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, input }),
    });

    if (!res.ok) {
      throw new Error('生成失败');
    }

    const { job } = await res.json();
    return pollJob(job.id);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedOutline('');
    setRoughOutline(null);
    setDetailedOutline(null);
    setChapterOutline(null);

    try {
      setStage('rough');
      const roughOutput = await runJob('OUTLINE_ROUGH', {
        ...formData,
        novelId,
      });
      setRoughOutline(roughOutput);

      setStage('detailed');
      const detailedOutput = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline: roughOutput,
        targetWords: formData.targetWords,
        chapterCount: formData.chapterCount,
      });
      setDetailedOutline(detailedOutput);

      setStage('chapters');
      const chaptersOutput = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline: detailedOutput,
      });
      setChapterOutline(chaptersOutput);

      const outlineText = typeof chaptersOutput === 'string'
        ? chaptersOutput
        : JSON.stringify(chaptersOutput, null, 2);
      setGeneratedOutline(outlineText);
    } catch (error) {
      console.error('Failed to start outline generation', error);
      alert(error instanceof Error ? error.message : '大纲生成失败，请重试');
    } finally {
      setIsGenerating(false);
      setStage(null);
    }
  };

  const handleApply = () => {
    onGenerated(generatedOutline);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300" 
        onClick={onClose} 
      />
      
      <div className="glass-card w-full max-w-5xl h-[85vh] flex flex-col rounded-2xl relative z-10 animate-slide-up overflow-hidden shadow-2xl shadow-emerald-500/10 border-white/10 bg-gray-900/95">
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">AI 大纲生成器</h2>
              <p className="text-sm text-gray-400">基于深度学习模型，一键生成完整小说大纲</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 group"
          >
            <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 w-full min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 isolate">
          <div className="lg:col-span-5 min-w-0 lg:h-full lg:overflow-y-auto p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-white/5 custom-scrollbar bg-black/10">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  小说类型
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, genre: g }))}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 border ${
                        formData.genre === g
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                          : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:border-white/10'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  核心主题/卖点
                </label>
                <input
                  type="text"
                  value={formData.theme}
                  onChange={e => setFormData(prev => ({ ...prev, theme: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="例如：废柴逆袭、穿越重生、系统流..."
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  主角设定
                </label>
                <textarea
                  value={formData.protagonist}
                  onChange={e => setFormData(prev => ({ ...prev, protagonist: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl h-24 resize-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="主角的背景、性格、金手指..."
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  世界观设定
                </label>
                <textarea
                  value={formData.worldSetting}
                  onChange={e => setFormData(prev => ({ ...prev, worldSetting: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl h-24 resize-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="修炼体系、势力分布、时代背景..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    预计章节
                  </label>
                  <input
                    type="number"
                    value={formData.chapterCount}
                    onChange={e => setFormData(prev => ({ ...prev, chapterCount: parseInt(e.target.value) || 100 }))}
                    className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                    min={10}
                    max={2000}
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    目标字数(万)
                  </label>
                  <input
                    type="number"
                    value={formData.targetWords}
                    onChange={e => setFormData(prev => ({ ...prev, targetWords: parseInt(e.target.value) || 200 }))}
                    className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                    min={1}
                    max={1000}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  关键词/灵感
                </label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={e => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="用逗号分隔多个关键词..."
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  特殊要求
                </label>
                <textarea
                  value={formData.specialRequirements}
                  onChange={e => setFormData(prev => ({ ...prev, specialRequirements: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl h-20 resize-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="其他要求或注意事项..."
                />
              </div>

              <div className="pt-4 pb-2 space-y-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !formData.genre}
                  className="btn-primary w-full py-4 rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group transition-all duration-300 shadow-lg shadow-emerald-500/20"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="animate-pulse">正在构思大纲...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="font-semibold text-lg">开始生成大纲</span>
                    </>
                  )}
                </button>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>粗纲 → 细纲 → 章节纲</span>
                  {isGenerating && stageLabel && <span className="text-emerald-300">当前阶段：{stageLabel}</span>}
                </div>
                <div className="flex gap-2">
                  {['rough', 'detailed', 'chapters'].map((value, index) => (
                    <div
                      key={value}
                      className={`flex-1 h-1 rounded-full ${
                        (value === 'rough' && roughOutline) || (value === 'detailed' && detailedOutline) || (value === 'chapters' && chapterOutline)
                          ? 'bg-emerald-500'
                          : stage === value
                            ? 'bg-emerald-500/40 animate-pulse'
                            : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 min-w-0 bg-black/20 flex flex-col lg:h-full lg:overflow-hidden min-h-[500px] lg:min-h-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                生成结果
              </span>
              {generatedOutline && (
                <button
                  onClick={handleApply}
                  className="btn-primary px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  应用大纲
                </button>
              )}
            </div>
            
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-6 custom-scrollbar bg-[#0f1117]/50">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-6">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full animate-pulse opacity-20" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-white">AI 正在深度构思</h3>
                    <p className="text-sm text-gray-500">正在分析设定、规划剧情、构建人物关系...</p>
                  </div>
                </div>
              ) : generatedOutline ? (
                <div className="prose prose-invert max-w-none space-y-4">
                  {roughOutline && (
                    <details className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <summary className="cursor-pointer text-sm text-emerald-300">粗略大纲</summary>
                      <pre className="text-gray-200 whitespace-pre-wrap text-xs mt-3">
                        {JSON.stringify(roughOutline, null, 2)}
                      </pre>
                    </details>
                  )}
                  {detailedOutline && (
                    <details className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <summary className="cursor-pointer text-sm text-emerald-300">细纲扩展</summary>
                      <pre className="text-gray-200 whitespace-pre-wrap text-xs mt-3">
                        {JSON.stringify(detailedOutline, null, 2)}
                      </pre>
                    </details>
                  )}
                  <pre className="text-gray-200 whitespace-pre-wrap font-sans text-base leading-relaxed p-4 rounded-xl border border-white/5 bg-black/20">
                    {generatedOutline}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5">
                    <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-gray-400">准备就绪</p>
                    <p className="text-sm text-gray-600 mt-1">在左侧填写小说设定，让 AI 为你生成精彩大纲</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
