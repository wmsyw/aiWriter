'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  JobStatusBadge, 
  getJobStatusLabel, 
  getJobStatusClassName, 
  getJobTypeLabel,
  JOB_STATUS_CONFIG 
} from '@/app/components/JobStatusBadge';

interface Job {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [useSSE, setUseSSE] = useState(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!useSSE) {
      fetchJobs();
      pollTimerRef.current = setInterval(fetchJobs, 5000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }

    const eventSource = new EventSource('/api/jobs/stream');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('jobs', (event) => {
      try {
        const messageEvent = event as MessageEvent;
        const data = JSON.parse(messageEvent.data);
        if (data.isInitial) {
          setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        } else if (data.jobs && data.jobs.length > 0) {
          setJobs(prev => {
            const updated = [...prev];
            for (const job of data.jobs) {
              const idx = updated.findIndex(j => j.id === job.id);
              if (idx >= 0) {
                updated[idx] = job;
              } else {
                updated.unshift(job);
              }
            }
            return updated;
          });
        }
        setLoading(false);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    eventSource.onerror = () => {
      console.warn('SSE connection failed, falling back to polling');
      eventSource.close();
      setUseSSE(false);
    };

    return () => {
      eventSource.close();
    };
  }, [useSSE, fetchJobs]);

  const handleCancel = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      if (res.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to cancel job', error);
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (filterStatus !== 'all' && job.status !== filterStatus) return false;
    if (filterType !== 'all' && job.type !== filterType) return false;
    return true;
  });

  const uniqueTypes = Array.from(new Set(jobs.map(j => j.type)));

  const openDrawer = (job: Job) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">任务队列</h1>
            <p className="text-gray-400">实时追踪后台任务执行状态</p>
          </div>
          
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="glass-input px-3 py-2 rounded-lg text-sm"
            >
              <option value="all" className="bg-gray-900">全部状态</option>
              <option value="queued" className="bg-gray-900">排队中</option>
              <option value="running" className="bg-gray-900">执行中</option>
              <option value="succeeded" className="bg-gray-900">已完成</option>
              <option value="failed" className="bg-gray-900">失败</option>
              <option value="canceled" className="bg-gray-900">已取消</option>
            </select>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="glass-input px-3 py-2 rounded-lg text-sm"
            >
              <option value="all" className="bg-gray-900">全部类型</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type} className="bg-gray-900">{getJobTypeLabel(type)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-gray-400 font-medium uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">任务ID</th>
                  <th className="px-6 py-4">类型</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4">创建时间</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      没有符合筛选条件的任务
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr 
                      key={job.id} 
                      onClick={() => openDrawer(job)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 font-mono text-xs text-gray-500 group-hover:text-indigo-300">
                        {job.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        {getJobTypeLabel(job.type)}
                      </td>
                      <td className="px-6 py-4">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 text-gray-400">
                        {new Date(job.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(job.status === 'queued' || job.status === 'running') && (
                          <button
                            onClick={(e) => handleCancel(job.id, e)}
                            className="text-gray-500 hover:text-red-400 transition-colors p-1"
                            title="取消任务"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-[600px] glass-card border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        aria-hidden={!isDrawerOpen}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-md">
            <h2 id="job-drawer-title" className="text-xl font-bold text-white">任务详情</h2>
            <button 
              onClick={() => setIsDrawerOpen(false)}
              aria-label="关闭"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedJob && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 mb-1">状态</div>
                  <JobStatusBadge status={selectedJob.status} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">耗时</div>
                  <span className="text-sm text-white">
                    {selectedJob.updatedAt ? (
                      `${((new Date(selectedJob.updatedAt).getTime() - new Date(selectedJob.createdAt).getTime()) / 1000).toFixed(2)}秒`
                    ) : '-'}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="glass-card bg-black/20 p-4 rounded-lg">
                  <h3 className="text-sm font-bold text-gray-300 mb-2 border-b border-white/5 pb-2">输入数据</h3>
                  <pre className="text-xs font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.input, null, 2)}
                  </pre>
                </div>

                {selectedJob.output && (
                  <div className="glass-card bg-black/20 p-4 rounded-lg">
                    <h3 className="text-sm font-bold text-green-400 mb-2 border-b border-white/5 pb-2">输出结果</h3>
                    <pre className="text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedJob.output, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedJob.error && (
                  <div className="glass-card bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
                    <h3 className="text-sm font-bold text-red-400 mb-2 border-b border-red-500/20 pb-2">错误信息</h3>
                    <pre className="text-xs font-mono text-red-300 overflow-x-auto whitespace-pre-wrap">
                      {selectedJob.error}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="p-4 border-t border-white/10 bg-white/5">
             <button
               onClick={() => setIsDrawerOpen(false)}
               className="w-full btn-secondary py-2 rounded-lg"
             >
               关闭
             </button>
          </div>
        </div>
      </div>
      
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsDrawerOpen(false)}
        ></div>
      )}
    </div>
  );
}
