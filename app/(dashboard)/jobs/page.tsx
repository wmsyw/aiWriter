'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setJobs(Array.isArray(data) ? data : []);
        setLoading(false);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'running': return 'text-blue-400 bg-blue-400/10 border-blue-400/20 animate-pulse';
      case 'succeeded': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'canceled': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
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
            <h1 className="text-3xl font-bold text-white mb-2">Jobs Monitor</h1>
            <p className="text-gray-400">Track real-time status of your background tasks.</p>
          </div>
          
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="glass-input px-3 py-2 rounded-lg text-sm"
            >
              <option value="all" className="bg-gray-900">All Statuses</option>
              <option value="queued" className="bg-gray-900">Queued</option>
              <option value="running" className="bg-gray-900">Running</option>
              <option value="succeeded" className="bg-gray-900">Succeeded</option>
              <option value="failed" className="bg-gray-900">Failed</option>
              <option value="canceled" className="bg-gray-900">Canceled</option>
            </select>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="glass-input px-3 py-2 rounded-lg text-sm"
            >
              <option value="all" className="bg-gray-900">All Types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type} className="bg-gray-900">{type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-gray-400 font-medium uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Job ID</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No jobs found matching your filters.
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
                        {job.type}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(job.status === 'queued' || job.status === 'running') && (
                          <button
                            onClick={(e) => handleCancel(job.id, e)}
                            className="text-gray-500 hover:text-red-400 transition-colors p-1"
                            title="Cancel Job"
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
            <h2 id="job-drawer-title" className="text-xl font-bold text-white">Job Details</h2>
            <button 
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Close drawer"
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
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">Duration</div>
                  <span className="text-sm text-white">
                    {selectedJob.updatedAt ? (
                      `${((new Date(selectedJob.updatedAt).getTime() - new Date(selectedJob.createdAt).getTime()) / 1000).toFixed(2)}s`
                    ) : '-'}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="glass-card bg-black/20 p-4 rounded-lg">
                  <h3 className="text-sm font-bold text-gray-300 mb-2 border-b border-white/5 pb-2">Input Data</h3>
                  <pre className="text-xs font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.input, null, 2)}
                  </pre>
                </div>

                {selectedJob.output && (
                  <div className="glass-card bg-black/20 p-4 rounded-lg">
                    <h3 className="text-sm font-bold text-green-400 mb-2 border-b border-white/5 pb-2">Output</h3>
                    <pre className="text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedJob.output, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedJob.error && (
                  <div className="glass-card bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
                    <h3 className="text-sm font-bold text-red-400 mb-2 border-b border-red-500/20 pb-2">Error</h3>
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
               Close
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
