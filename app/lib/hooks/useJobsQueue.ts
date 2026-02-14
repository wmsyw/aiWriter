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
  refreshJobs: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
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
          return;
        } catch (error) {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 220));
            continue;
          }
          console.error('Failed to fetch jobs', error);
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
  }, [fetchJobs, persistJobsCache, pollIntervalMs, useSse]);

  const refreshJobs = useCallback(async () => {
    await fetchJobs();
  }, [fetchJobs]);

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/cancel`, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) {
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
          return;
        }

        await fetchJobs();
      } catch (error) {
        console.error('Failed to cancel job', error);
      }
    },
    [fetchJobs, persistJobsCache]
  );

  return {
    jobs,
    loading,
    isUsingSse: useSse,
    refreshJobs,
    cancelJob,
  };
}
