'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CreateNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type NovelType = 'short' | 'long';

export default function CreateNovelModal({ isOpen, onClose }: CreateNovelModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [novelType, setNovelType] = useState<NovelType>('short');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        title: title.trim(),
        type: novelType,
      });
      if (description.trim()) {
        params.set('description', description.trim());
      }
      router.push(`/novels/create?${params.toString()}`);
      onClose();
    } catch (error) {
      console.error('Failed to start wizard', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      <div className="glass-card w-full max-w-md p-8 rounded-2xl relative z-10 animate-slide-up">
        <h2 className="text-2xl font-bold mb-6 text-gradient">创建新小说</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium text-gray-300">
              标题
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="输入小说标题..."
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              小说类型
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setNovelType('short')}
                className={`relative group p-4 rounded-xl border transition-all duration-300 text-left overflow-hidden ${
                  novelType === 'short'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className={`absolute top-0 right-0 p-2 opacity-0 transition-opacity duration-300 ${novelType === 'short' ? 'opacity-100' : ''}`}>
                  <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div className="mb-3 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="font-bold text-white mb-1">短篇小说</div>
                <div className="text-xs text-gray-400 leading-relaxed">适合短篇故事、随笔，无复杂分卷结构</div>
              </button>

              <button
                type="button"
                onClick={() => setNovelType('long')}
                className={`relative group p-4 rounded-xl border transition-all duration-300 text-left overflow-hidden ${
                  novelType === 'long'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className={`absolute top-0 right-0 p-2 opacity-0 transition-opacity duration-300 ${novelType === 'long' ? 'opacity-100' : ''}`}>
                  <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div className="mb-3 w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="font-bold text-white mb-1">长篇连载</div>
                <div className="text-xs text-gray-400 leading-relaxed">支持分卷管理、大纲生成、世界观设定</div>
              </button>
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-300">
              简介 <span className="text-gray-500 font-normal">(可选)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[100px] resize-none"
              placeholder="你的故事是关于什么的？"
            />
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  创建中...
                </>
              ) : (
                '创建小说'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
