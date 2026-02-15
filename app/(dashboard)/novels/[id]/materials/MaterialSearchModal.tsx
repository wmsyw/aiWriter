'use client';

import { useState } from 'react';
import Modal, { ModalFooter } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { SearchInput } from '@/app/components/ui/SearchInput';
import { useToast } from '@/app/components/ui/Toast';
import { parseJobResponse } from '@/src/shared/jobs';
import {
  DEFAULT_MATERIAL_SEARCH_CATEGORIES,
  MATERIAL_SEARCH_CATEGORIES,
  type MaterialSearchCategory,
} from '@/src/shared/material-search';

interface MaterialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId: string;
  onComplete: () => void;
  onSearchStarted?: (jobId: string, keyword: string) => void;
}

export default function MaterialSearchModal({ isOpen, onClose, novelId, onComplete, onSearchStarted }: MaterialSearchModalProps) {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<MaterialSearchCategory[]>([...DEFAULT_MATERIAL_SEARCH_CATEGORIES]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'succeeded' | 'failed'>('idle');

  const toggleCategory = (id: MaterialSearchCategory) => {
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
        const payload = await res.json();
        const job = parseJobResponse(payload);
        if (!job) {
          throw new Error('任务创建失败：返回数据异常');
        }
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
      toast({
        variant: 'error',
        title: '搜索启动失败',
        description: '请稍后重试',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI 联网搜索素材"
      size="2xl"
      closeOnBackdrop={status !== 'searching'}
      closeOnEscape={status !== 'searching'}
      showCloseButton={status !== 'searching'}
    >
      <div className="space-y-6">
        <SearchInput
          label="搜索关键词"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onClear={() => setKeyword('')}
          className="px-4 py-3 rounded-xl"
          helperText="例如：斗破苍穹、哈利波特、三体..."
          placeholder="输入小说名、作品名或关键词..."
          disabled={status === 'searching'}
        />

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">搜索内容类型</label>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_SEARCH_CATEGORIES.map(cat => (
                <Button
                  key={cat.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleCategory(cat.id)}
                  disabled={status === 'searching'}
                  className={`h-9 rounded-xl border px-3 text-sm transition-all ${
                    selectedCategories.includes(cat.id)
                      ? 'border-emerald-500/35 bg-emerald-500/20 text-white hover:bg-emerald-500/24'
                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </Button>
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

          <ModalFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={status === 'searching'}
            >
              {status === 'succeeded' ? '完成' : '取消'}
            </Button>
            {status !== 'succeeded' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSearch}
                disabled={status === 'searching' || !keyword.trim() || selectedCategories.length === 0}
                isLoading={status === 'searching'}
                loadingText="搜索中..."
                className="px-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                开始搜索
              </Button>
            )}
          </ModalFooter>
      </div>
    </Modal>
  );
}
