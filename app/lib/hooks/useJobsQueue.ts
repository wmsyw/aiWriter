'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JobQueueItem,
  mergeJobsById,
  parseJobResponse,
  parseJobsListResponse,
  parseJobsStreamPayload,
} from '@/src/shared/jobs';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 10000;
const SSE_BOOTSTRAP_TIMEOUT_MS = 6000;
const JOBS_CACHE_KEY = 'aiwriter.jobs.cache.v1';

interface UseJobsQueueOptions {
  pollIntervalMs?: number;
  preferSse?: boolean;
}

interface UseJobsQueueResult {
  jobs: JobQueueItem[];
  loading: boolean;
  isUsingSse: boolean;
  isUnauthorized: boolean;
  error: string | null;
  refreshJobs: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
}

function createUnauthorizedError(): Error & { status: number } {
  const error = new Error('jobs unauthorized') as Error & { status: number };
  error.status = 401;
  return error;
}

function isUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status?: unknown }).status === 401;
  }
  return false;
}

export function useJobsQueue(
  options: UseJobsQueueOptions = {}
): UseJobsQueueResult {
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    preferSse = true,
  } = options;

  const [jobs, setJobs] = useState<JobQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [useSse, setUseSse] = useState(preferSse);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseBootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReceivedSseEventRef = useRef(false);

  const persistJobsCache = useCallback((nextJobs: JobQueueItem[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(nextJobs));
    } catch (error) {
      console.warn('Failed to persist jobs cache', error);
    }
  }, []);

  const readJobsCache = useCallback((): JobQueueItem[] => {
    if (typeof window === 'undefined') return [];

    try {
      const raw = window.localStorage.getItem(JOBS_CACHE_KEY);
      if (!raw) return [];
      const payload = JSON.parse(raw);
      return parseJobsListResponse(payload).jobs;
    } catch (error) {
      console.warn('Failed to read jobs cache', error);
      return [];
    }
  }, []);

  useEffect(() => {
    const cachedJobs = readJobsCache();
    if (cachedJobs.length > 0) {
      setJobs(cachedJobs);
      setLoading(false);
    }
  }, [readJobsCache]);

  const fetchJobsOnce = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch('/api/jobs', {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw createUnauthorizedError();
        }
        throw new Error(`jobs fetch failed (${res.status})`);
      }

      const payload = await res.json().catch(() => null);
      return parseJobsListResponse(payload).jobs;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const nextJobs = await fetchJobsOnce();
          setJobs(nextJobs);
          persistJobsCache(nextJobs);
          setIsUnauthorized(false);
          setError(null);
          return;
        } catch (error) {
          if (isUnauthorizedError(error)) {
            setIsUnauthorized(true);
            setUseSse(false);
            setError('登录状态已失效，请重新登录');
            return;
          }
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 220));
            continue;
          }
          console.error('Failed to fetch jobs', error);
          setError('任务数据加载失败，请稍后重试');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [fetchJobsOnce, persistJobsCache]);

  useEffect(() => {
    const clearPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const clearSseBootstrapTimer = () => {
      if (sseBootstrapTimerRef.current) {
        clearTimeout(sseBootstrapTimerRef.current);
        sseBootstrapTimerRef.current = null;
      }
    };

    if (isUnauthorized) {
      clearSseBootstrapTimer();
      clearPolling();
      return () => {
        clearSseBootstrapTimer();
        clearPolling();
      };
    }

    if (!useSse) {
      void fetchJobs();
      clearPolling();
      pollTimerRef.current = setInterval(() => {
        void fetchJobs();
      }, pollIntervalMs);

      return () => {
        clearPolling();
      };
    }

    hasReceivedSseEventRef.current = false;
    clearSseBootstrapTimer();
    clearPolling();

    void fetchJobs();
    const eventSource = new EventSource('/api/jobs/stream');

    sseBootstrapTimerRef.current = setTimeout(() => {
      if (hasReceivedSseEventRef.current) {
        return;
      }

      console.warn('SSE bootstrap timed out, fallback to polling');
      eventSource.close();
      setUseSse(false);
      setLoading(false);
    }, SSE_BOOTSTRAP_TIMEOUT_MS);

    const handleJobs = (event: Event) => {
      try {
        const messageEvent = event as MessageEvent<string>;
        const payload = JSON.parse(messageEvent.data);
        const parsed = parseJobsStreamPayload(payload);
        if (!parsed) {
          return;
        }

        hasReceivedSseEventRef.current = true;
        clearSseBootstrapTimer();

        setJobs((prev) => {
          const merged = parsed.isInitial ? parsed.jobs : mergeJobsById(prev, parsed.jobs);
          persistJobsCache(merged);
          return merged;
        });
        setLoading(false);
        setError(null);
      } catch (error) {
        console.error('SSE parse error', error);
      }
    };

    eventSource.addEventListener('jobs', handleJobs);
    eventSource.onerror = () => {
      console.warn('SSE connection failed, fallback to polling');
      clearSseBootstrapTimer();
      eventSource.close();
      setUseSse(false);
      setLoading(false);
    };

    return () => {
      clearSseBootstrapTimer();
      eventSource.removeEventListener('jobs', handleJobs);
      eventSource.close();
    };
  }, [fetchJobs, isUnauthorized, persistJobsCache, pollIntervalMs, useSse]);

  const refreshJobs = useCallback(async () => {
    if (isUnauthorized) {
      return;
    }
    await fetchJobs();
  }, [fetchJobs, isUnauthorized]);

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/cancel`, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 401) {
            setIsUnauthorized(true);
            setError('登录状态已失效，请重新登录');
          }
          return;
        }

        const payload = await res.json();
        const updatedJob = parseJobResponse(payload);
        if (updatedJob) {
          setJobs((prev) => {
            const merged = mergeJobsById(prev, [updatedJob]);
            persistJobsCache(merged);
            return merged;
          });
          setError(null);
          return;
        }

        await fetchJobs();
      } catch (error) {
        console.error('Failed to cancel job', error);
        setError('取消任务失败，请稍后重试');
      }
    },
    [fetchJobs, persistJobsCache]
  );

  return {
    jobs,
    loading,
    isUsingSse: useSse,
    isUnauthorized,
    error,
    refreshJobs,
    cancelJob,
  };
}
