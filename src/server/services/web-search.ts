const SEARCH_TIMEOUT_MS = 30000;
const MAX_QUERY_LENGTH = 220;
const MAX_PROVIDER_RESULTS = 10;
const MAX_CONTEXT_RESULTS = 8;
const MAX_SNIPPET_LENGTH = 1200;
const DEFAULT_MAX_RESULTS = 5;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
}

export type SearchProvider = 'tavily' | 'exa' | 'model';

export type WebSearchErrorCode =
  | 'timeout'
  | 'auth'
  | 'quota'
  | 'network'
  | 'upstream'
  | 'invalid_request'
  | 'missing_key'
  | 'unknown';

export class WebSearchError extends Error {
  constructor(
    message: string,
    public readonly provider: SearchProvider,
    public readonly code: WebSearchErrorCode,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'WebSearchError';
  }
}

export interface WebSearchOptions {
  fallbackProviders?: SearchProvider[];
  providerApiKeys?: Partial<Record<Exclude<SearchProvider, 'model'>, string | null | undefined>>;
  timeoutMs?: number;
  allowEmptyResultFallback?: boolean;
}

export const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: '搜索互联网获取最新信息。当需要查询专业知识、时事热点、价格、股市、历史事件、真实人物、真实地点、统计数据等内容时使用此工具。',
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词，应该简洁明确',
        },
      },
      required: ['query'],
    },
  },
};

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  raw_content?: string;
}

interface TavilySearchResponse {
  results?: TavilySearchResult[];
  query?: string;
  answer?: string;
  response_time?: number;
}

interface ExaSearchResult {
  title?: string;
  url?: string;
  text?: string;
  highlight?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

interface ExaSearchResponse {
  results?: ExaSearchResult[];
  requestId?: string;
  resolvedSearchType?: string;
  autopromptString?: string;
}

function normalizeApiKey(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('****')) return '';
  return trimmed;
}

function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function trimText(value: unknown, maxLength = MAX_SNIPPET_LENGTH): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function toSafeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeAndLimitResults(results: WebSearchResult[], maxResults: number): WebSearchResult[] {
  const map = new Map<string, WebSearchResult>();

  for (const item of results) {
    const title = trimText(item.title, 200);
    const url = toSafeUrl(item.url);
    const snippet = trimText(item.snippet);
    const content = trimText(item.content);

    if (!title && !url && !snippet) continue;

    const identity = url || `${title}|${snippet.slice(0, 120)}`;
    if (map.has(identity)) continue;

    map.set(identity, {
      title: title || '未命名结果',
      url,
      snippet,
      ...(content ? { content } : {}),
    });

    if (map.size >= maxResults) break;
  }

  return Array.from(map.values());
}

function getStatusErrorCode(status: number): WebSearchErrorCode {
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402 || status === 429) return 'quota';
  if (status >= 500) return 'upstream';
  return 'unknown';
}

function buildStatusError(provider: Exclude<SearchProvider, 'model'>, status: number, details: string): WebSearchError {
  const code = getStatusErrorCode(status);
  const retryable = code === 'quota' || code === 'upstream';
  const detailText = details.slice(0, 300) || 'Unknown error';
  const providerName = provider === 'tavily' ? 'Tavily' : 'Exa';
  return new WebSearchError(`${providerName} API error: ${status} - ${detailText}`, provider, code, status, retryable);
}

function normalizeThrownError(provider: Exclude<SearchProvider, 'model'>, error: unknown): WebSearchError {
  if (error instanceof WebSearchError) return error;

  if (error instanceof Error && error.name === 'AbortError') {
    return new WebSearchError('搜索请求超时', provider, 'timeout', 408, true);
  }

  if (error instanceof TypeError) {
    return new WebSearchError(`网络错误: ${error.message}`, provider, 'network', 0, true);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return new WebSearchError(message, provider, 'unknown', undefined, false);
}

function resolveTimeout(timeoutMs?: number): number {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) return SEARCH_TIMEOUT_MS;
  return Math.min(Math.max(timeoutMs, 3000), 60000);
}

function resolveMaxResults(maxResults: number | undefined): number {
  if (!maxResults || !Number.isFinite(maxResults)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(1, Math.floor(maxResults)), MAX_PROVIDER_RESULTS);
}

async function searchWithTavily(
  apiKey: string,
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
  timeoutMs = SEARCH_TIMEOUT_MS,
): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw buildStatusError('tavily', res.status, errorText);
    }

    const data: TavilySearchResponse = await res.json();

    return {
      query,
      results: normalizeAndLimitResults(
        (data.results || []).map((result): WebSearchResult => ({
          title: result.title || '',
          url: result.url || '',
          snippet: result.content || '',
        })),
        maxResults,
      ),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw normalizeThrownError('tavily', error);
  }
}

async function searchWithExa(
  apiKey: string,
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
  timeoutMs = SEARCH_TIMEOUT_MS,
): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        type: 'neural',
        useAutoprompt: true,
        contents: { text: { maxCharacters: 1000 } },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw buildStatusError('exa', res.status, errorText);
    }

    const data: ExaSearchResponse = await res.json();

    return {
      query,
      results: normalizeAndLimitResults(
        (data.results || []).map((result): WebSearchResult => ({
          title: result.title || '',
          url: result.url || '',
          snippet: result.highlight || result.text || '',
          content: result.text,
        })),
        maxResults,
      ),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw normalizeThrownError('exa', error);
  }
}

