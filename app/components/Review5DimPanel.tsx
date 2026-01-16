'use client';

import { useState, useEffect } from 'react';

interface ReviewDimensions {
  standaloneQuality: {
    score: number;
    strengths: string[];
    weaknesses: string[];
  };
  continuity: {
    score: number;
    issues: Array<{
      type: string;
      description: string;
      severity: string;
      location?: string;
    }>;
  };
  outlineAdherence: {
    score: number;
    deviations: Array<{
      expected: string;
      actual: string;
      severity: string;
    }>;
    verdict: 'acceptable' | 'needs_revision' | 'reject';
  };
  characterConsistency: {
    score: number;
    inconsistencies: Array<{
      character: string;
      issue: string;
      expectedBehavior?: string;
      observedBehavior?: string;
    }>;
  };
  hookManagement: {
    score: number;
    hooksPlanted: string[];
    hooksReferenced: string[];
    hooksResolved: string[];
    overdueWarnings: Array<{
      hookDescription: string;
      plantedChapter: number;
      chaptersOverdue: number;
      importance: string;
    }>;
  };
}

interface ReviewFeedback {
  overallScore: number;
  dimensions: ReviewDimensions;
  issues: Array<{
    type: string;
    severity: string;
    location?: string;
    description: string;
    suggestion: string;
  }>;
  verdict: 'approve' | 'minor_revision' | 'major_revision' | 'reject';
  regenerationInstructions?: string;
  summary?: string;
  reviewedAt?: string;
}

