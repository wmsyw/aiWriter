import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATERIAL_SEARCH_CATEGORIES,
  normalizeMaterialSearchCategories,
} from '@/src/shared/material-search';

describe('material search shared helpers', () => {
  it('normalizes categories and removes invalid values', () => {
    const normalized = normalizeMaterialSearchCategories(['人物', '道具', '未知', '人物']);
    expect(normalized).toEqual(['人物', '道具']);
  });

  it('falls back to default categories', () => {
    const normalized = normalizeMaterialSearchCategories(['未知']);
    expect(normalized).toEqual(DEFAULT_MATERIAL_SEARCH_CATEGORIES);
  });
});