function buildProviderExecutionPlan(
  primaryProvider: SearchProvider,
  fallbackProviders: SearchProvider[] | undefined,
): Exclude<SearchProvider, 'model'>[] {
  const plan = [primaryProvider, ...(fallbackProviders || [])]
    .filter((provider): provider is Exclude<SearchProvider, 'model'> => provider === 'tavily' || provider === 'exa');

  return [...new Set(plan)];
}

function resolveProviderApiKey(
  targetProvider: Exclude<SearchProvider, 'model'>,
  primaryProvider: SearchProvider,
  primaryApiKey: string,
  options?: WebSearchOptions,
): string {
  const optionKey = normalizeApiKey(options?.providerApiKeys?.[targetProvider]);
  if (targetProvider === primaryProvider) {
    return normalizeApiKey(primaryApiKey) || optionKey;
  }
  return optionKey;
}

export async function webSearch(
  provider: SearchProvider,
  apiKey: string,
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
  options?: WebSearchOptions,
): Promise<WebSearchResponse> {
  const normalizedQuery = sanitizeSearchQuery(query);
  if (!normalizedQuery) {
    throw new WebSearchError('搜索词不能为空', provider, 'invalid_request', 400, false);
  }

  if (provider === 'model') {
    return { query: normalizedQuery, results: [] };
  }

  const resolvedMaxResults = resolveMaxResults(maxResults);
  const timeoutMs = resolveTimeout(options?.timeoutMs);
  const providerPlan = buildProviderExecutionPlan(provider, options?.fallbackProviders);
  const fallbackOnEmptyResult = options?.allowEmptyResultFallback ?? true;

  let lastError: WebSearchError | null = null;

  for (let index = 0; index < providerPlan.length; index++) {
    const currentProvider = providerPlan[index];
    const key = resolveProviderApiKey(currentProvider, provider, apiKey, options);

    if (!key) {
      lastError = new WebSearchError('搜索服务商 API 密钥缺失', currentProvider, 'missing_key', 400, false);
      continue;
    }

    try {
      const response = currentProvider === 'tavily'
        ? await searchWithTavily(key, normalizedQuery, resolvedMaxResults, timeoutMs)
        : await searchWithExa(key, normalizedQuery, resolvedMaxResults, timeoutMs);

      if (response.results.length > 0) {
        return response;
      }

      const isLastProvider = index === providerPlan.length - 1;
      if (isLastProvider || !fallbackOnEmptyResult) {
        return response;
      }
    } catch (error) {
      lastError = normalizeThrownError(currentProvider, error);
      if (index === providerPlan.length - 1) {
        throw lastError;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { query: normalizedQuery, results: [] };
}

export const MODEL_WEB_SEARCH_TOOL = {
  type: 'web_search' as const,
};

export function formatSearchResultsForContext(results: WebSearchResult[]): string {
  if (results.length === 0) return '';

  return normalizeAndLimitResults(results, MAX_CONTEXT_RESULTS)
    .map((item, index) => {
      const sourceLine = item.url ? `来源: ${item.url}` : '来源: 未知';
      return `[${index + 1}] ${item.title}\n${sourceLine}\n${trimText(item.snippet, 300)}`;
    })
    .join('\n\n');
}

export const WEB_SEARCH_TOPICS = [
  '专业知识', '时事热点', '新闻', '价格', '股市', '股票', '历史事件',
  '科学', '技术', '医学', '法律', '经济', '政治', '体育', '娱乐',
  '真实人物', '真实地点', '真实事件', '统计数据', '研究报告',
];

export function shouldSearchForTopic(content: string): boolean {
  const lowerContent = content.toLowerCase();
  const patterns = [
    /最新|最近|当前|现在|今年|去年|\d{4}年/,
    /价格|股价|市值|汇率|利率/,
    /真实|历史上|实际上|根据.*资料/,
    /专业.*知识|技术.*细节|科学.*原理/,
    /新闻|报道|事件|发生/,
  ];

  return patterns.some((pattern) => pattern.test(content)) ||
    WEB_SEARCH_TOPICS.some((topic) => lowerContent.includes(topic.toLowerCase()));
}

function pushUniqueQuery(container: string[], query: string) {
  const normalized = sanitizeSearchQuery(query);
  if (!normalized) return;
  if (container.includes(normalized)) return;
  container.push(normalized);
}

export function extractSearchQueries(outline: string, novelTitle: string): string[] {
  const queries: string[] = [];

  const patterns = [
    /涉及[：:]\s*([^。\n]+)/g,
    /关于[：:]\s*([^。\n]+)/g,
    /背景[：:]\s*([^。\n]+)/g,
    /需要了解[：:]\s*([^。\n]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(outline)) !== null) {
      if (match[1] && match[1].length > 2 && match[1].length < 100) {
        pushUniqueQuery(queries, match[1].trim());
      }
    }
  }

  if (queries.length === 0 && shouldSearchForTopic(outline)) {
    const keywords = outline
      .replace(/[，。！？、；：""''（）【】]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 5)
      .join(' ');

    if (keywords.length > 4) {
      pushUniqueQuery(queries, `${novelTitle} ${keywords}`);
    }
  }

  return queries.slice(0, 3);
}
