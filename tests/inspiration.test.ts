import { describe, expect, it } from 'vitest';
import {
  buildInspirationCacheKey,
  buildInspirationKeywordsPrompt,
  formatKeywordsInput,
  getInspirationPresetsByGenre,
  normalizeInspirationList,
  parseKeywordsInput,
} from '@/src/shared/inspiration';

describe('inspiration helpers', () => {
  it('parses keyword input with mixed separators and de-duplicates', () => {
    const keywords = parseKeywordsInput(' 热血, 系统，穿越、系统\n成长 ; 热血 ');

    expect(keywords).toEqual(['热血', '系统', '穿越', '成长']);
  });

  it('formats keyword array into stable comma-separated text', () => {
    expect(formatKeywordsInput(['  热血 ', '系统', ''])).toBe('热血, 系统');
  });

  it('resolves presets by genre and falls back to default genre', () => {
    const xuanhuan = getInspirationPresetsByGenre('玄幻');
    const fallback = getInspirationPresetsByGenre('不存在的分类');

    expect(xuanhuan.length).toBeGreaterThan(0);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback[0]?.name).toBe('自由创作');
  });

  it('builds deterministic cache keys with normalization', () => {
    const keyA = buildInspirationCacheKey({
      genre: ' 玄幻 ',
      targetWords: 100,
      audience: ' 全年龄 ',
      keywords: ' 赛博朋克  ',
      style: ' 热血燃向',
      tone: '爽文节奏 ',
      perspective: ' 第一人称 ',
    });

    const keyB = buildInspirationCacheKey({
      genre: '玄幻',
      targetWords: 100,
      audience: '全年龄',
      keywords: '赛博朋克',
      style: '热血燃向',
      tone: '爽文节奏',
      perspective: '第一人称',
    });

    expect(keyA).toBe(keyB);
  });

  it('builds keyword prompt with optional writing requirements', () => {
    const prompt = buildInspirationKeywordsPrompt({
      keywords: '赛博朋克，复仇',
      style: '热血燃向',
      tone: '爽文节奏',
      perspective: '',
    });

    expect(prompt).toContain('赛博朋克，复仇');
    expect(prompt).toContain('写作风格：热血燃向');
    expect(prompt).toContain('情感基调：爽文节奏');
  });

  it('normalizes inspiration payload and ignores invalid entries', () => {
    const items = normalizeInspirationList({
      inspirations: [
        {
          title: '星门文明',
          coreTheme: '星际探索，文明对决',
          tags: '星际, 文明, 舰队',
          hero: '舰队指挥官',
          world_setting: '星门连接万千星域',
        },
        {
          foo: 'bar',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('星门文明');
    expect(items[0]?.keywords).toEqual(['星际', '文明', '舰队']);
    expect(items[0]?.worldSetting).toBe('星门连接万千星域');
  });
});
