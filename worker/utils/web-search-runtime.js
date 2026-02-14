import { decryptApiKey } from '../../src/core/crypto.js';
import { WebSearchError } from '../../src/server/services/web-search.js';

const DEFAULT_PROVIDER = 'model';
const DEFAULT_KEYWORD_LENGTH = 200;
const DEFAULT_MAX_QUERIES = 3;

export const SEARCH_PROVIDER_FALLBACKS = {
  tavily: ['exa'],
  exa: ['tavily'],
  model: [],
};

export function normalizeSearchProvider(value, fallback = DEFAULT_PROVIDER) {
  if (value === 'tavily' || value === 'exa' || value === 'model') return value;
  return fallback;
}

export function normalizeSearchKeyword(keyword, maxLength = DEFAULT_KEYWORD_LENGTH) {
  if (typeof keyword !== 'string') return '';
  return keyword.trim().slice(0, Math.max(1, maxLength));
}

export function buildSearchQueries(keyword, categories, maxQueries = DEFAULT_MAX_QUERIES) {
  const baseKeyword = normalizeSearchKeyword(keyword);
  if (!baseKeyword) return [];

  const limit = Math.max(1, maxQueries);
  const querySet = new Set([baseKeyword]);

  if (Array.isArray(categories)) {
    for (const rawCategory of categories) {
      if (typeof rawCategory !== 'string') continue;
      const category = rawCategory.trim();
      if (!category) continue;
      querySet.add(`${baseKeyword} ${category}`);
      if (querySet.size >= limit) break;
    }
  }

  return Array.from(querySet).slice(0, limit);
}

export function buildProviderApiKeys(provider, userApiKey) {
  const providerApiKeys = {
    tavily: process.env.TAVILY_API_KEY || '',
    exa: process.env.EXA_API_KEY || '',
  };
  const sharedApiKey = process.env.WEB_SEARCH_API_KEY || '';
  const preferredProvider = provider === 'exa' || provider === 'tavily' ? provider : null;

  if (preferredProvider && !providerApiKeys[preferredProvider] && sharedApiKey) {
    providerApiKeys[preferredProvider] = sharedApiKey;
  }

  if (preferredProvider && typeof userApiKey === 'string' && userApiKey.trim()) {
    providerApiKeys[preferredProvider] = userApiKey.trim();
  }

  return providerApiKeys;
}

export function hasAnySearchApiKey(providerApiKeys) {
  return Boolean(providerApiKeys?.tavily || providerApiKeys?.exa);
}

export function getSearchFallbackProviders(provider) {
  return SEARCH_PROVIDER_FALLBACKS[provider] || [];
}

export function formatWebSearchError(error) {
  if (error instanceof WebSearchError) {
    switch (error.code) {
      case 'timeout':
        return '搜索服务响应超时';
      case 'auth':
        return '搜索 API 密钥无效或权限不足';
      case 'quota':
        return '搜索服务额度不足或请求过于频繁';
      case 'missing_key':
        return '未配置搜索 API 密钥';
      case 'network':
        return '网络异常，无法访问搜索服务';
      default:
        return `搜索服务异常（${error.provider}）`;
    }
  }
  return '搜索服务异常';
}

export function dedupeWebSearchResults(results) {
  const uniqueMap = new Map();
  const safeResults = Array.isArray(results) ? results : [];

  safeResults.forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const title = typeof item.title === 'string' ? item.title : '';
    const snippet = typeof item.snippet === 'string' ? item.snippet : '';
    const url = typeof item.url === 'string' ? item.url : '';
    const key = url || `${title}|${snippet.slice(0, 80)}`;
    if (!key) return;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });

  return Array.from(uniqueMap.values());
}

export async function getUserSearchConfig(prisma, userId, options = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = user?.preferences || {};
  const provider = normalizeSearchProvider(prefs.webSearchProvider, options.defaultProvider || DEFAULT_PROVIDER);

  let userApiKey = null;
  if (prefs.webSearchApiKeyCiphertext) {
    try {
      userApiKey = decryptApiKey(prefs.webSearchApiKeyCiphertext);
    } catch {
      userApiKey = null;
    }
  }

  const providerApiKeys = buildProviderApiKeys(provider, userApiKey);

  return {
    enabled: prefs.webSearchEnabled || false,
    provider,
    apiKey: provider === 'model' ? null : providerApiKeys[provider] || null,
    providerApiKeys,
  };
}
