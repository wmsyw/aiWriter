'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const Icons = {
  Plus: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  ),
  History: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/><path d="M3 3v9h9"/><path d="M12 7v5l4 2"/></svg>
  ),
  BookOpen: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  ),
  Trash2: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
  ),
  Eye: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  Sparkles: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 5h4"/><path d="M3 9h4"/></svg>
  ),
  Loader2: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  ),
  CheckCircle: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  X: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  ),
  ChevronRight: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m9 18 6-6-6-6"/></svg>
  ),
  Upload: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
  ),
  Settings: (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
};

interface Article {
  id: string;
  title: string;
  genre: string;
  createdAt: string;
  updatedAt: string;
}

interface Novel {
  id: string;
  title: string;
}

interface AnalysisTemplate {
  id: string;
  name: string;
  description?: string;
  aspects: Array<{ key: string; label: string; description?: string; enabled: boolean }>;
  isDefault: boolean;
}

interface AnalysisResult {
  coreElements?: Record<string, string>;
  characterization?: Record<string, string>;
  plotStructure?: Record<string, string>;
  writingTechniques?: Record<string, string>;
  languageStyle?: Record<string, string>;
  highlights?: string[];
  evaluation?: {
    score: number;
    summary: string;
  };
  [key: string]: any;
}

interface ArticleDetail extends Article {
  content: string;
  analysis: AnalysisResult;
}

const GENRES = ['小说', '散文', '诗歌', '评论', '其他'];

