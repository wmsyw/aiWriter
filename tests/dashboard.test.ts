import { describe, expect, it } from 'vitest';
import {
  formatDashboardNumber,
  formatRelativeDate,
  getGreetingByHour,
  getRecentNovels,
  summarizeDashboardStats,
  type DashboardNovel,
} from '@/src/shared/dashboard';

describe('dashboard shared helpers', () => {
  const novels: DashboardNovel[] = [
    {
      id: 'n1',
      title: '青云纪',
      genre: '玄幻',
      updatedAt: '2026-02-14T08:00:00.000Z',
      wordCount: 12000,
      chapterCount: 8,
    },
    {
      id: 'n2',
      title: '雾海边界',
      genre: '悬疑',
      updatedAt: '2026-02-14T10:30:00.000Z',
      wordCount: 6800,
      chapterCount: 5,
    },
  ];

  it('summarizes dashboard stats', () => {
    const stats = summarizeDashboardStats(novels, 3);
    expect(stats.novelsCount).toBe(2);
    expect(stats.totalWords).toBe(18800);
    expect(stats.totalChapters).toBe(13);
    expect(stats.activeJobsCount).toBe(3);
  });

  it('formats number and greeting', () => {
    expect(formatDashboardNumber(0)).toBe('0');
    expect(formatDashboardNumber(18800)).toBe('1.9万');
    expect(getGreetingByHour(5)).toBe('夜深了，注意休息');
    expect(getGreetingByHour(9)).toBe('早上好');
    expect(getGreetingByHour(14)).toBe('下午好');
    expect(getGreetingByHour(21)).toBe('晚上好');
  });

  it('sorts recent novels by updatedAt and formats relative date', () => {
    const recent = getRecentNovels(novels, 1);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe('n2');

    const now = new Date('2026-02-14T11:30:00.000Z');
    expect(formatRelativeDate('2026-02-14T11:10:00.000Z', now)).toBe('刚刚');
    expect(formatRelativeDate('2026-02-14T09:00:00.000Z', now)).toBe('2 小时前');
  });
});
