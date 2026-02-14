import { describe, expect, it } from 'vitest';
import {
  buildNovelsLibraryStats,
  filterAndSortNovels,
  getNovelChapterCount,
  getNovelSearchText,
} from '@/src/shared/novels-library';

describe('novels library shared helpers', () => {
  const novels = [
    {
      id: 'n1',
      title: '长夜城',
      description: '悬疑都市故事',
      genre: '悬疑',
      wizardStatus: 'draft',
      updatedAt: '2026-02-14T10:00:00.000Z',
      _count: { chapters: 2 },
    },
    {
      id: 'n2',
      title: '天穹断章',
      description: '玄幻冒险',
      genre: '玄幻',
      wizardStatus: 'in_progress',
      updatedAt: '2026-02-14T11:00:00.000Z',
      chapters: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    },
    {
      id: 'n3',
      title: '归海集',
      description: '成长故事',
      genre: '现实',
      wizardStatus: 'completed',
      updatedAt: '2026-02-10T08:00:00.000Z',
      _count: { chapters: 10 },
    },
  ];

  it('calculates chapter count and search text', () => {
    expect(getNovelChapterCount(novels[0])).toBe(2);
    expect(getNovelChapterCount(novels[1])).toBe(3);

    const searchText = getNovelSearchText(novels[0]);
    expect(searchText).toContain('长夜城');
    expect(searchText).toContain('悬疑');
  });

  it('filters and sorts novels', () => {
    const filtered = filterAndSortNovels(novels, {
      query: '玄幻',
      status: 'all',
      sort: 'updated_desc',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('n2');

    const sortedByChapters = filterAndSortNovels(novels, {
      query: '',
      status: 'all',
      sort: 'chapters_desc',
    });

    expect(sortedByChapters.map((item) => item.id)).toEqual(['n3', 'n2', 'n1']);
  });

  it('builds library stats', () => {
    const filtered = filterAndSortNovels(novels, {
      query: '',
      status: 'in_progress',
      sort: 'updated_desc',
    });

    const stats = buildNovelsLibraryStats(novels, filtered.length);
    expect(stats.total).toBe(3);
    expect(stats.filtered).toBe(1);
    expect(stats.draft).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.totalChapters).toBe(15);
  });
});
