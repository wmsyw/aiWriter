'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { countActiveJobs } from '@/src/shared/jobs';
import {
  getRecentNovels,
  summarizeDashboardStats,
  type DashboardNovel,
} from '@/src/shared/dashboard';
import { useJobsQueue } from './useJobsQueue';

interface DashboardApiPayload {
  novels?: DashboardNovel[];
}

function parseDashboardNovelsPayload(payload: unknown): DashboardNovel[] {
  if (!payload || typeof payload !== 'object') return [];
  const novels = (payload as DashboardApiPayload).novels;
  if (!Array.isArray(novels)) return [];

  return novels
    .filter((novel): novel is DashboardNovel => {
      return (
        !!novel &&
        typeof novel === 'object' &&
        typeof novel.id === 'string' &&
        typeof novel.title === 'string' &&
        typeof novel.updatedAt === 'string'
      );
    })
    .map((novel) => ({
      ...novel,
      genre: typeof novel.genre === 'string' && novel.genre.trim() ? novel.genre : '未分类',
      wordCount: typeof novel.wordCount === 'number' ? novel.wordCount : 0,
      chapterCount: typeof novel.chapterCount === 'number' ? novel.chapterCount : 0,
    }));
}

interface UseDashboardDataResult {
  novels: DashboardNovel[];
  recentNovels: DashboardNovel[];
  loading: boolean;
  jobsLoading: boolean;
  error: string | null;
  stats: ReturnType<typeof summarizeDashboardStats>;
  lastUpdatedAt: string | null;
  isUsingSse: boolean;
  refresh: () => Promise<void>;
}

export function useDashboardData(): UseDashboardDataResult {
  const [novels, setNovels] = useState<DashboardNovel[]>([]);
  const [novelsLoading, setNovelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const { jobs, loading: jobsLoading, isUsingSse, refreshJobs } = useJobsQueue();

  const fetchNovels = useCallback(async () => {
    setNovelsLoading(true);
    try {
      const response = await fetch('/api/novels');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const parsed = parseDashboardNovelsPayload(payload);
      setNovels(parsed);
      setError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (fetchError) {
      console.error('Failed to fetch dashboard novels', fetchError);
      setError('工作台数据加载失败，请重试');
    } finally {
      setNovelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNovels();
  }, [fetchNovels]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchNovels(), refreshJobs()]);
  }, [fetchNovels, refreshJobs]);

  const activeJobsCount = useMemo(() => countActiveJobs(jobs), [jobs]);
  const stats = useMemo(
    () => summarizeDashboardStats(novels, activeJobsCount),
    [novels, activeJobsCount]
  );
  const recentNovels = useMemo(() => getRecentNovels(novels, 5), [novels]);

  return {
    novels,
    recentNovels,
    loading: novelsLoading,
    jobsLoading,
    error,
    stats,
    lastUpdatedAt,
    isUsingSse,
    refresh,
  };
}
