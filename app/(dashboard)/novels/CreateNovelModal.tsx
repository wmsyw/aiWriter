'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CreateNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateNovelModal({ isOpen, onClose }: CreateNovelModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/novels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, description }),
      });

      if (res.ok) {
        const data = await res.json();
        router.refresh();
        onClose();
      }
    } catch (error) {
      console.error('Failed to create novel', error);
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
