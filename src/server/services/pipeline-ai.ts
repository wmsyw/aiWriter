/**
 * Pipeline AI Executor Service
 * 
 * Provides a unified interface for AI calls within pipeline stages.
 * Handles provider resolution, streaming, and error classification.
 */

import { prisma } from '@/src/server/db';
import { decryptApiKey } from '@/src/server/crypto';
import {
  createAdapter,
  applyProviderCapabilitiesToRequest,
  type NormalizedRequest,
  ProviderError,
} from '@/src/server/adapters/providers';
import { createStreamingAdapter } from '@/src/server/adapters/streaming';
import type { StageContext, ProgressReporter } from '@/src/server/orchestrator/types';
import { ErrorClassifier } from '@/src/server/orchestrator/self-healing';

export interface PipelineAIConfig {
  userId: string;
  agentId?: string;
  providerConfigId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PipelineAIRequest {
  systemPrompt?: string;
  userPrompt: string;
  context?: string;
  responseFormat?: 'text' | 'json';
  webSearch?: boolean;
}

export interface PipelineAIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  durationMs: number;
}

interface ResolvedProvider {
  adapter: Awaited<ReturnType<typeof createAdapter>>;
  streamingAdapter: Awaited<ReturnType<typeof createStreamingAdapter>>;
  model: string;
  providerType: string;
  baseURL: string;
}

const providerCache = new Map<string, { provider: ResolvedProvider; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

interface UserPreferenceDefaults {
  defaultProviderId?: string;
  defaultModel?: string;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function extractProviderModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const models = value
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => Boolean(item));
  return [...new Set(models)];
}

function readUserPreferenceDefaults(rawPreferences: unknown): UserPreferenceDefaults {
  if (!rawPreferences || typeof rawPreferences !== 'object' || Array.isArray(rawPreferences)) {
    return {};
  }

  const prefs = rawPreferences as Record<string, unknown>;
  return {
    defaultProviderId: toNonEmptyString(prefs.defaultProviderId),
    defaultModel: toNonEmptyString(prefs.defaultModel),
  };
}

export function resolvePipelineModel(params: {
  requestModel?: string;
  preferredModel?: string;
  providerDefaultModel?: string;
  providerModels?: string[];
}): string {
  const providerModels = params.providerModels || [];
  const requestModel = toNonEmptyString(params.requestModel);
  if (requestModel) return requestModel;

  const preferredModel = toNonEmptyString(params.preferredModel);
  if (preferredModel) {
    if (providerModels.length === 0 || providerModels.includes(preferredModel)) {
      return preferredModel;
    }
  }

  const providerDefaultModel = toNonEmptyString(params.providerDefaultModel);
  if (providerDefaultModel) return providerDefaultModel;

  if (providerModels.length > 0) return providerModels[0];
  return 'gpt-4o';
}

async function loadUserPreferenceDefaults(userId: string): Promise<UserPreferenceDefaults> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return readUserPreferenceDefaults(user?.preferences);
}

