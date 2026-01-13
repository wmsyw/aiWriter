const SEARCH_TIMEOUT_MS = 30000;

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

async function searchWithTavily(apiKey: string, query: string, maxResults = 5): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

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
      throw new Error(`Tavily API error: ${res.status}`);
    }

    const data = await res.json();
    return {
      query,
      results: (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.content || '',
      })),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function searchWithExa(apiKey: string, query: string, maxResults = 5): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

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
      throw new Error(`Exa API error: ${res.status}`);
    }

    const data = await res.json();
    return {
      query,
      results: (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.text || r.highlight || '',
        content: r.text,
      })),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export type SearchProvider = 'tavily' | 'exa' | 'model';

export async function webSearch(
  provider: SearchProvider,
  apiKey: string,
  query: string,
  maxResults = 5
): Promise<WebSearchResponse> {
  switch (provider) {
    case 'tavily':
      return searchWithTavily(apiKey, query, maxResults);
    case 'exa':
      return searchWithExa(apiKey, query, maxResults);
    case 'model':
      return { query, results: [] };
    default:
      throw new Error(`Unknown search provider: ${provider}`);
  }
}

export const MODEL_WEB_SEARCH_TOOL = {
  type: 'web_search' as const,
};

export function formatSearchResultsForContext(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n来源: ${r.url}\n${r.snippet}`)
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
  
  return patterns.some(p => p.test(content)) ||
    WEB_SEARCH_TOPICS.some(topic => lowerContent.includes(topic.toLowerCase()));
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
        queries.push(match[1].trim());
      }
    }
  }
  
  if (queries.length === 0 && shouldSearchForTopic(outline)) {
    const keywords = outline
      .replace(/[，。！？、；：""''（）【】]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5)
      .join(' ');
    
    if (keywords.length > 4) {
      queries.push(`${novelTitle} ${keywords}`);
    }
  }
  
  return [...new Set(queries)].slice(0, 3);
}
