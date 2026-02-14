'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateOutlineParams } from '@/src/shared/outline-calculator';
import OutlineTree, { OutlineNode } from '@/app/components/OutlineTree';
import { Button } from '@/app/components/ui/Button';

interface OutlineData {
  outline: string;
  outlineRough?: unknown;
  outlineDetailed?: unknown;
  outlineChapters?: unknown;
}

interface NovelData {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  theme?: string;
  protagonist?: string;
  worldSetting?: string;
  targetWords?: number;
  chapterCount?: number;
  keywords?: string[];
  creativeIntent?: string;
  specialRequirements?: string;
}

interface OutlineGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (data: OutlineData) => void;
  novelId: string;
  novel?: NovelData | null;
}

const GENRES = [
  '玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'
];

export default function OutlineGeneratorModal({ isOpen, onClose, onGenerated, novelId, novel }: OutlineGeneratorModalProps) {
  const [formData, setFormData] = useState({
    genre: '',
    theme: '',
    protagonist: '',
    worldSetting: '',
    chapterCount: 100,
    targetWords: 200,
    detailedNodeCount: 0,
    chaptersPerNode: 0,
    keywords: '',
    creativeIntent: '',
    specialRequirements: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  
  useEffect(() => {
    if (isOpen && novel) {
      setFormData({
        genre: novel.genre || '',
        theme: novel.theme || novel.description || '',
        protagonist: novel.protagonist || '',
        worldSetting: novel.worldSetting || '',
        chapterCount: novel.chapterCount ?? 100,
        targetWords: novel.targetWords ?? 200,
        detailedNodeCount: 0,
        chaptersPerNode: 0,
        keywords: novel.keywords?.join(', ') || '',
        creativeIntent: novel.creativeIntent || '',
        specialRequirements: novel.specialRequirements || '',
      });
    }
  }, [isOpen, novel]);
  const [generatedOutline, setGeneratedOutline] = useState('');
  const [roughOutline, setRoughOutline] = useState<any>(null);
  const [detailedOutline, setDetailedOutline] = useState<any>(null);
  const [chapterOutline, setChapterOutline] = useState<any>(null);
  const [stage, setStage] = useState<'rough' | 'detailed' | 'chapters' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const normalizeOutlineData = (data: any, defaultLevel: 'rough' | 'detailed' | 'chapter' = 'rough', parentId = 'root'): OutlineNode[] => {
    if (!data) return [];
    
    const items = Array.isArray(data) ? data : 
                 (data.blocks || data.children || data.chapters || data.events || data.story_arcs || []);
    
    if (!Array.isArray(items)) return [];

    return items.map((item: any, index: number) => {
      let level = item.level as 'rough' | 'detailed' | 'chapter';
      
      if (!level) {
        if (item.chapters || item.events) level = 'rough';
        else if (defaultLevel === 'chapter' && !item.children) level = 'chapter';
        else level = defaultLevel;
      }

      if (defaultLevel === 'detailed' && (item.children || item.events)) {
         level = 'rough';
      }
      if (defaultLevel === 'chapter') {
        if (item.children || item.blocks || item.events) level = 'rough';
      }

      const id = item.id || `${parentId}-${index}`;
      
      const childData = item.children || item.blocks || item.events || item.chapters || item.story_arcs;
      let children: OutlineNode[] | undefined;
      
      if (childData) {
        let childLevel: 'rough' | 'detailed' | 'chapter' = 'detailed';
        if (level === 'detailed') childLevel = 'chapter';
        if (level === 'rough') childLevel = 'detailed';
        
        children = normalizeOutlineData(childData, childLevel, id);
      }

      return {
        id,
        title: item.title || item.name || item.headline || item.chapter_title || `Node ${index + 1}`,
        content: item.content || item.description || item.summary || item.text || item.outline || '',
        level: level || defaultLevel,
        children,
        isExpanded: !collapsedNodes.has(id)
      };
    });
  };

  const treeNodes = useMemo(() => {
    if (chapterOutline) return normalizeOutlineData(chapterOutline, 'chapter');
    if (detailedOutline) return normalizeOutlineData(detailedOutline, 'detailed');
    if (roughOutline) return normalizeOutlineData(roughOutline, 'rough');
    return [];
  }, [chapterOutline, detailedOutline, roughOutline, collapsedNodes]);

  const handleToggleNode = (id: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const calculatedParams = useMemo(() => {
    return calculateOutlineParams(formData.targetWords, formData.chapterCount);
  }, [formData.targetWords, formData.chapterCount]);
  
  const effectiveDetailedNodeCount = formData.detailedNodeCount || calculatedParams.nodesPerVolume;
  const effectiveChaptersPerNode = formData.chaptersPerNode || calculatedParams.chaptersPerNode;
  
  const wordsPerChapterDensity = useMemo(() => {
    if (!formData.chapterCount || formData.chapterCount <= 0) return 3000;
    return (formData.targetWords * 10000) / formData.chapterCount;
  }, [formData.targetWords, formData.chapterCount]);
  
  const hasChapterDensityWarning = wordsPerChapterDensity > 10000 || wordsPerChapterDensity < 1000;
  
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
      // 适配单卷输出：如果是单对象，包装成 blocks 数组
      const normalizedRough = roughOutput.blocks || Array.isArray(roughOutput) ? roughOutput : { blocks: [roughOutput] };
      setRoughOutline(normalizedRough);

      setStage('detailed');
      const detailedOutput = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline: normalizedRough,
        targetWords: formData.targetWords,
        chapterCount: formData.chapterCount,
        detailedNodeCount: effectiveDetailedNodeCount,
      });
      // 适配细纲输出
      const normalizedDetailed = detailedOutput.blocks || detailedOutput.children ? detailedOutput : { blocks: [detailedOutput] };
      setDetailedOutline(normalizedDetailed);

      setStage('chapters');
      const chaptersOutput = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline: normalizedDetailed,
        targetWords: formData.targetWords,
        chapterCount: formData.chapterCount,
        chaptersPerNode: effectiveChaptersPerNode,
      });
      const normalizedChapters = chaptersOutput.blocks || chaptersOutput.events ? chaptersOutput : { blocks: [chaptersOutput] };
      setChapterOutline(normalizedChapters);

      const outlineText = typeof normalizedChapters === 'string'
        ? normalizedChapters
        : JSON.stringify(normalizedChapters, null, 2);
      setGeneratedOutline(outlineText);
    } catch (error) {
      console.error('Failed to start outline generation', error);
      setToast({ 
        message: error instanceof Error ? error.message : '大纲生成失败，请重试', 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsGenerating(false);
      setStage(null);
    }
  };

  const handleApply = () => {
    onGenerated({
      outline: generatedOutline,
      outlineRough: roughOutline,
      outlineDetailed: detailedOutline,
      outlineChapters: chapterOutline,
    });
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose} 
            className="h-10 w-10 rounded-xl border border-white/10 bg-white/[0.03] px-0 text-gray-400 group hover:bg-white/10 hover:text-white"
            aria-label="关闭大纲生成器"
            title="关闭"
          >
            <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <div className="flex-1 w-full min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-5 min-w-0 lg:h-full overflow-y-auto p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-white/5 custom-scrollbar bg-black/10">
            <div className="space-y-6 max-w-full">

              {hasChapterDensityWarning && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-xs text-amber-200">
                    <span className="font-medium">章节密度异常：</span>
                    每章约 {Math.round(wordsPerChapterDensity).toLocaleString()} 字
                    {wordsPerChapterDensity > 10000 
                      ? '（过高，AI 难以生成连贯内容，建议增加章节数）'
                      : '（过低，建议减少章节数或增加目标字数）'}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  小说类型
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map(g => (
                    <Button
                      key={g}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, genre: g }))}
                      className={`h-auto rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 ${
                        formData.genre === g
                          ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:bg-emerald-500/24'
                          : 'border border-transparent bg-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10 hover:text-zinc-200'
                      }`}
                    >
                      {g}
                    </Button>
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
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    细纲节点数/卷
                  </label>
                  <input
                    type="number"
                    value={formData.detailedNodeCount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, detailedNodeCount: parseInt(e.target.value) || 0 }))}
                    className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                    min={3}
                    max={20}
                    placeholder={`自动: ${calculatedParams.nodesPerVolume}`}
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    章节数/节点
                  </label>
                  <input
                    type="number"
                    value={formData.chaptersPerNode || ''}
                    onChange={e => setFormData(prev => ({ ...prev, chaptersPerNode: parseInt(e.target.value) || 0 }))}
                    className="glass-input w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500/30"
                    min={3}
                    max={30}
                    placeholder={`自动: ${calculatedParams.chaptersPerNode}`}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-300 mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  智能参数预览
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between text-gray-400">
                    <span>预计分卷</span>
                    <span className="text-white font-medium">{calculatedParams.volumeCount} 卷</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>每卷字数</span>
                    <span className="text-white font-medium">~{Math.round(calculatedParams.expectedVolumeWords / 10000)} 万</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>每卷事件</span>
                    <span className="text-white font-medium">{effectiveDetailedNodeCount} 个</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>每事件章节</span>
                    <span className="text-white font-medium">{effectiveChaptersPerNode} 章</span>
                  </div>
                </div>
                <div className="pt-2 mt-2 border-t border-emerald-500/20 flex justify-between text-xs">
                  <span className="text-gray-400">预计总章节</span>
                  <span className="text-emerald-300 font-medium">
                    {calculatedParams.volumeCount * effectiveDetailedNodeCount * effectiveChaptersPerNode} 章
                    ({Math.round(calculatedParams.volumeCount * effectiveDetailedNodeCount * effectiveChaptersPerNode * 3000 / 10000)} 万字)
                  </span>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2h-4l-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  创作意图
                </label>
                <textarea
                  value={formData.creativeIntent}
                  onChange={e => setFormData(prev => ({ ...prev, creativeIntent: e.target.value }))}
                  className="glass-input w-full px-4 py-3 rounded-xl h-20 resize-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="作者目标，例如：强调群像成长、减少爽点堆砌..."
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
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={isGenerating || !formData.genre}
                  className="group w-full rounded-xl py-4 shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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
                </Button>
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

          <div className="lg:col-span-7 min-w-0 bg-black/20 flex flex-col lg:h-full overflow-hidden min-h-[500px] lg:min-h-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5 shrink-0">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                生成结果
              </span>
              {generatedOutline && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApply}
                  className="h-8 rounded-lg border-emerald-500/35 bg-emerald-500/85 px-4 text-sm shadow-lg shadow-emerald-500/20 hover:bg-emerald-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  应用大纲
                </Button>
              )}
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar bg-[#0f1117]/50">
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
                <div className="w-full h-full overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <OutlineTree 
                      nodes={treeNodes}
                      onToggle={handleToggleNode}
                      readOnly={true}
                    />
                  </div>
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

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-up ${
          toast.type === 'success' ? 'bg-emerald-600' : 
          toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'info' && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span className="text-white font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
