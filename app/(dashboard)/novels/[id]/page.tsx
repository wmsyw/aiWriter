'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import OutlineGeneratorModal from './OutlineGeneratorModal';

interface Chapter {
  id: string;
  title: string;
  wordCount: number;
  updatedAt: string;
  order: number;
}

interface Novel {
  id: string;
  title: string;
  description?: string;
  type?: 'short' | 'long';
  outline?: string;
  updatedAt: string;
}

export default function NovelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'outline' | 'materials' | 'settings'>('chapters');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedOutline, setEditedOutline] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOutlineGenerator, setShowOutlineGenerator] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [novelRes, chaptersRes] = await Promise.all([
          fetch(`/api/novels/${id}`),
          fetch(`/api/novels/${id}/chapters`)
        ]);

        if (novelRes.ok) {
          const novelData = await novelRes.json();
          setNovel(novelData);
          setEditedTitle(novelData.title);
          setEditedDescription(novelData.description || '');
          setEditedOutline(novelData.outline || '');
        }
        
        if (chaptersRes.ok) {
          const chaptersData = await chaptersRes.json();
          setChapters(chaptersData.chapters || []);
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
    } finally {
      setIsEditingTitle(false);
    }
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
    if (!confirm('确定要删除此章节吗？此操作不可撤销。')) return;
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
        const data = await res.json();
        setChapters([...chapters, data.chapter]);
      } else {
        setError('创建章节失败');
      }
    } catch {
      setError('创建章节失败，请重试');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">未找到小说</h1>
        <Link href="/novels" className="btn-secondary px-6 py-2 rounded-xl">
          返回小说列表
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/90 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-up">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:bg-white/20 rounded p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <Link 
          href="/novels" 
          className="text-gray-400 hover:text-white flex items-center gap-2 w-fit transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回小说列表
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex-1 mr-8">
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                className="text-4xl font-bold bg-white/5 border border-indigo-500/50 rounded-lg px-2 py-1 w-full outline-none text-white"
                autoFocus
              />
            ) : (
              <h1 
                onClick={() => setIsEditingTitle(true)}
                className="text-4xl font-bold text-white cursor-pointer hover:bg-white/5 rounded-lg px-2 py-1 -ml-2 transition-colors border border-transparent hover:border-white/10"
              >
                {novel.title}
              </h1>
            )}
            <p className="text-gray-400 mt-2 px-2">
              最后更新于 {new Date(novel.updatedAt).toLocaleDateString()}
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="btn-secondary px-4 py-2 rounded-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出
            </button>
            
            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-48 glass-card rounded-xl overflow-hidden z-20 animate-fade-in">
                <button className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors">
                  导出为 .txt
                </button>
                <button className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors">
                  导出为 .md
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-1">
          {(novel?.type === 'long' 
            ? ['chapters', 'outline', 'materials', 'settings'] as const
            : ['chapters', 'materials', 'settings'] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium rounded-t-xl transition-all relative ${
                activeTab === tab 
                  ? 'text-white bg-white/5 border-b-2 border-indigo-500' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-b-2 border-transparent'
              }`}
            >
              {tab === 'chapters' && <span className="mr-2">📚</span>}
              {tab === 'outline' && <span className="mr-2">🗺️</span>}
              {tab === 'materials' && <span className="mr-2">📦</span>}
              {tab === 'settings' && <span className="mr-2">⚙️</span>}
              {tab === 'chapters' ? '章节列表' : tab === 'outline' ? '大纲规划' : tab === 'materials' ? '素材管理' : '高级设置'}
            </button>
          ))}
        </div>

        {activeTab === 'outline' && novel?.type === 'long' && (
          <div className="animate-slide-up max-w-4xl">
            <div className="glass-card p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">小说大纲</h3>
                <div className="flex items-center gap-2">
                  {!novel.outline && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-lg">
                      需要先创建大纲才能添加章节
                    </span>
                  )}
                  <button
                    onClick={() => setShowOutlineGenerator(true)}
                    className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI 生成大纲
                  </button>
                </div>
              </div>
              <textarea
                className="glass-input w-full px-4 py-3 rounded-xl h-96 resize-none"
                placeholder="在这里编写你的小说大纲...&#10;&#10;建议包含：&#10;- 故事主线&#10;- 主要角色&#10;- 章节规划&#10;- 关键情节点"
                value={editedOutline}
                onChange={(e) => setEditedOutline(e.target.value)}
                onBlur={handleUpdateOutline}
              />
            </div>
          </div>
        )}

        {activeTab === 'chapters' && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">章节</h2>
              <button
                onClick={handleCreateChapter}
                className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加章节
              </button>
            </div>

            {chapters.length > 0 ? (
              <div className="space-y-3">
                {chapters.map((chapter) => (
                  <div 
                    key={chapter.id}
                    className="glass-card p-4 rounded-xl flex items-center gap-4 group hover:border-indigo-500/30 transition-all duration-300 hover:translate-x-1"
                  >
                    <div className="text-gray-600 cursor-move p-2 hover:bg-white/5 rounded-lg transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 mb-1">
                        <h3 className="text-white font-medium truncate text-lg group-hover:text-indigo-400 transition-colors">
                          {chapter.title}
                        </h3>
                        <span className="text-xs text-gray-500 font-mono">
                          {new Date(chapter.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className={`text-xs px-2 py-0.5 rounded-full border ${
                           (chapter.wordCount || 0) > 2000 
                             ? 'border-green-500/30 text-green-400 bg-green-500/10'
                             : 'border-gray-700 text-gray-500 bg-gray-800/50'
                         }`}>
                           {chapter.wordCount || 0} 字
                         </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                      <Link
                        href={`/novels/${id}/chapters/${chapter.id}`}
                        className="p-2 hover:bg-indigo-500/20 rounded-lg text-gray-400 hover:text-indigo-400 transition-colors"
                        title="编辑章节"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => handleDeleteChapter(chapter.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                        title="删除章节"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
                <p className="text-gray-400 mb-4">暂无章节</p>
                <button
                  onClick={handleCreateChapter}
                  className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                >
                  创建你的第一章
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">素材库</h2>
              <Link
                href={`/novels/${id}/materials`}
                className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                打开素材库
              </Link>
            </div>
            <div className="glass-card p-8 rounded-2xl text-center">
              <div className="w-16 h-16 mx-auto bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">管理你的创作素材</h3>
              <p className="text-gray-400 mb-6">
                在素材库中整理角色、地点、情节要点和世界观设定。
              </p>
              <Link
                href={`/novels/${id}/materials`}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
              >
                进入素材库 →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-slide-up max-w-2xl">
            <div className="glass-card p-6 rounded-2xl space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-4">常规设置</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">标题</label>
                    <input 
                      type="text" 
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="glass-input w-full px-4 py-2 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">简介</label>
                    <textarea 
                      className="glass-input w-full px-4 py-2 rounded-xl h-32 resize-none"
                      placeholder="添加简介..."
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      onBlur={handleUpdateDescription}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <h3 className="text-lg font-bold text-red-400 mb-4">危险区域</h3>
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
                >
                  删除小说
                </button>
              </div>

              {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="glass-card p-6 rounded-2xl max-w-md w-full mx-4 space-y-4">
                    <h3 className="text-lg font-bold text-white">确认删除</h3>
                    <p className="text-gray-400">确定要删除《{novel.title}》吗？此操作不可撤销，所有章节和素材都将被永久删除。</p>
                    <div className="flex gap-3 justify-end">
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                      >
                        取消
                      </button>
                      <button 
                        onClick={handleDeleteNovel}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <OutlineGeneratorModal
        isOpen={showOutlineGenerator}
        onClose={() => setShowOutlineGenerator(false)}
        novelId={id}
        onGenerated={(outline) => {
          setEditedOutline(outline);
          handleUpdateOutline();
        }}
      />

    </div>
  );
}
