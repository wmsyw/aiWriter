const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

const ALLOWED_PROVIDER_HOSTS: Record<string, string[]> = {
  openai: ['api.openai.com', 'api.azure.com', 'openai.azure.com'],
  claude: ['api.anthropic.com'],
  gemini: ['generativelanguage.googleapis.com'],
};

// Gemini 2.x models use google_search, 1.5 models use googleSearchRetrieval
const GEMINI_2X_MODELS = ['gemini-2.0', 'gemini-2.5', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

function isGemini2xModel(model: string): boolean {
  return GEMINI_2X_MODELS.some(prefix => model.startsWith(prefix) || model.includes('gemini-2'));
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function validateBaseURL(providerType: string, urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format');
  }
  
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }
  
  const hostname = url.hostname.toLowerCase();
  
  // Block private/loopback IPs
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
  ];
  
  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      throw new Error('Private/loopback addresses are not allowed');
    }
  }
  
  // Check against allowed hosts for provider
  const allowedHosts = ALLOWED_PROVIDER_HOSTS[providerType];
  if (allowedHosts) {
    const isAllowed = allowedHosts.some(h => hostname === h || hostname.endsWith('.' + h));
    if (!isAllowed) {
      throw new Error(`Custom URL must be from allowed domains for ${providerType}`);
    }
  }
}

export function getProviderBaseURL(providerType: string, customBaseURL?: string): string {
  if (customBaseURL) {
    validateBaseURL(providerType, customBaseURL);
    return customBaseURL.replace(/\/+$/, '');
  }
  const url = PROVIDER_BASE_URLS[providerType];
  if (!url) throw new Error(`Unknown provider type: ${providerType}`);
  return url;
}

export interface ToolDefinition {
  type: 'function' | 'web_search';
  function?: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface NormalizedRequest {
  messages: Array<{ role: string; content: string; tool_call_id?: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  webSearch?: boolean;
}

export interface NormalizedResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: ToolCall[];
  finishReason?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage?: { promptTokens: number; totalTokens: number };
}

export interface ImageGenResponse {
  url?: string;
  base64?: string;
  revisedPrompt?: string;
}

export interface ImageGenOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}

export interface ProviderAdapter {
  generate(config: any, request: NormalizedRequest): Promise<NormalizedResponse>;
  createEmbedding?(texts: string[], model?: string): Promise<EmbeddingResponse>;
  generateImage?(prompt: string, options?: ImageGenOptions): Promise<ImageGenResponse>;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsEmbeddings: boolean;
  supportsImageGen: boolean;
}

const TIMEOUT_MS = 120000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 503 || status === 502 || status === 500;
}

function parseRetryAfter(res: Response): number | undefined {
  const retryAfter = res.headers.get('retry-after') || res.headers.get('retry-after-ms');
  if (!retryAfter) return undefined;
  
  const ms = parseInt(retryAfter, 10);
  if (!isNaN(ms)) {
    return retryAfter.includes('-ms') ? ms : ms * 1000;
  }
  
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) return res;
      
      const errorBody = await res.text().catch(() => 'Unknown error');
      const retryAfterMs = parseRetryAfter(res);
      const retryable = isRetryableStatus(res.status);
      
      if (!retryable) {
        throw new ProviderError(
          `Provider API error ${res.status}: ${errorBody.slice(0, 500)}`,
          res.status,
          false
        );
      }
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = retryAfterMs || BASE_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random());
        await new Promise(r => setTimeout(r, Math.min(delay, 60000)));
        continue;
      }
      
      throw new ProviderError(
        `Provider API error ${res.status} after ${MAX_RETRIES} retries: ${errorBody.slice(0, 500)}`,
        res.status,
        true,
        retryAfterMs
      );
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err instanceof ProviderError) throw err;
      
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const isNetwork = err instanceof TypeError;
      
      if ((isTimeout || isNetwork) && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random());
        await new Promise(r => setTimeout(r, delay));
        lastError = err as Error;
        continue;
      }
      
      throw new ProviderError(
        isTimeout ? 'Request timeout' : `Network error: ${(err as Error).message}`,
        isTimeout ? 408 : 0,
        true
      );
    }
  }
  
  throw lastError || new Error('Unexpected retry loop exit');
}

