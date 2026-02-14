import { describe, expect, it } from 'vitest';
import { WebSearchError } from '@/src/server/services/web-search';
import {
  buildSearchQueries,
  dedupeWebSearchResults,
  formatWebSearchError,
  normalizeSearchKeyword,
  normalizeSearchProvider,
} from '@/worker/utils/web-search-runtime.js';

describe('worker web search runtime helpers', () => {
  it('normalizes provider and keyword', () => {
    expect(normalizeSearchProvider('tavily')).toBe('tavily');
    expect(normalizeSearchProvider('unknown')).toBe('model');
    expect(normalizeSearchKeyword('  斗破苍穹  ')).toBe('斗破苍穹');
  });

  it('builds deduplicated search queries', () => {
    const queries = buildSearchQueries('三体', ['人物', '人物', '世界观'], 3);
    expect(queries).toEqual(['三体', '三体 人物', '三体 世界观']);
  });

  it('deduplicates search results by url and fallback fingerprint', () => {
    const results = dedupeWebSearchResults([
      { title: 'A', url: 'https://a.com', snippet: 'x' },
      { title: 'A2', url: 'https://a.com', snippet: 'y' },
      { title: 'B', url: '', snippet: 'same snippet' },
      { title: 'B', url: '', snippet: 'same snippet' },
      { title: 'C', url: '', snippet: 'another' },
    ]);

    expect(results).toHaveLength(3);
  });

  it('formats web search error messages', () => {
    const authError = new WebSearchError('auth', 'tavily', 'auth');
    const quotaError = new WebSearchError('quota', 'exa', 'quota');

    expect(formatWebSearchError(authError)).toContain('密钥无效');
    expect(formatWebSearchError(quotaError)).toContain('额度不足');
    expect(formatWebSearchError(new Error('oops'))).toBe('搜索服务异常');
  });
});
