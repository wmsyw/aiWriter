'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  updatedAt: string;
}

export default function NovelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeTab, setActiveTab] = useState<'chapters' | 'materials' | 'settings'>('chapters');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);

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
        }
        
        if (chaptersRes.ok) {
          const chaptersData = await chaptersRes.json();
          setChapters(chaptersData);
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
      }
    } catch (error) {
      console.error('Failed to update title', error);
    } finally {
      setIsEditingTitle(false);
    }
  };

  const handleCreateChapter = async () => {
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
        const newChapter = await res.json();
        setChapters([...chapters, newChapter]);
      }
    } catch (error) {
      console.error('Failed to create chapter', error);
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
        <div className="flex items-center gap-1 border-b border-white/10">
          {(['chapters', 'materials', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab 
                  ? 'border-indigo-500 text-indigo-400' 
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'chapters' ? '章节' : tab === 'materials' ? '素材' : '设置'}
            </button>
          ))}
        </div>

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
                    className="glass-card p-4 rounded-xl flex items-center gap-4 group hover:border-indigo-500/30 transition-all cursor-move"
                  >
                    <div className="text-gray-500 cursor-grab active:cursor-grabbing p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{chapter.title}</h3>
                      <p className="text-xs text-gray-500">{chapter.wordCount || 0} 字</p>
                    </div>

                    <Link
                      href={`/novels/${id}/chapters/${chapter.id}`}
                      className="opacity-0 group-hover:opacity-100 btn-secondary px-3 py-1.5 rounded-lg text-xs transition-all"
                    >
                      编辑
                    </Link>
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
          <div className="animate-slide-up py-12 text-center">
            <div className="glass-card p-8 rounded-2xl inline-block max-w-sm">
              <h3 className="text-xl font-bold text-white mb-2">素材功能即将上线</h3>
              <p className="text-gray-400">
                在这里整理你的角色、地点和情节笔记。
              </p>
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
                      defaultValue={novel.description}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <h3 className="text-lg font-bold text-red-400 mb-4">危险区域</h3>
                <button className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors">
                  删除小说
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