function extractOpenAIContent(data: any): { content: string; toolCalls?: ToolCall[]; finishReason?: string } {
  const message = data?.choices?.[0]?.message;
  if (!message) {
    if (data?.error) throw new ProviderError(`OpenAI error: ${data.error.message}`, 400, false);
    throw new ProviderError('Empty response from OpenAI', 500, true);
  }
  
  return {
    content: message.content || '',
    toolCalls: message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
    finishReason: data.choices[0].finish_reason,
  };
}

function extractClaudeContent(data: any): string {
  if (!data?.content?.[0]?.text) {
    if (data?.error) throw new ProviderError(`Claude error: ${data.error.message}`, 400, false);
    if (data?.stop_reason === 'max_tokens') return data.content?.[0]?.text || '';
    throw new ProviderError('Empty response from Claude', 500, true);
  }
  return data.content[0].text;
}

function extractGeminiContent(data: any): string {
  if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    if (data?.error) throw new ProviderError(`Gemini error: ${data.error.message}`, 400, false);
    if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new ProviderError('Content blocked by safety filters', 400, false);
    }
    throw new ProviderError('Empty response from Gemini', 500, true);
  }
  return data.candidates[0].content.parts[0].text;
}

async function generateOpenAIWithWebSearch(
  baseURL: string, 
  apiKey: string, 
  req: NormalizedRequest
): Promise<NormalizedResponse> {
  const systemMessage = req.messages.find(m => m.role === 'system');
  const userMessages = req.messages.filter(m => m.role !== 'system');
  const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
  
  const body: Record<string, unknown> = {
    model: req.model,
    input: lastUserMessage?.content || '',
    tools: [{ type: 'web_search' }],
    tool_choice: 'auto',
  };
  
  if (systemMessage) {
    body.instructions = systemMessage.content;
  }
  
  const res = await fetchWithRetry(`${baseURL}/responses`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  
  if (data?.error) {
    throw new ProviderError(`OpenAI error: ${data.error.message}`, 400, false);
  }
  
  let content = '';
  const output = data?.output;
  if (Array.isArray(output)) {
    const messageItem = output.find((item: { type: string }) => item.type === 'message');
    if (messageItem?.content) {
      const textBlock = messageItem.content.find((c: { type: string }) => c.type === 'output_text');
      content = textBlock?.text || '';
    }
  }
  
  if (!content && data?.status !== 'completed') {
    throw new ProviderError('Empty response from OpenAI Responses API', 500, true);
  }
  
  return {
    content,
    finishReason: data?.status === 'completed' ? 'stop' : data?.status,
    usage: data?.usage && {
      promptTokens: data.usage.input_tokens || 0,
      completionTokens: data.usage.output_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    },
  };
}

export async function createAdapter(providerType: string, apiKey: string, customBaseURL?: string): Promise<ProviderAdapter> {
  const baseURL = getProviderBaseURL(providerType, customBaseURL);

  switch (providerType) {
    case 'openai':
      return {
        async generate(config, req) {
          if (req.webSearch) {
            return generateOpenAIWithWebSearch(baseURL, apiKey, req);
          }
          
          const body: Record<string, unknown> = {
            model: req.model,
            messages: req.messages,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
          };
          
          if (req.tools && req.tools.length > 0) {
            body.tools = req.tools;
            body.tool_choice = req.tool_choice || 'auto';
          }
          
          const res = await fetchWithRetry(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          const extracted = extractOpenAIContent(data);
          return {
            content: extracted.content,
            toolCalls: extracted.toolCalls,
            finishReason: extracted.finishReason,
            usage: data.usage && {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            },
          };
        },
        async createEmbedding(texts, model = 'text-embedding-3-small') {
          const res = await fetchWithRetry(`${baseURL}/embeddings`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: texts, model }),
          });
          const data = await res.json();
          if (!data?.data) throw new ProviderError('Invalid embedding response', 500, true);
          return {
            embeddings: data.data.map((d: any) => d.embedding),
            usage: data.usage && {
              promptTokens: data.usage.prompt_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            },
          };
        },
        async generateImage(prompt, options = {}) {
          const res = await fetchWithRetry(`${baseURL}/images/generations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'dall-e-3',
              prompt,
              n: 1,
              size: options.size || '1024x1024',
              quality: options.quality || 'standard',
              style: options.style || 'vivid',
            }),
          });
          const data = await res.json();
          if (!data?.data?.[0]) throw new ProviderError('Invalid image response', 500, true);
          return {
            url: data.data[0].url,
            revisedPrompt: data.data[0].revised_prompt,
          };
        },
        supportsStreaming: false,
        supportsTools: true,
        supportsVision: true,
        supportsEmbeddings: true,
        supportsImageGen: true,
      };
    case 'claude':
      return {
        async generate(config, req) {
          const systemMessage = req.messages.find(m => m.role === 'system');
          const conversationMessages = req.messages
            .filter(m => m.role !== 'system')
            .map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          
          const requestBody: Record<string, unknown> = {
            model: req.model,
            messages: conversationMessages,
            max_tokens: req.maxTokens || 4096,
            temperature: req.temperature,
          };
          
          if (systemMessage) {
            requestBody.system = systemMessage.content;
          }
          
          const res = await fetchWithRetry(`${baseURL}/v1/messages`, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          const data = await res.json();
          return {
            content: extractClaudeContent(data),
            usage: data.usage && {
              promptTokens: data.usage.input_tokens || 0,
              completionTokens: data.usage.output_tokens || 0,
              totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
            },
          };
        },
        supportsStreaming: false,
        supportsTools: false,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsImageGen: false,
      };
    case 'gemini':
      return {
        async generate(config, req) {
          const geminiMessages = req.messages
            .filter(m => m.role !== 'system')
            .map(m => {
              if (m.role === 'tool') {
                return {
                  role: 'user',
                  parts: [{
                    functionResponse: {
                      name: m.tool_call_id || 'function',
                      response: { result: m.content }
                    }
                  }]
                };
              }
              return { 
                role: m.role === 'assistant' ? 'model' : 'user', 
                parts: [{ text: m.content }] 
              };
            });
          
          const systemMessage = req.messages.find(m => m.role === 'system');
          
          const body: Record<string, unknown> = {
            contents: geminiMessages,
            generationConfig: { temperature: req.temperature, maxOutputTokens: req.maxTokens },
          };
          
          if (systemMessage) {
            body.systemInstruction = { parts: [{ text: systemMessage.content }] };
          }
          
          if (req.webSearch) {
            if (isGemini2xModel(req.model)) {
              body.tools = [{ google_search: {} }];
            } else {
              body.tools = [{ googleSearchRetrieval: {} }];
            }
          }
          
          const res = await fetchWithRetry(`${baseURL}/v1beta/models/${req.model}:generateContent`, {
            method: 'POST',
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          return {
            content: extractGeminiContent(data),
            usage: data.usageMetadata && {
              promptTokens: data.usageMetadata.promptTokenCount || 0,
              completionTokens: data.usageMetadata.candidatesTokenCount || 0,
              totalTokens: data.usageMetadata.totalTokenCount || 0,
            },
          };
        },
        async createEmbedding(texts, model = 'text-embedding-004') {
          const embeddings: number[][] = [];
          let totalTokens = 0;
          
          for (const text of texts) {
            const res = await fetchWithRetry(`${baseURL}/v1beta/models/${model}:embedContent`, {
              method: 'POST',
              headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] } }),
            });
            const data = await res.json();
            if (!data?.embedding?.values) throw new ProviderError('Invalid embedding response', 500, true);
            embeddings.push(data.embedding.values);
            if (data.usageMetadata) totalTokens += data.usageMetadata.totalTokenCount || 0;
          }
          
          return { embeddings, usage: { promptTokens: totalTokens, totalTokens } };
        },
        supportsStreaming: false,
        supportsTools: true,
        supportsVision: true,
        supportsEmbeddings: true,
        supportsImageGen: false,
      };
    default:
      throw new Error(`Unsupported provider: ${providerType}`);
  }
}
