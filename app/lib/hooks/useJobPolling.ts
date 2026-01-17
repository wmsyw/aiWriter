'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type JobStatus = 'idle' | 'running' | 'completed' | 'failed';

interface UseJobPollingOptions {
  initialInterval?: number;
  maxInterval?: number;
  backoffMultiplier?: number;
  maxAttempts?: number;
}

interface UseJobPollingResult<T> {
  data: T | null;
  status: JobStatus;
  error: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

export function useJobPolling<T = unknown>(
  options: UseJobPollingOptions = {}
): UseJobPollingResult<T> {
  const {
    initialInterval = 1000,
    maxInterval = 8000,
    backoffMultiplier = 1.5,
    maxAttempts = 120,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const jobIdRef = useRef<string | null>(null);
  const shouldPollRef = useRef(false);
  const attemptRef = useRef(0);
  const intervalRef = useRef(initialInterval);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    shouldPollRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!shouldPollRef.current || !jobIdRef.current) return;

    attemptRef.current += 1;

    try {
      const res = await fetch(`/api/jobs/${jobIdRef.current}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      const job = result.job;

      if (job.status === 'succeeded') {
        setData(job.output as T);
        setStatus('completed');
        cleanup();
        return;
      }

      if (job.status === 'failed') {
        setError(job.error || '任务执行失败');
        setStatus('failed');
        cleanup();
        return;
      }

      if (attemptRef.current >= maxAttempts) {
        setError('轮询超时，请稍后重试');
        setStatus('failed');
        cleanup();
        return;
      }

      intervalRef.current = Math.min(
        intervalRef.current * backoffMultiplier,
        maxInterval
      );
      timeoutRef.current = setTimeout(poll, intervalRef.current);
    } catch (err) {
      intervalRef.current = Math.min(
        intervalRef.current * 2,
        maxInterval
      );
      
      if (attemptRef.current >= maxAttempts) {
        setError('网络错误，请检查连接');
        setStatus('failed');
        cleanup();
        return;
      }

      timeoutRef.current = setTimeout(poll, intervalRef.current);
    }
  }, [cleanup, maxAttempts, maxInterval, backoffMultiplier]);

  const startPolling = useCallback((jobId: string) => {
    cleanup();
    
    jobIdRef.current = jobId;
    shouldPollRef.current = true;
    attemptRef.current = 0;
    intervalRef.current = initialInterval;
    
    setData(null);
    setError(null);
    setStatus('running');
    
    poll();
  }, [cleanup, initialInterval, poll]);

  const stopPolling = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { data, status, error, startPolling, stopPolling };
}