async function resolveProvider(config: PipelineAIConfig): Promise<ResolvedProvider> {
  let preferenceDefaults: UserPreferenceDefaults | null = null;

  if (!config.providerConfigId || !config.model) {
    preferenceDefaults = await loadUserPreferenceDefaults(config.userId);
  }

  const preferredProviderId = config.providerConfigId || preferenceDefaults?.defaultProviderId;
  const preferredModel = config.model || preferenceDefaults?.defaultModel || 'default-model';
  const cacheKey = `${config.userId}:${preferredProviderId || 'default-provider'}:${preferredModel}`;
  const cached = providerCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.provider;
  }

  let providerConfig;

  if (preferredProviderId) {
    providerConfig = await prisma.providerConfig.findFirst({
      where: {
        id: preferredProviderId,
        userId: config.userId,
      },
    });
    if (!providerConfig && config.providerConfigId) {
      throw new Error('Provider configuration not found or access denied.');
    }
  }

  if (!providerConfig) {
    providerConfig = await prisma.providerConfig.findFirst({
      where: { userId: config.userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!providerConfig) {
    throw new Error('No AI provider configured. Please add a provider in Settings.');
  }

  const apiKey = await decryptApiKey(providerConfig.apiKeyCiphertext);
  const adapter = await createAdapter(
    providerConfig.providerType,
    apiKey,
    providerConfig.baseURL
  );
  const streamingAdapter = await createStreamingAdapter(
    providerConfig.providerType,
    apiKey,
    providerConfig.baseURL
  );

  const resolved: ResolvedProvider = {
    adapter,
    streamingAdapter,
    model: resolvePipelineModel({
      requestModel: config.model,
      preferredModel: preferenceDefaults?.defaultModel,
      providerDefaultModel: providerConfig.defaultModel || undefined,
      providerModels: extractProviderModels(providerConfig.models),
    }),
    providerType: providerConfig.providerType,
    baseURL: providerConfig.baseURL,
  };

  providerCache.set(cacheKey, {
    provider: resolved,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return resolved;
}

function buildMessages(request: PipelineAIRequest): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }

  if (request.context) {
    messages.push({ role: 'system', content: `Context:\n${request.context}` });
  }

  messages.push({ role: 'user', content: request.userPrompt });

  return messages;
}

export async function generateText(
  config: PipelineAIConfig,
  request: PipelineAIRequest,
  signal?: AbortSignal
): Promise<PipelineAIResponse> {
  const startTime = Date.now();
  const provider = await resolveProvider(config);

  const normalizedRequest: NormalizedRequest = {
    messages: buildMessages(request),
    model: provider.model,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 4000,
    stream: false,
    responseFormat: request.responseFormat,
    webSearch: request.webSearch,
  };
  const { request: guardedRequest, warnings } = applyProviderCapabilitiesToRequest(
    provider.providerType,
    normalizedRequest,
    {
      supportsStreaming: provider.adapter.supportsStreaming,
      supportsTools: provider.adapter.supportsTools,
      supportsVision: provider.adapter.supportsVision,
      supportsEmbeddings: provider.adapter.supportsEmbeddings,
      supportsImageGen: provider.adapter.supportsImageGen,
    },
  );

  if (warnings.length > 0) {
    console.warn('[PipelineAI] capability guard applied', {
      providerType: provider.providerType,
      model: provider.model,
      warnings,
    });
  }

  try {
    const response = await provider.adapter.generate(
      { providerType: provider.providerType, baseURL: provider.baseURL },
      guardedRequest
    );

    return {
      content: response.content,
      usage: response.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: provider.model,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      const category = ErrorClassifier.getErrorCategory(error);
      if (category === 'retryable' || category === 'transient') {
        throw error;
      }
    }
    throw error;
  }
}

export async function generateTextStreaming(
  config: PipelineAIConfig,
  request: PipelineAIRequest,
  options: {
    onToken?: (token: string) => void;
    progress?: ProgressReporter;
    signal?: AbortSignal;
  } = {}
): Promise<PipelineAIResponse> {
  const startTime = Date.now();
  const provider = await resolveProvider(config);

  const normalizedRequest: NormalizedRequest = {
    messages: buildMessages(request),
    model: provider.model,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 4000,
    stream: true,
    responseFormat: request.responseFormat,
    webSearch: request.webSearch,
  };
  const { request: guardedRequest, warnings } = applyProviderCapabilitiesToRequest(
    provider.providerType,
    normalizedRequest,
    {
      supportsStreaming: provider.adapter.supportsStreaming,
      supportsTools: provider.adapter.supportsTools,
      supportsVision: provider.adapter.supportsVision,
      supportsEmbeddings: provider.adapter.supportsEmbeddings,
      supportsImageGen: provider.adapter.supportsImageGen,
    },
  );

  if (warnings.length > 0) {
    console.warn('[PipelineAI] streaming capability guard applied', {
      providerType: provider.providerType,
      model: provider.model,
      warnings,
    });
  }

  let content = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  const stream = provider.streamingAdapter.generateStream(
    { providerType: provider.providerType, baseURL: provider.baseURL },
    guardedRequest,
    { signal: options.signal }
  );

  for await (const chunk of stream) {
    if (chunk.type === 'token' && chunk.token) {
      content += chunk.token;
      options.onToken?.(chunk.token);
      options.progress?.token?.(chunk.token);
    } else if (chunk.type === 'done' && chunk.response) {
      usage = chunk.response.usage ?? usage;
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error || 'Streaming error');
    }
  }

  return {
    content,
    usage,
    model: provider.model,
    durationMs: Date.now() - startTime,
  };
}

export async function generateJSON<T = unknown>(
  config: PipelineAIConfig,
  request: PipelineAIRequest,
  signal?: AbortSignal
): Promise<{ data: T; usage: PipelineAIResponse['usage']; model: string; durationMs: number }> {
  const response = await generateText(
    config,
    { ...request, responseFormat: 'json' },
    signal
  );

  let data: T;
  try {
    let jsonStr = response.content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    data = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${response.content.slice(0, 200)}...`);
  }

  return {
    data,
    usage: response.usage,
    model: response.model,
    durationMs: response.durationMs,
  };
}

export function createPipelineAI(ctx: StageContext): {
  generate: (request: PipelineAIRequest) => Promise<PipelineAIResponse>;
  generateStreaming: (request: PipelineAIRequest) => Promise<PipelineAIResponse>;
  generateJSON: <T = unknown>(request: PipelineAIRequest) => Promise<{ data: T; usage: PipelineAIResponse['usage']; model: string; durationMs: number }>;
} {
  const config: PipelineAIConfig = {
    userId: ctx.userId,
    providerConfigId: (ctx.config as Record<string, unknown>)?.providerConfigId as string | undefined,
    model: (ctx.config as Record<string, unknown>)?.model as string | undefined,
    temperature: (ctx.config as Record<string, unknown>)?.temperature as number | undefined,
    maxTokens: (ctx.config as Record<string, unknown>)?.maxTokens as number | undefined,
  };

  return {
    generate: (request) => generateText(config, request, ctx.signal),
    generateStreaming: (request) => generateTextStreaming(config, request, {
      progress: ctx.progress,
      signal: ctx.signal,
    }),
    generateJSON: <T = unknown>(request: PipelineAIRequest) => generateJSON<T>(config, request, ctx.signal),
  };
}

export { ProviderError };
