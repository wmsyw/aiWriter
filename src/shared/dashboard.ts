export interface DashboardNovel {
  id: string;
  title: string;
  genre: string;
  updatedAt: string;
  wordCount?: number;
  chapterCount?: number;
}

export interface DashboardStats {
  novelsCount: number;
  totalWords: number;
  totalChapters: number;
  activeJobsCount: number;
}

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function summarizeDashboardStats(
  novels: readonly DashboardNovel[],
  activeJobsCount: number
): DashboardStats {
  const totalWords = novels.reduce((sum, novel) => sum + toSafeNumber(novel.wordCount), 0);
  const totalChapters = novels.reduce((sum, novel) => sum + toSafeNumber(novel.chapterCount), 0);

  return {
    novelsCount: novels.length,
    totalWords,
    totalChapters,
    activeJobsCount: Math.max(0, toSafeNumber(activeJobsCount)),
  };
}

export function formatDashboardNumber(num: number): string {
  if (!Number.isFinite(num) || num <= 0) {
    return '0';
  }
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}万`;
  }
  return num.toLocaleString();
}

export function getGreetingByHour(hour: number): string {
  if (hour < 6) return '夜深了，注意休息';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function getDashboardGreeting(date: Date = new Date()): string {
  return getGreetingByHour(date.getHours());
}

function parseUpdatedAt(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getRecentNovels(
  novels: readonly DashboardNovel[],
  limit = 5
): DashboardNovel[] {
  const safeLimit = Math.max(1, Math.floor(limit));
  return [...novels]
    .sort((a, b) => parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt))
    .slice(0, safeLimit);
}

export function formatRelativeDate(
  value: string,
  now: Date = new Date()
): string {
  const targetMs = new Date(value).getTime();
  if (!Number.isFinite(targetMs)) return '未知时间';

  const diffMs = now.getTime() - targetMs;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return '刚刚';
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays <= 7) return `${diffDays} 天前`;
  return new Date(value).toLocaleDateString();
}
