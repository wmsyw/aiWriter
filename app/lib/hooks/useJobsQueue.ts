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

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) {
        return;
      }

      const payload = await res.json();
      const parsed = parseJobsListResponse(payload);
      setJobs(parsed.jobs);
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!useSse) {
      void fetchJobs();
      pollTimerRef.current = setInterval(() => {
        void fetchJobs();
      }, pollIntervalMs);

      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }

    const eventSource = new EventSource('/api/jobs/stream');
    const handleJobs = (event: Event) => {
      try {
        const messageEvent = event as MessageEvent<string>;
        const payload = JSON.parse(messageEvent.data);
        const parsed = parseJobsStreamPayload(payload);
        if (!parsed) {
          return;
        }

        setJobs((prev) =>
          parsed.isInitial ? parsed.jobs : mergeJobsById(prev, parsed.jobs)
        );
        setLoading(false);
      } catch (error) {
        console.error('SSE parse error', error);
      }
    };

    eventSource.addEventListener('jobs', handleJobs);
    eventSource.onerror = () => {
      console.warn('SSE connection failed, fallback to polling');
      eventSource.close();
      setUseSse(false);
    };

    return () => {
      eventSource.removeEventListener('jobs', handleJobs);
      eventSource.close();
    };
  }, [fetchJobs, pollIntervalMs, useSse]);

  const refreshJobs = useCallback(async () => {
    await fetchJobs();
  }, [fetchJobs]);

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
        if (!res.ok) {
          return;
        }

        const payload = await res.json();
        const updatedJob = parseJobResponse(payload);
        if (updatedJob) {
          setJobs((prev) => mergeJobsById(prev, [updatedJob]));
          return;
        }

        await fetchJobs();
      } catch (error) {
        console.error('Failed to cancel job', error);
      }
    },
    [fetchJobs]
  );

  return {
    jobs,
    loading,
    isUsingSse: useSse,
    refreshJobs,
    cancelJob,
  };
}
