'use client';

import { useState, useEffect, useRef } from 'react';

interface Novel {
  id: string;
  title: string;
}

interface MaterialSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  novels: Novel[];
  onComplete: () => void;
}

const SEARCH_CATEGORIES = [
  { id: '评价', label: '读者评价', icon: '💬', description: '搜索读者反馈和书评' },
  { id: '人物', label: '人物设定', icon: '👤', description: '角色背景、性格、能力' },
  { id: '情节', label: '情节梗概', icon: '📖', description: '剧情线索、高潮桥段' },
  { id: '世界观', label: '世界观设定', icon: '🌍', description: '力量体系、地理、历史' },
  { id: '设定', label: '其他设定', icon: '⚙️', description: '道具、组织、势力等' },
];

const MATERIAL_TYPES = [
  { id: 'all', label: '全部类型' },
  { id: 'character', label: '角色' },
  { id: 'location', label: '地点' },
  { id: 'plotPoint', label: '情节点' },
  { id: 'worldbuilding', label: '世界观' },
  { id: 'custom', label: '自定义' },
];

interface LogEntry {
  message: string;
  timestamp: string;
}

export default function MaterialSearchModal({ isOpen, onClose, novels, onComplete }: MaterialSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [selectedNovelId, setSelectedNovelId] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['评价', '人物', '情节', '世界观']);
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>('all');
  const [status, setStatus] = useState<'idle' | 'searching' | 'succeeded' | 'failed'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const MAX_POLL_TIME = 3 * 60 * 1000;

  useEffect(() => {
    if (isOpen && novels.length > 0 && !selectedNovelId) {
      setSelectedNovelId(novels[0].id);
    }
  }, [isOpen, novels]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, { message, timestamp: new Date().toLocaleTimeString() }]);
  };

  const resetState = () => {
    setStatus('idle');
    setJobId(null);
    setLogs([]);
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSearch = async () => {
    if (!keyword.trim() || selectedCategories.length === 0 || !selectedNovelId) return;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setJobId(null);
    setStatus('searching');
    setLogs([{ message: `开始搜索: ${keyword}`, timestamp: new Date().toLocaleTimeString() }]);

    try {
      const res = await fetch('/api/materials/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: selectedNovelId,
          keyword,
          searchCategories: selectedCategories,
          materialTypeFilter: materialTypeFilter !== 'all' ? materialTypeFilter : undefined,
        }),
      });

      if (res.ok) {
        const { job } = await res.json();
        setJobId(job.id);
        addLog(`任务已创建: ${job.id.slice(0, 8)}`);
        pollJob(job.id);
      } else {
        throw new Error('Failed to start search');
      }
    } catch (error) {
      console.error('Search failed', error);
      setStatus('failed');
      addLog('搜索启动失败');
    }
  };

  const pollJob = (id: string) => {
    startTimeRef.current = Date.now();
    let retryCount = 0;

    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setStatus('failed');
        addLog('搜索超时');
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
            const count = job.output?.materialsCreated || 0;
            addLog(`搜索完成，已创建 ${count} 条素材`);
            onComplete();
          } else if (job.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('failed');
            addLog(`搜索失败: ${job.error || '未知错误'}`);
          } else if (job.status === 'running') {
            setLogs(prev => {
              const hasRunningLog = prev.some(log => log.message === '正在联网搜索...');
              if (!hasRunningLog) {
                return [...prev, { message: '正在联网搜索...', timestamp: new Date().toLocaleTimeString() }];
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
          addLog(`连接失败: ${errorMessage}`);
        }
      }
    }, 2000);
  };

  const handleClose = () => {
    if (status !== 'searching') {
      resetState();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="glass-card w-full max-w-3xl p-8 rounded-2xl relative z-10 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            AI 联网搜索素材
          </h2>
          <button
            onClick={handleClose}
            disabled={status === 'searching'}
            className={`p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all ${status === 'searching' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              保存到小说
            </label>
            <select
              value={selectedNovelId}
              onChange={(e) => setSelectedNovelId(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              disabled={status === 'searching'}
            >
              {novels.length === 0 ? (
                <option value="">请先创建一本小说</option>
              ) : (
                novels.map(novel => (
                  <option key={novel.id} value={novel.id}>{novel.title}</option>
                ))
              )}
            </select>
          </div>

          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              搜索关键词
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              placeholder="输入作品名、角色名或关键词..."
              disabled={status === 'searching'}
            />
            <p className="text-xs text-gray-500">例如：斗破苍穹、萧炎、异火、迦南学院...</p>
          </div>

          
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-300">搜索内容类型</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SEARCH_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  disabled={status === 'searching'}
                  className={`p-3 rounded-xl text-left transition-all border ${
                    selectedCategories.includes(cat.id)
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                      : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="font-medium text-sm">{cat.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1">{cat.description}</p>
                </button>
              ))}
            </div>
          </div>

          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">素材类型筛选</label>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setMaterialTypeFilter(type.id)}
                  disabled={status === 'searching'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    materialTypeFilter === type.id
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          
          {status !== 'idle' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    status === 'searching' ? 'bg-yellow-400 animate-pulse' :
                    status === 'succeeded' ? 'bg-green-400' :
                    'bg-red-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-300">
                    {status === 'searching' ? '正在搜索...' :
                     status === 'succeeded' ? '搜索完成' : '搜索失败'}
                  </span>
                </div>
                {jobId && <span className="text-xs text-gray-500 font-mono">Job: {jobId.slice(0, 8)}</span>}
              </div>

              <div className="h-32 bg-black/30 rounded-xl p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-gray-400 border border-white/5">
                {logs.map((log, i) => (
                  <div key={i} className="mb-1 last:mb-0 flex gap-2">
                    <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                    <span className={log.message.includes('失败') || log.message.includes('超时') ? 'text-red-400' : log.message.includes('完成') ? 'text-green-400' : ''}>{log.message}</span>
                  </div>
                ))}
                {status === 'searching' && <div className="animate-pulse text-indigo-400">_</div>}
              </div>
            </div>
          )}

          
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              onClick={handleClose}
              disabled={status === 'searching'}
              className={`btn-secondary px-6 py-2.5 rounded-xl ${status === 'searching' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {status === 'succeeded' ? '完成' : '取消'}
            </button>
            {status !== 'succeeded' && (
              <button
                onClick={handleSearch}
                disabled={status === 'searching' || !keyword.trim() || selectedCategories.length === 0 || !selectedNovelId}
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
