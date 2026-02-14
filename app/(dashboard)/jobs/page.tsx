'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getJobStatusLabel, 
  getJobTypeLabel
} from '@/app/components/JobStatusBadge';
import { 
  Button, 
  Card, 
  CardContent, 
  Badge, 
  Skeleton 
} from '@/app/components/ui';
import { ModalFooter } from '@/app/components/ui/Modal';
import { staggerContainer, staggerItem, fadeIn } from '@/app/lib/animations';
import { useJobsQueue } from '@/app/lib/hooks/useJobsQueue';
import type { JobQueueItem, JobQueueStatus } from '@/src/shared/jobs';

export default function JobsPage() {
  const { jobs, loading, cancelJob } = useJobsQueue();
  const [filterStatus, setFilterStatus] = useState<'all' | JobQueueStatus>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<JobQueueItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const selectedJobId = selectedJob?.id;

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    const latest = jobs.find((job) => job.id === selectedJobId) || null;
    if (!latest) {
      setIsDrawerOpen(false);
      setSelectedJob(null);
      return;
    }

    setSelectedJob(latest);
  }, [jobs, selectedJobId]);

  const handleCancel = async (jobId: string, e: MouseEvent) => {
    e.stopPropagation();
    await cancelJob(jobId);
  };

  const filteredJobs = jobs.filter(job => {
    if (filterStatus !== 'all' && job.status !== filterStatus) return false;
    if (filterType !== 'all' && job.type !== filterType) return false;
    return true;
  });

  const uniqueTypes = Array.from(new Set(jobs.map(j => j.type)));

  const openDrawer = (job: JobQueueItem) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDrawerOpen]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'queued': return 'queued';
      case 'running': return 'running';
      case 'processing': return 'running';
      case 'succeeded': return 'success';
      case 'failed': return 'error';
      case 'canceled': return 'warning';
      default: return 'default';
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-var(--dashboard-topbar-height)-2rem)]">
      <motion.div 
        className="space-y-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <motion.div variants={fadeIn}>
            <h1 className="text-3xl font-bold mb-1 tracking-tight text-zinc-100">任务队列</h1>
            <p className="text-zinc-500">实时追踪后台任务执行状态</p>
          </motion.div>
          
          <motion.div variants={fadeIn} className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | JobQueueStatus)}
              className="select-menu h-9 rounded-xl px-3 text-sm bg-black/20 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">执行中</option>
              <option value="processing">处理中</option>
              <option value="succeeded">已完成</option>
              <option value="failed">失败</option>
              <option value="canceled">已取消</option>
            </select>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="select-menu h-9 rounded-xl px-3 text-sm bg-black/20 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">全部类型</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{getJobTypeLabel(type)}</option>
              ))}
            </select>
          </motion.div>
        </div>

        <motion.div 
          className="space-y-3"
          variants={staggerContainer}
        >
          <AnimatePresence mode="popLayout">
            {filteredJobs.length === 0 ? (
              <motion.div 
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-center py-12 text-zinc-500 bg-zinc-900/55 rounded-2xl border border-white/10"
              >
                没有符合筛选条件的任务
              </motion.div>
            ) : (
              filteredJobs.map((job) => (
                <motion.div
                  key={job.id}
                  variants={staggerItem}
                  layout
                >
                  <Card 
                    variant="interactive"
                    onClick={() => openDrawer(job)}
                    className="cursor-pointer group hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-xs text-zinc-300 group-hover:text-emerald-300 group-hover:border-emerald-500/30 transition-colors">
                          {job.id.substring(0, 4)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-zinc-100 truncate mb-1" style={{ color: '#f4f4f5' }}>
                            {getJobTypeLabel(job.type)}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <span>{new Date(job.createdAt).toLocaleString('zh-CN')}</span>
                            {job.updatedAt && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span>耗时 {((new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()) / 1000).toFixed(1)}s</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <Badge variant={getStatusVariant(job.status) as any} animated={job.status === 'running' || job.status === 'processing'}>
                          {getJobStatusLabel(job.status)}
                        </Badge>
                        
                        {(job.status === 'queued' || job.status === 'running' || job.status === 'processing') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleCancel(job.id, e)}
                            className="h-9 w-9 p-0 rounded-xl border border-transparent text-gray-500 hover:text-red-400 hover:bg-red-500/12 hover:border-red-500/35"
                            title="取消任务"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </Button>
                        )}
                        
                        <div className="text-gray-600 group-hover:text-gray-400">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {isDrawerOpen && selectedJob && (
          <>
            <motion.div
              key="jobs-drawer-backdrop"
              className="fixed inset-0 bg-black/70 backdrop-blur-lg z-[90]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
            />
            <motion.aside
              key={`jobs-drawer-${selectedJob.id}`}
              className="fixed top-0 right-0 bottom-0 w-full md:w-[620px] border-l border-white/10 shadow-2xl z-[100] bg-[#0d111a]/98 backdrop-blur-xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="job-drawer-title"
            >
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-500/14 via-sky-500/8 to-transparent px-6 py-4">
                  <h2 id="job-drawer-title" className="text-xl font-bold text-white">任务详情</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={closeDrawer}
                    aria-label="关闭"
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.03] p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-500 mb-2">状态</div>
                      <Badge
                        variant={getStatusVariant(selectedJob.status) as any}
                        size="lg"
                        animated={selectedJob.status === 'running' || selectedJob.status === 'processing'}
                      >
                        {getJobStatusLabel(selectedJob.status)}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1">耗时</div>
                      <span className="text-sm text-white font-mono">
                        {selectedJob.updatedAt ? (
                          `${((new Date(selectedJob.updatedAt).getTime() - new Date(selectedJob.createdAt).getTime()) / 1000).toFixed(2)}s`
                        ) : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Card className="bg-zinc-900/65 border-white/10">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-bold text-gray-300 mb-2 border-b border-white/5 pb-2">输入数据</h3>
                        <pre className="text-xs font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedJob.input, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>

                    {Boolean(selectedJob.output) && (
                      <Card className="bg-zinc-900/65 border-white/10">
                        <CardContent className="p-4">
                          <h3 className="text-sm font-bold text-green-400 mb-2 border-b border-white/5 pb-2">输出结果</h3>
                          <pre className="text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(selectedJob.output, null, 2)}
                          </pre>
                        </CardContent>
                      </Card>
                    )}

                    {Boolean(selectedJob.error) && (
                      <Card className="bg-red-500/12 border-red-500/25">
                        <CardContent className="p-4">
                          <h3 className="text-sm font-bold text-red-400 mb-2 border-b border-red-500/20 pb-2">错误信息</h3>
                          <pre className="text-xs font-mono text-red-300 overflow-x-auto whitespace-pre-wrap">
                            {selectedJob.error}
                          </pre>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                <ModalFooter className="bg-zinc-900/75 px-4 py-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={closeDrawer}
                    className="w-full min-w-0"
                  >
                    关闭
                  </Button>
                </ModalFooter>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
