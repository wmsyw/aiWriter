'use client';

import { useState } from 'react';

interface MaterialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId: string;
  onComplete: () => void;
  onSearchStarted?: (jobId: string, keyword: string) => void;
}

const SEARCH_CATEGORIES = [
  { id: '评价', label: '读者评价', icon: '💬' },
  { id: '人物', label: '人物设定', icon: '👤' },
  { id: '情节', label: '情节梗概', icon: '📖' },
  { id: '世界观', label: '世界观设定', icon: '🌍' },
  { id: '设定', label: '其他设定', icon: '⚙️' },
];

export default function MaterialSearchModal({ isOpen, onClose, novelId, onComplete, onSearchStarted }: MaterialSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['评价', '人物', '情节', '世界观']);
  const [status, setStatus] = useState<'idle' | 'searching' | 'succeeded' | 'failed'>('idle');

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSearch = async () => {
    if (!keyword.trim() || selectedCategories.length === 0) return;

    setStatus('searching');

    try {
      const res = await fetch('/api/materials/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          keyword,
          searchCategories: selectedCategories,
        }),
      });

      if (res.ok) {
        const { job } = await res.json();
        // Notify parent and close immediately
        onSearchStarted?.(job.id, keyword);
        setStatus('idle');
        onClose();
      } else {
        throw new Error('Failed to start search');
      }
    } catch (error) {
      console.error('Search failed', error);
      setStatus('failed');
      alert('搜索启动失败，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (status !== 'searching') onClose();
        }}
      />
      
      <div className="glass-card w-full max-w-2xl p-8 rounded-2xl relative z-10 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            AI 联网搜索素材
          </h2>
          <button
            onClick={onClose}
            disabled={status === 'searching'}
            className={`text-gray-400 hover:text-white ${status === 'searching' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">搜索关键词</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              placeholder="输入小说名、作品名或关键词..."
              disabled={status === 'searching'}
            />
            <p className="text-xs text-gray-500">例如：斗破苍穹、哈利波特、三体...</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">搜索内容类型</label>
            <div className="flex flex-wrap gap-2">
              {SEARCH_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  disabled={status === 'searching'}
                  className={`px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 ${
                    selectedCategories.includes(cat.id)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {status !== 'idle' && status !== 'searching' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'succeeded' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-300">
                    {status === 'succeeded' ? '搜索完成' : '搜索失败'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              onClick={onClose}
              disabled={status === 'searching'}
              className={`btn-secondary px-6 py-2.5 rounded-xl ${status === 'searching' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {status === 'succeeded' ? '完成' : '取消'}
            </button>
            {status !== 'succeeded' && (
              <button
                onClick={handleSearch}
                disabled={status === 'searching' || !keyword.trim() || selectedCategories.length === 0}
                className="btn-primary px-6 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-50"
              >
                {status === 'searching' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    搜索中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    开始搜索
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
