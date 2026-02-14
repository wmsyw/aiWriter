import { describe, expect, it } from 'vitest';
import {
  buildOverdueHookMap,
  filterAndSortHooks,
  getHooksCurrentChapter,
  isHookActive,
  type NarrativeHookRecord,
} from '@/src/shared/hooks';

describe('hooks shared helpers', () => {
  const hooks: NarrativeHookRecord[] = [
    {
      id: 'h1',
      type: 'mystery',
      description: '主角身世之谜',
      status: 'planted',
      importance: 'critical',
      plantedInChapter: 3,
      referencedInChapters: [7],
      relatedCharacters: ['林青'],
      notes: '主线核心悬念',
    },
    {
      id: 'h2',
      type: 'foreshadowing',
      description: '古剑异动',
      status: 'referenced',
      importance: 'major',
      plantedInChapter: 6,
      referencedInChapters: [9],
      relatedCharacters: ['沈月'],
    },
    {
      id: 'h3',
      type: 'setup',
      description: '宗门大会约定',
      status: 'resolved',
      importance: 'minor',
      plantedInChapter: 2,
      referencedInChapters: [5],
      resolvedInChapter: 8,
      relatedCharacters: ['林青'],
    },
  ];

  it('computes current chapter and active state', () => {
    expect(getHooksCurrentChapter(hooks)).toBe(9);
    expect(isHookActive('planted')).toBe(true);
    expect(isHookActive('resolved')).toBe(false);
  });

  it('filters by search and sorts by urgency with overdue boost', () => {
    const overdueMap = buildOverdueHookMap([
      {
        hookId: 'h2',
        description: '古剑异动',
        plantedChapter: 6,
        chaptersOverdue: 4,
        importance: 'major',
        suggestedAction: '尽快回收',
      },
    ]);

    const sorted = filterAndSortHooks(hooks, {
      activeTab: 'all',
      searchQuery: '',
      overdueMap,
    });

    expect(sorted[0]?.id).toBe('h2');

    const searched = filterAndSortHooks(hooks, {
      activeTab: 'all',
      searchQuery: '身世',
      overdueMap,
    });

    expect(searched).toHaveLength(1);
    expect(searched[0]?.id).toBe('h1');
  });
});
