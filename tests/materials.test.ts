import { describe, expect, it } from 'vitest';
import {
  buildMaterialsStats,
  filterMaterials,
  getMaterialExcerpt,
  getMaterialTypeLabel,
} from '@/src/shared/materials';

describe('materials shared helpers', () => {
  const materials = [
    {
      id: 'm1',
      type: 'character' as const,
      name: '林青',
      data: {
        description: '主角，前期隐忍后期爆发。',
        attributes: { realm: '筑基', camp: '青云宗' },
      },
    },
    {
      id: 'm2',
      type: 'item' as const,
      name: '玄铁剑',
      data: {
        description: '可破幻术',
        attributes: { rarity: '地阶', owner: '林青' },
      },
    },
    {
      id: 'm3',
      type: 'location' as const,
      name: '云梦泽',
      data: {
        description: '迷雾沼泽地带',
        attributes: { danger: 'high' },
      },
    },
  ];

  it('filters by tab and extended search fields', () => {
    const filteredByType = filterMaterials(materials, {
      activeTab: 'character',
      searchQuery: '',
    });
    expect(filteredByType).toHaveLength(1);

    const filteredByAttribute = filterMaterials(materials, {
      activeTab: 'all',
      searchQuery: '地阶',
    });
    expect(filteredByAttribute.map((item) => item.id)).toEqual(['m2']);

    const filteredByDescription = filterMaterials(materials, {
      activeTab: 'all',
      searchQuery: '迷雾',
    });
    expect(filteredByDescription.map((item) => item.id)).toEqual(['m3']);
  });

  it('builds stats and content helpers', () => {
    const filtered = filterMaterials(materials, {
      activeTab: 'all',
      searchQuery: '林青',
    });

    const stats = buildMaterialsStats(materials, filtered, 2);
    expect(stats.total).toBe(3);
    expect(stats.filtered).toBe(2);
    expect(stats.selected).toBe(2);
    expect(stats.activeTypeCount).toBe(2);

    expect(getMaterialTypeLabel('plotPoint')).toBe('情节点');
    expect(getMaterialExcerpt(materials[0].data)).toContain('主角');
  });
});