interface Review5DimPanelProps {
  chapterId: string;
  onClose?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

export default function Review5DimPanel({ chapterId, onClose, onApprove, onReject }: Review5DimPanelProps) {
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof ReviewDimensions>('standaloneQuality');

  useEffect(() => {
    fetchReview();
  }, [chapterId]);

  const fetchReview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/review-5dim`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasReview) {
          setFeedback(data.feedback as ReviewFeedback);
        }
      }
    } catch (err) {
      console.error('Failed to fetch review:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerReview = async () => {
    setIsTriggering(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/review-5dim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`审查任务已创建: ${data.jobId}`);
      } else {
        const data = await res.json();
        setError(data.error || '创建审查任务失败');
      }
    } catch (err) {
      setError('创建审查任务失败');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/chapters/${chapterId}/review-5dim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === 'approve' && onApprove) onApprove();
        if (action === 'reject' && onReject) onReject();
      }
    } catch (err) {
      console.error('Failed to update review status:', err);
    }
  };

  const DIMENSION_LABELS: Record<keyof ReviewDimensions, { label: string; icon: string; description: string }> = {
    standaloneQuality: { label: '独立质量', icon: '✨', description: '文笔、节奏与可读性' },
    continuity: { label: '连贯性', icon: '🔗', description: '与前文的逻辑衔接' },
    outlineAdherence: { label: '大纲符合', icon: '📋', description: '剧情走向是否偏离' },
    characterConsistency: { label: '人物一致', icon: '👤', description: '性格与行为逻辑' },
    hookManagement: { label: '钩子管理', icon: '🎣', description: '伏笔埋设与回收' },
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 6) return 'text-yellow-400';
    if (score >= 4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-emerald-500';
    if (score >= 6) return 'bg-yellow-500';
    if (score >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getVerdictConfig = (verdict: string) => {
    const configs: Record<string, { label: string; color: string; bg: string; icon: string }> = {
      approve: { label: '通过', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '✅' },
      minor_revision: { label: '建议小修', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: '⚠️' },
      major_revision: { label: '需要大修', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: '🔨' },
      reject: { label: '拒绝', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: '❌' },
    };
    return configs[verdict] || configs.approve;
  };

  if (isLoading) {
    return (
      <div className="glass-card p-12 rounded-3xl text-center flex flex-col items-center justify-center min-h-[400px]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-6" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-indigo-400">AI</div>
        </div>
        <p className="text-gray-300 font-medium text-lg">正在深度审查章节...</p>
        <p className="text-gray-500 mt-2 text-sm">检查连贯性、人物逻辑与大纲偏离度</p>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div className="glass-card p-12 rounded-3xl text-center flex flex-col items-center justify-center min-h-[400px] border border-white/10 group hover:border-indigo-500/30 transition-all">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center mb-6 shadow-inner shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-500">
          <span className="text-4xl">📊</span>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">5维度智能审查</h3>
        <p className="text-gray-400 mb-8 max-w-sm">
          对章节进行全面的质量体检，包括独立质量、连贯性、大纲符合度、人物一致性和钩子管理。
        </p>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}
        <button
          onClick={triggerReview}
          disabled={isTriggering}
          className="btn-primary px-8 py-3 rounded-xl flex items-center gap-3 text-lg font-medium shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all"
        >
          {isTriggering ? (
            <>
              <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              正在启动审查...
            </>
          ) : (
            <>
              <span>🔍</span>
              开始审查
            </>
          )}
        </button>
      </div>
    );
  }

  const verdictConfig = getVerdictConfig(feedback.verdict);
  const dims = feedback.dimensions;

  return (
    <div className="glass-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
      <div className="p-6 md:p-8 bg-gradient-to-b from-white/5 to-transparent border-b border-white/5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-indigo-400">📊</span>
                审查报告
              </h2>
              <span className="text-xs font-mono bg-white/10 text-gray-400 px-2 py-0.5 rounded-lg border border-white/5">
                {feedback.reviewedAt ? new Date(feedback.reviewedAt).toLocaleTimeString() : '刚刚'}
              </span>
            </div>
            
            {feedback.summary && (
              <p className="text-gray-300 leading-relaxed text-sm md:text-base border-l-2 border-indigo-500/50 pl-4 py-1">
                {feedback.summary}
              </p>
            )}
          </div>

          <div className="flex gap-4 shrink-0">
            <div className="glass-card p-4 rounded-2xl bg-black/20 text-center min-w-[100px] border border-white/5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">综合评分</div>
              <div className={`text-4xl font-bold ${getScoreColor(feedback.overallScore)} font-mono tracking-tighter`}>
                {feedback.overallScore}
                <span className="text-sm text-gray-600 font-sans ml-1">/10</span>
              </div>
            </div>
            
            <div className={`p-4 rounded-2xl border ${verdictConfig.bg} text-center min-w-[120px] flex flex-col items-center justify-center`}>
              <div className="text-xs opacity-70 uppercase tracking-wider mb-1 text-white">结论</div>
              <div className={`text-xl font-bold ${verdictConfig.color} flex items-center gap-1`}>
                {verdictConfig.icon} {verdictConfig.label}
              </div>
            </div>
          </div>
        </div>
        
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 min-h-[500px]">
        <div className="md:col-span-1 border-r border-white/5 bg-black/10">
          <div className="p-2 space-y-1">
            {(Object.keys(DIMENSION_LABELS) as Array<keyof ReviewDimensions>).map((key) => {
              const config = DIMENSION_LABELS[key];
              const score = key === 'outlineAdherence' ? dims[key].score * 10 : dims[key].score;
              const isActive = activeTab === key;
              
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-white/10 text-white shadow-lg' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-3">
                      <span className="text-xl group-hover:scale-110 transition-transform">{config.icon}</span>
                      <div>
                        <div className="font-bold text-sm">{config.label}</div>
                        <div className="text-[10px] opacity-60">{config.description}</div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold ${getScoreColor(score)}`}>{score.toFixed(1)}</div>
                  </div>
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                </button>
              );
            })}
          </div>
          
          <div className="p-6 mt-4 border-t border-white/5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">问题概览</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/> 严重问题
                </span>
                <span className="font-mono text-white bg-white/10 px-2 rounded">
                  {feedback.issues.filter(i => i.severity === 'critical').length}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-orange-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"/> 重要问题
                </span>
                <span className="font-mono text-white bg-white/10 px-2 rounded">
                  {feedback.issues.filter(i => i.severity === 'major').length}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"/> 轻微建议
                </span>
                <span className="font-mono text-white bg-white/10 px-2 rounded">
                  {feedback.issues.filter(i => i.severity === 'minor').length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 p-6 md:p-8 bg-white/[0.02]">
          {activeTab === 'standaloneQuality' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>✨</span> 独立质量分析
                </h3>
                <div className="text-sm px-3 py-1 bg-white/5 rounded-full text-gray-300">
                  得分: <span className={getScoreColor(dims.standaloneQuality.score)}>{dims.standaloneQuality.score}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-emerald-500 bg-emerald-500/5">
                  <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-3">亮点</h4>
                  <ul className="space-y-2">
                    {dims.standaloneQuality.strengths.length > 0 ? (
                      dims.standaloneQuality.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-gray-200 flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">✓</span> {s}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-gray-500 italic">未发现显著亮点</li>
                    )}
                  </ul>
                </div>
                
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-red-500 bg-red-500/5">
                  <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-3">不足</h4>
                  <ul className="space-y-2">
                    {dims.standaloneQuality.weaknesses.length > 0 ? (
                      dims.standaloneQuality.weaknesses.map((w, i) => (
                        <li key={i} className="text-sm text-gray-200 flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">✗</span> {w}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-gray-500 italic">未发现显著不足</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'continuity' && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🔗</span> 连贯性检查
              </h3>
              
              {dims.continuity.issues.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✓</span>
                  </div>
                  <p className="text-emerald-400 font-medium">完美连贯</p>
                  <p className="text-gray-500 text-sm mt-1">剧情与前文衔接自然，无逻辑断层。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dims.continuity.issues.map((issue, i) => (
                    <div key={i} className="glass-card p-5 rounded-2xl border-l-4 border-l-red-500 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded">
                          {issue.severity === 'critical' ? '严重阻断' : issue.severity === 'major' ? '逻辑漏洞' : '细节偏差'}
                        </span>
                        <span className="text-xs text-gray-500">{issue.type}</span>
                      </div>
                      <p className="text-white font-medium mb-1">{issue.description}</p>
                      {issue.location && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {issue.location}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'outlineAdherence' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>📋</span> 大纲符合度
                </h3>
                <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${
                  dims.outlineAdherence.verdict === 'acceptable' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  dims.outlineAdherence.verdict === 'needs_revision' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {dims.outlineAdherence.verdict === 'acceptable' ? '符合预期' :
                   dims.outlineAdherence.verdict === 'needs_revision' ? '需要修正' : '严重偏离'}
                </span>
              </div>

              {dims.outlineAdherence.deviations.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                  <span className="text-4xl block mb-4">🎯</span>
                  <p className="text-gray-300">完全符合大纲规划</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dims.outlineAdherence.deviations.map((dev, i) => (
                    <div key={i} className="glass-card p-5 rounded-2xl">
                      <div className="grid grid-cols-2 gap-6 relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5 -translate-x-1/2" />
                        <div>
                          <span className="text-xs text-gray-500 uppercase tracking-wider block mb-2">大纲预期</span>
                          <p className="text-sm text-gray-300 leading-relaxed">{dev.expected}</p>
                        </div>
                        <div>
                          <span className="text-xs text-yellow-500 uppercase tracking-wider block mb-2">实际剧情</span>
                          <p className="text-sm text-white leading-relaxed">{dev.actual}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'characterConsistency' && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>👤</span> 人物一致性
              </h3>
              
              {dims.characterConsistency.inconsistencies.length === 0 ? (
                <div className="glass-card p-8 rounded-2xl text-center bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
                  <div className="flex justify-center mb-4">
                    <div className="flex -space-x-4">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-10 h-10 rounded-full bg-white/10 border-2 border-[#0f172a] flex items-center justify-center text-xs">
                          👤
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-indigo-300 font-medium">全员人设在线</p>
                  <p className="text-gray-500 text-sm mt-1">没有发现OOC（角色崩坏）现象。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dims.characterConsistency.inconsistencies.map((inc, i) => (
                    <div key={i} className="glass-card p-5 rounded-2xl border-l-4 border-l-orange-500">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold">
                          {inc.character[0]}
                        </div>
                        <h4 className="text-white font-bold">{inc.character}</h4>
                        <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded">人设冲突</span>
                      </div>
                      <p className="text-gray-300 text-sm mb-3">{inc.issue}</p>
                      <div className="grid grid-cols-2 gap-4 text-xs bg-black/20 p-3 rounded-xl">
                        <div>
                          <span className="text-gray-500 block mb-1">应该表现为</span>
                          <span className="text-emerald-400">{inc.expectedBehavior}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">实际表现为</span>
                          <span className="text-red-400">{inc.observedBehavior}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'hookManagement' && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🎣</span> 钩子管理
              </h3>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="glass-card p-4 rounded-xl text-center border-t-2 border-t-blue-500">
                  <div className="text-2xl font-bold text-white">{dims.hookManagement.hooksPlanted.length}</div>
                  <div className="text-xs text-blue-400 uppercase tracking-wider mt-1">新埋设</div>
                </div>
                <div className="glass-card p-4 rounded-xl text-center border-t-2 border-t-purple-500">
                  <div className="text-2xl font-bold text-white">{dims.hookManagement.hooksReferenced.length}</div>
                  <div className="text-xs text-purple-400 uppercase tracking-wider mt-1">引用</div>
                </div>
                <div className="glass-card p-4 rounded-xl text-center border-t-2 border-t-emerald-500">
                  <div className="text-2xl font-bold text-white">{dims.hookManagement.hooksResolved.length}</div>
                  <div className="text-xs text-emerald-400 uppercase tracking-wider mt-1">解决</div>
                </div>
              </div>
              
              {dims.hookManagement.overdueWarnings.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"/>
                    逾期警告
                  </h4>
                  {dims.hookManagement.overdueWarnings.map((warning, i) => (
                    <div key={i} className="glass-card p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
                      <div className="text-2xl">⚠️</div>
                      <div>
                        <p className="text-white font-medium text-sm">{warning.hookDescription}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="text-gray-400">第 {warning.plantedChapter} 章埋设</span>
                          <span className="text-yellow-400 font-bold">已超期 {warning.chaptersOverdue} 章</span>
                          <span className="bg-white/10 px-2 py-0.5 rounded text-gray-300">{warning.importance}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-black/20 border-t border-white/5 flex items-center justify-between">
        {feedback.regenerationInstructions ? (
          <div className="flex-1 mr-6">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">修改建议</h4>
            <p className="text-sm text-gray-400 line-clamp-1">{feedback.regenerationInstructions}</p>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleAction('reject')}
            className="px-6 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
          >
            拒绝并重写
          </button>
          <button
            onClick={() => handleAction('approve')}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 text-sm font-bold flex items-center gap-2 transform hover:-translate-y-0.5"
          >
            <span>✓</span> 批准章节
          </button>
        </div>
      </div>
    </div>
  );
}
