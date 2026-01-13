'use client';

import { useState, useEffect, useRef } from 'react';

interface MaterialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId: string;
  onComplete: () => void;
}

const SEARCH_CATEGORIES = [
  { id: '评价', label: '读者评价', icon: '💬' },
  { id: '人物', label: '人物设定', icon: '👤' },
  { id: '情节', label: '情节梗概', icon: '📖' },
  { id: '世界观', label: '世界观设定', icon: '🌍' },
  { id: '设定', label: '其他设定', icon: '⚙️' },
];

export default function MaterialSearchModal({ isOpen, onClose, novelId, onComplete }: MaterialSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['评价', '人物', '情节', '世界观']);
  const [status, setStatus] = useState<'idle' | 'searching' | 'succeeded' | 'failed'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const MAX_POLL_TIME = 3 * 60 * 1000;

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSearch = async () => {
    if (!keyword.trim() || selectedCategories.length === 0) return;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setJobId(null);
    setStatus('searching');
    setLogs([`开始搜索: ${keyword}`]);

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
        setJobId(job.id);
        setLogs(prev => [...prev, `任务已创建: ${job.id.slice(0, 8)}`]);
        pollJob(job.id);
      } else {
        throw new Error('Failed to start search');
      }
    } catch (error) {
      console.error('Search failed', error);
      setStatus('failed');
      setLogs(prev => [...prev, '搜索启动失败']);
    }
  };

  const pollJob = (id: string) => {
    startTimeRef.current = Date.now();
    let retryCount = 0;

    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setStatus('failed');
        setLogs(prev => [...prev, '搜索超时']);
        return;
      }

      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.ok) {
          const { job } = await res.json();
          retryCount = 0;
          
          if (job.status === 'succeeded') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('succeeded');
            setLogs(prev => [...prev, '搜索完成，素材已保存']);
            onComplete();
          } else if (job.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('failed');
            setLogs(prev => [...prev, '搜索失败']);
          } else if (job.status === 'running') {
            setLogs(prev => {
              if (!prev.includes('正在联网搜索...')) {
                return [...prev, '正在联网搜索...'];
              }
              return prev;
            });
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (error) {
        console.error('Polling failed', error);
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        if (retryCount >= 3) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setStatus('failed');
          setLogs(prev => [...prev, `连接失败: ${errorMessage}`]);
        }
      }
    }, 2000);
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
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {status !== 'idle' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'searching' ? 'bg-yellow-400 animate-pulse' :
                    status === 'succeeded' ? 'bg-green-400' :
                    'bg-red-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-300">
                    {status === 'searching' ? '正在搜索...' :
                     status === 'succeeded' ? '搜索完成' : '搜索失败'}
                  </span>
                </div>
                {jobId && <span className="text-xs text-gray-500">Job: {jobId.slice(0, 8)}</span>}
              </div>

              <div className="h-32 bg-black/30 rounded-xl p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-gray-400 border border-white/5">
                {logs.map((log, i) => (
                  <div key={i} className="mb-1 last:mb-0">
                    <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                    {log}
                  </div>
                ))}
                {status === 'searching' && <div className="animate-pulse">_</div>}
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