export default function ArticleAnalysisPage() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [focus, setFocus] = useState('');
  const [saveToMaterials, setSaveToMaterials] = useState(false);
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedArticle, setSelectedArticle] = useState<ArticleDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchArticles, setBatchArticles] = useState<Array<{ title: string; content: string; genre: string }>>([]);
  const [batchFocus, setBatchFocus] = useState('');
  const [batchSaveToMaterials, setBatchSaveToMaterials] = useState(false);
  const [batchNovelId, setBatchNovelId] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AnalysisTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateAspects, setTemplateAspects] = useState<Array<{ key: string; label: string; description: string; enabled: boolean }>>([]);
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  useEffect(() => {
    fetchArticles();
    fetchNovels();
    fetchTemplates();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/articles?limit=20');
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      }
    } catch (err) {
      console.error('Failed to fetch articles', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNovels = async () => {
    try {
      const res = await fetch('/api/novels');
      if (res.ok) {
        const data = await res.json();
        setNovels(data.novels || []);
      }
    } catch (err) {
      console.error('Failed to fetch novels', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/analysis-templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        const defaultTemplate = data.templates?.find((t: AnalysisTemplate) => t.isDefault);
        if (defaultTemplate) setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('请填写标题和内容');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ARTICLE_ANALYZE',
          input: {
            title,
            content,
            genre,
            analysisFocus: focus,
            saveToMaterials,
            novelId: saveToMaterials ? selectedNovelId : undefined,
            templateId: selectedTemplateId || undefined,
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert('分析任务已提交！请在任务列表中查看进度，完成后将出现在"历史记录"中。');
        
        setTitle('');
        setContent('');
        setFocus('');
        setSaveToMaterials(false);
        setActiveTab('history');
        setTimeout(fetchArticles, 1000); 
      } else {
        const err = await res.json();
        alert(`提交失败: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Submit failed', err);
      alert('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条分析记录吗？')) return;

    try {
      const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setArticles(prev => prev.filter(a => a.id !== id));
        if (selectedArticle?.id === id) {
          setIsDetailOpen(false);
          setSelectedArticle(null);
        }
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleView = async (id: string) => {
    setDetailLoading(true);
    setIsDetailOpen(true);
    try {
      const res = await fetch(`/api/articles/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedArticle(data);
      } else {
        alert('加载详情失败');
        setIsDetailOpen(false);
      }
    } catch (err) {
      console.error('Fetch detail failed', err);
      setIsDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const addBatchArticle = () => {
    setBatchArticles(prev => [...prev, { title: '', content: '', genre: GENRES[0] }]);
  };

  const removeBatchArticle = (index: number) => {
    setBatchArticles(prev => prev.filter((_, i) => i !== index));
  };

  const updateBatchArticle = (index: number, field: string, value: string) => {
    setBatchArticles(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const handleBatchSubmit = async () => {
    const validArticles = batchArticles.filter(a => a.title.trim() && a.content.trim());
    if (validArticles.length === 0) {
      alert('请至少添加一篇有效文章');
      return;
    }

    setBatchSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'BATCH_ARTICLE_ANALYZE',
          input: {
            articles: validArticles,
            analysisFocus: batchFocus,
            saveToMaterials: batchSaveToMaterials,
            novelId: batchSaveToMaterials ? batchNovelId : undefined,
          },
        }),
      });

      if (res.ok) {
        alert(`批量分析任务已提交！共 ${validArticles.length} 篇文章`);
        setShowBatchModal(false);
        setBatchArticles([]);
        setBatchFocus('');
        setBatchSaveToMaterials(false);
        setActiveTab('history');
        setTimeout(fetchArticles, 2000);
      } else {
        const err = await res.json();
        alert(`提交失败: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Batch submit failed', err);
      alert('提交失败，请重试');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const DEFAULT_ASPECTS = [
    { key: 'coreElements', label: '核心要素', description: '主题、情感基调、核心冲突', enabled: true },
    { key: 'characterization', label: '人物刻画', description: '人物塑造手法、性格特点', enabled: true },
    { key: 'plotStructure', label: '情节结构', description: '叙事结构、节奏把控', enabled: true },
    { key: 'writingTechniques', label: '写作技巧', description: '修辞手法、描写技巧', enabled: true },
    { key: 'languageStyle', label: '语言风格', description: '文风特点、用词特色', enabled: true },
    { key: 'highlights', label: '可借鉴亮点', description: '值得学习的写作技巧', enabled: true },
  ];

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setTemplateAspects([...DEFAULT_ASPECTS]);
    setTemplateIsDefault(false);
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: AnalysisTemplate) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateDesc(t.description || '');
    setTemplateAspects(t.aspects.map(a => ({ ...a, description: a.description || '' })));
    setTemplateIsDefault(t.isDefault);
    setShowTemplateModal(true);
  };

  const addTemplateAspect = () => {
    setTemplateAspects(prev => [...prev, { key: `custom_${Date.now()}`, label: '', description: '', enabled: true }]);
  };

  const removeTemplateAspect = (index: number) => {
    setTemplateAspects(prev => prev.filter((_, i) => i !== index));
  };

  const updateTemplateAspect = (index: number, field: string, value: string | boolean) => {
    setTemplateAspects(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('请输入模板名称');
      return;
    }
    const validAspects = templateAspects.filter(a => a.label.trim());
    if (validAspects.length === 0) {
      alert('请至少添加一个分析维度');
      return;
    }

    setTemplateSaving(true);
    try {
      const url = editingTemplate ? `/api/analysis-templates/${editingTemplate.id}` : '/api/analysis-templates';
      const method = editingTemplate ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description: templateDesc,
          aspects: validAspects,
          isDefault: templateIsDefault,
        }),
      });

      if (res.ok) {
        setShowTemplateModal(false);
        fetchTemplates();
      } else {
        const err = await res.json();
        alert(`保存失败: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Save template failed', err);
      alert('保存失败，请重试');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      const res = await fetch(`/api/analysis-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTemplates();
        if (selectedTemplateId === id) setSelectedTemplateId('');
      }
    } catch (err) {
      console.error('Delete template failed', err);
    }
  };

  const renderAnalysisContent = (data: AnalysisResult) => {
    const sectionMap: Record<string, string> = {
      coreElements: '核心要素',
      characterization: '人物刻画',
      plotStructure: '情节结构',
      writingTechniques: '写作技巧',
      languageStyle: '语言风格',
      highlights: '可借鉴亮点',
      evaluation: '综合评价'
    };

    return (
      <div className="space-y-8">
        {data.evaluation && (
          <div className="glass-card bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-6 rounded-2xl border border-indigo-500/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Icons.Sparkles className="w-6 h-6 text-yellow-400" />
                综合评价
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">评分</span>
                <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                  {data.evaluation.score}
                </span>
                <span className="text-gray-500">/ 10</span>
              </div>
            </div>
            <p className="text-gray-300 leading-relaxed font-serif text-lg">
              {data.evaluation.summary}
            </p>
          </div>
        )}

        {Object.entries(sectionMap).map(([key, label]) => {
          if (key === 'evaluation' || !data[key]) return null;
          
          const content = data[key];
          
          return (
            <div key={key} className="glass-card p-6 rounded-2xl hover:border-white/10 transition-colors">
              <h3 className="text-lg font-bold text-indigo-300 mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                <Icons.CheckCircle className="w-5 h-5 opacity-70" />
                {label}
              </h3>
              
              {Array.isArray(content) ? (
                <ul className="space-y-2">
                  {content.map((item: string, idx: number) => (
                    <li key={idx} className="flex gap-3 text-gray-300">
                      <span className="text-indigo-500 mt-1.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : typeof content === 'object' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(content).map(([subKey, subValue]) => (
                    <div key={subKey} className="bg-white/5 p-4 rounded-xl">
                      <div className="text-sm font-medium text-gray-400 mb-1">{subKey}</div>
                      <div className="text-gray-200">{String(subValue)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                 <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{String(content)}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">文章分析</h1>
            <p className="text-gray-400">深度解析文章结构、人物与技巧，提取创作素材</p>
          </div>
          
          <div className="flex gap-3 self-start md:self-auto">
            <button
              onClick={openNewTemplate}
              className="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10"
              title="管理分析模板"
            >
              <Icons.Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setBatchArticles([{ title: '', content: '', genre: GENRES[0] }]); setShowBatchModal(true); }}
              className="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10"
            >
              <Icons.Upload className="w-4 h-4" />
              批量导入
            </button>
            <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab('new')}
                className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'new'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icons.Plus className="w-4 h-4" />
                新建分析
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'history'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icons.History className="w-4 h-4" />
                历史记录
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'new' ? (
          <div className="glass-card rounded-2xl p-6 md:p-8 animate-fade-in">
            <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-gray-300">文章标题</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入文章标题..."
                    className="glass-input w-full px-4 py-3 text-lg"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">文章体裁</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="glass-input w-full px-4 py-3.5 appearance-none cursor-pointer"
                  >
                    {GENRES.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">文章正文</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="粘贴文章内容到此处..."
                  className="glass-input w-full px-4 py-3 min-h-[400px] font-serif leading-relaxed text-gray-300 resize-none"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  分析侧重点 <span className="text-gray-500 font-normal">(可选)</span>
                </label>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="例如：重点分析反派角色的塑造..."
                  className="glass-input w-full px-4 py-3"
                />
              </div>

              {templates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">
                    分析模板 <span className="text-gray-500 font-normal">(可选)</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="glass-input w-full md:w-1/2 px-4 py-3"
                  >
                    <option value="" className="bg-gray-900">使用默认分析维度</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id} className="bg-gray-900">
                        {t.name} {t.isDefault ? '(默认)' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTemplateId && templates.find(t => t.id === selectedTemplateId)?.description && (
                    <p className="text-xs text-gray-500 mt-1">
                      {templates.find(t => t.id === selectedTemplateId)?.description}
                    </p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="saveToMaterials"
                    checked={saveToMaterials}
                    onChange={(e) => setSaveToMaterials(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 bg-black/20 text-indigo-500 focus:ring-indigo-500/50"
                  />
                  <label htmlFor="saveToMaterials" className="text-gray-300 select-none">
                    将提取的人物和设定保存到素材库
                  </label>
                </div>

                {saveToMaterials && (
                  <div className="ml-8 animate-slide-up">
                    <label className="text-sm font-medium text-gray-400 mb-2 block">选择归属小说</label>
                    <select
                      value={selectedNovelId}
                      onChange={(e) => setSelectedNovelId(e.target.value)}
                      className="glass-input w-full md:w-1/2 px-4 py-2"
                      required={saveToMaterials}
                    >
                      <option value="" className="bg-gray-900">请选择小说...</option>
                      {novels.map(novel => (
                        <option key={novel.id} value={novel.id} className="bg-gray-900">{novel.title}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary px-8 py-3 rounded-xl flex items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Icons.Loader2 className="w-5 h-5 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Icons.Sparkles className="w-5 h-5" />
                      开始深度分析
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-20">
                <Icons.Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              </div>
            ) : articles.length === 0 ? (
              <div className="glass-card rounded-2xl p-16 text-center">
                <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-400">
                  <Icons.BookOpen className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">暂无分析记录</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                  您还没有分析过任何文章。创建新的分析可以帮助您拆解优秀作品，学习写作技巧。
                </p>
                <button
                  onClick={() => setActiveTab('new')}
                  className="btn-primary px-6 py-2.5 rounded-xl inline-flex items-center gap-2"
                >
                  <Icons.Plus className="w-4 h-4" />
                  开始第一次分析
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                {articles.map(article => (
                  <div
                    key={article.id}
                    onClick={() => handleView(article.id)}
                    className="glass-card p-6 rounded-2xl group cursor-pointer hover:border-indigo-500/30 transition-all hover:-translate-y-1 relative"
                  >
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDelete(article.id, e)}
                        className="p-2 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Icons.Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mb-4">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/10">
                        {article.genre || '未分类'}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {article.title}
                    </h3>
                    
                    <div className="text-sm text-gray-500 flex items-center gap-4 mt-6">
                      <span className="flex items-center gap-1.5">
                        <Icons.History className="w-3.5 h-3.5" />
                        {new Date(article.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isDetailOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDetailOpen(false)}
          />
          
          <div className="relative w-full max-w-4xl bg-[#0f1117] h-full shadow-2xl overflow-hidden flex flex-col border-l border-white/10 animate-slide-left">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Icons.Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
              </div>
            ) : selectedArticle ? (
              <>
                <div className="p-6 border-b border-white/5 flex items-start justify-between bg-white/[0.02] backdrop-blur-xl z-10">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">
                         {selectedArticle.genre}
                       </span>
                       <span className="text-gray-500 text-xs">
                         {new Date(selectedArticle.createdAt).toLocaleString()}
                       </span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{selectedArticle.title}</h2>
                  </div>
                  <button 
                    onClick={() => setIsDetailOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                  >
                    <Icons.X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                  <div className="prose prose-invert max-w-none">
                    {selectedArticle.analysis ? (
                      renderAnalysisContent(selectedArticle.analysis)
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        分析结果不可用
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-4 border-t border-white/5 bg-white/[0.02]">
                  <button
                     onClick={() => setIsDetailOpen(false)}
                     className="w-full btn-secondary py-3 rounded-xl"
                  >
                    关闭
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowBatchModal(false)}
          />
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0f1117] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Icons.Upload className="w-5 h-5 text-indigo-400" />
                  批量导入文章
                </h2>
                <p className="text-sm text-gray-400 mt-1">一次最多导入 10 篇文章进行分析</p>
              </div>
              <button 
                onClick={() => setShowBatchModal(false)}
                className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <Icons.X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {batchArticles.map((article, index) => (
                <div key={index} className="glass-card p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-400">文章 {index + 1}</span>
                    {batchArticles.length > 1 && (
                      <button
                        onClick={() => removeBatchArticle(index)}
                        className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors"
                      >
                        <Icons.Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={article.title}
                      onChange={(e) => updateBatchArticle(index, 'title', e.target.value)}
                      placeholder="文章标题"
                      className="glass-input px-3 py-2 md:col-span-3"
                    />
                    <select
                      value={article.genre}
                      onChange={(e) => updateBatchArticle(index, 'genre', e.target.value)}
                      className="glass-input px-3 py-2"
                    >
                      {GENRES.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={article.content}
                    onChange={(e) => updateBatchArticle(index, 'content', e.target.value)}
                    placeholder="粘贴文章内容..."
                    className="glass-input w-full px-3 py-2 min-h-[120px] resize-none text-sm"
                  />
                </div>
              ))}

              {batchArticles.length < 10 && (
                <button
                  onClick={addBatchArticle}
                  className="w-full py-3 border-2 border-dashed border-white/10 rounded-xl text-gray-400 hover:text-white hover:border-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Icons.Plus className="w-4 h-4" />
                  添加文章
                </button>
              )}

              <div className="pt-4 border-t border-white/5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    统一分析侧重点 <span className="text-gray-500 font-normal">(可选)</span>
                  </label>
                  <input
                    type="text"
                    value={batchFocus}
                    onChange={(e) => setBatchFocus(e.target.value)}
                    placeholder="例如：重点分析人物塑造技巧..."
                    className="glass-input w-full px-3 py-2"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="batchSaveToMaterials"
                    checked={batchSaveToMaterials}
                    onChange={(e) => setBatchSaveToMaterials(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 bg-black/20 text-indigo-500 focus:ring-indigo-500/50"
                  />
                  <label htmlFor="batchSaveToMaterials" className="text-gray-300 select-none">
                    将提取的素材保存到素材库
                  </label>
                </div>

                {batchSaveToMaterials && (
                  <select
                    value={batchNovelId}
                    onChange={(e) => setBatchNovelId(e.target.value)}
                    className="glass-input w-full md:w-1/2 px-3 py-2"
                  >
                    <option value="" className="bg-gray-900">请选择小说...</option>
                    {novels.map(novel => (
                      <option key={novel.id} value={novel.id} className="bg-gray-900">{novel.title}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button
                onClick={() => setShowBatchModal(false)}
                className="flex-1 btn-secondary py-3 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleBatchSubmit}
                disabled={batchSubmitting || batchArticles.filter(a => a.title && a.content).length === 0}
                className="flex-1 btn-primary py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {batchSubmitting ? (
                  <>
                    <Icons.Loader2 className="w-5 h-5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Icons.Sparkles className="w-5 h-5" />
                    开始批量分析 ({batchArticles.filter(a => a.title && a.content).length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowTemplateModal(false)}
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0f1117] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Icons.Settings className="w-5 h-5 text-indigo-400" />
                  {editingTemplate ? '编辑分析模板' : '新建分析模板'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">自定义文章分析的维度和重点</p>
              </div>
              <button 
                onClick={() => setShowTemplateModal(false)}
                className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <Icons.X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">模板名称</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="例如：小说技巧分析"
                  className="glass-input w-full px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">模板描述 (可选)</label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="简要描述这个模板的用途..."
                  className="glass-input w-full px-3 py-2"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">分析维度</label>
                  <button
                    onClick={addTemplateAspect}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Icons.Plus className="w-3 h-3" /> 添加维度
                  </button>
                </div>
                
                {templateAspects.map((aspect, index) => (
                  <div key={index} className="glass-card p-3 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={aspect.enabled}
                        onChange={(e) => updateTemplateAspect(index, 'enabled', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-black/20 text-indigo-500"
                      />
                      <input
                        type="text"
                        value={aspect.label}
                        onChange={(e) => updateTemplateAspect(index, 'label', e.target.value)}
                        placeholder="维度名称"
                        className="glass-input flex-1 px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => removeTemplateAspect(index)}
                        className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors"
                      >
                        <Icons.Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={aspect.description}
                      onChange={(e) => updateTemplateAspect(index, 'description', e.target.value)}
                      placeholder="维度说明 (可选)"
                      className="glass-input w-full px-2 py-1 text-xs text-gray-400"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="templateIsDefault"
                  checked={templateIsDefault}
                  onChange={(e) => setTemplateIsDefault(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-black/20 text-indigo-500 focus:ring-indigo-500/50"
                />
                <label htmlFor="templateIsDefault" className="text-gray-300 select-none">
                  设为默认模板
                </label>
              </div>

              {templates.length > 0 && !editingTemplate && (
                <div className="pt-4 border-t border-white/5">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">已有模板</h3>
                  <div className="space-y-2">
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div>
                          <span className="text-white">{t.name}</span>
                          {t.isDefault && <span className="ml-2 text-xs text-indigo-400">(默认)</span>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditTemplate(t)}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="text-xs text-gray-400 hover:text-red-400"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 btn-secondary py-3 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={templateSaving || !templateName.trim()}
                className="flex-1 btn-primary py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {templateSaving ? (
                  <>
                    <Icons.Loader2 className="w-5 h-5 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Icons.CheckCircle className="w-5 h-5" />
                    保存模板
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
