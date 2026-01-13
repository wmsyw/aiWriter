'use client';

import { useState, useEffect, useRef } from 'react';
import { BUILT_IN_AGENTS } from '@/src/constants/agents';

interface WorkflowExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string | null;
  chapterId: string;
}

interface Job {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
}

interface WorkflowStep {
  id: string;
  agentKey: string;
  order: number;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export default function WorkflowExecutionModal({ isOpen, onClose, workflowId, chapterId }: WorkflowExecutionModalProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'succeeded' | 'failed'>('idle');
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    if (isOpen && workflowId) {
      fetchWorkflow();
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, workflowId]);

  const fetchWorkflow = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflow(data.workflow);
        startExecution(data.workflow);
      }
    } catch (error) {
      console.error('Failed to fetch workflow', error);
      setLogs(prev => [...prev, '获取工作流失败']);
      setStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  const startExecution = async (wf: Workflow) => {
    setLogs(prev => [...prev, `开始执行工作流: ${wf.name}`]);
    setStatus('running');
    setCurrentStepIndex(0);

    try {
      const res = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: wf.id, chapterId }),
      });

      if (res.ok) {
        const { job } = await res.json();
        setJobId(job.id);
        pollJob(job.id, wf);
      } else {
        throw new Error('Failed to start workflow execution');
      }
    } catch (error) {
      console.error('Execution failed', error);
      setLogs(prev => [...prev, '启动执行失败']);
      setStatus('failed');
    }
  };

  const pollJob = (id: string, wf: Workflow) => {
    startTimeRef.current = Date.now();
    let retryCount = 0;
    const MAX_RETRIES = 3;

    pollIntervalRef.current = setInterval(async () => {
      // Timeout check
      if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setStatus('failed');
        setLogs(prev => [...prev, '执行超时']);
        return;
      }

      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.ok) {
          const { job } = await res.json();
          retryCount = 0; // Reset retry on success
          
          if (job.status === 'succeeded') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('succeeded');
            setCurrentStepIndex(wf.steps.length);
            setLogs(prev => [...prev, '工作流执行完成']);
          } else if (job.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('failed');
            setLogs(prev => [...prev, '工作流执行失败']);
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (error) {
        console.error('Polling failed', error);
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setStatus('failed');
          setLogs(prev => [...prev, '连接失败，停止轮询']);
        }
      }
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="glass-card w-full max-w-2xl p-8 rounded-2xl relative z-10 animate-slide-up flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            {workflow?.name || '工作流执行中...'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading && !workflow ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-6">
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  status === 'running' ? 'bg-yellow-400 animate-pulse' :
                  status === 'succeeded' ? 'bg-green-400' :
                  status === 'failed' ? 'bg-red-400' : 'bg-gray-400'
                }`} />
                <span className="text-sm font-medium text-gray-300">
                  {status === 'running' ? '正在执行...' :
                   status === 'succeeded' ? '执行完成' :
                   status === 'failed' ? '执行失败' : '准备中'}
                </span>
              </div>
              <span className="text-xs text-gray-500">Job ID: {jobId?.slice(0, 8)}</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
              <div className="relative pl-6 border-l border-white/10 space-y-8">
                {workflow?.steps.map((step, idx) => {
                  const isCompleted = status === 'succeeded' || idx < currentStepIndex;
                  const isCurrent = status === 'running' && idx === currentStepIndex;
                  const isPending = idx > currentStepIndex && status !== 'succeeded';

                  return (
                    <div key={step.id} className={`relative transition-all duration-500 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
                      <div className={`absolute -left-[29px] top-0 w-4 h-4 rounded-full border-2 transition-all duration-500 ${
                        isCompleted ? 'bg-green-500 border-green-500' :
                        isCurrent ? 'bg-indigo-500 border-indigo-500 animate-pulse' :
                        'bg-[#0f1117] border-gray-600'
                      }`}>
                        {isCompleted && (
                          <svg className="w-2.5 h-2.5 text-black absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      
                      <div className={`glass-card p-4 rounded-xl border transition-all duration-300 ${
                        isCurrent ? 'border-indigo-500/50 bg-indigo-500/5 translate-x-2' : 'border-white/5'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-white">{BUILT_IN_AGENTS[step.agentKey]?.name || step.agentKey}</h4>
                          <span className="text-xs text-gray-500">步骤 {idx + 1}</span>
                        </div>
                        <p className="text-sm text-gray-400">{BUILT_IN_AGENTS[step.agentKey]?.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-32 bg-black/30 rounded-xl p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-gray-400 border border-white/5">
              {logs.map((log, i) => (
                <div key={i} className="mb-1 last:mb-0">
                  <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              ))}
              {status === 'running' && (
                <div className="animate-pulse">_</div>
              )}
            </div>
          </div>
        )}
        
        {status === 'succeeded' && (
          <div className="mt-6 flex justify-end">
            <button onClick={onClose} className="btn-primary px-6 py-2 rounded-xl">
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
