import { createAdapter, applyProviderCapabilitiesToRequest, getProviderCapabilities } from '../../src/server/adapters/providers.js';
import { decryptApiKey } from '../../src/core/crypto.js';

const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [HELPER] [${level}] ${message}${dataStr}`);
};

const PROVIDER_RUNTIME_CACHE_TTL_MS = 5 * 60 * 1000;
const AGENT_TEMPLATE_CACHE_TTL_MS = 20 * 1000;
const providerRuntimeCache = new Map();
const agentTemplateCache = new Map();

function pruneExpiredCache(cache) {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (!value || value.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function buildProviderRuntimeCacheKey(config) {
  const updatedAt = config?.updatedAt instanceof Date ? config.updatedAt.getTime() : String(config?.updatedAt || '');
  return `${config?.id || 'unknown'}:${updatedAt}`;
}

function buildAgentTemplateCacheKey({
  userId,
  agentId,
  agentName,
  fallbackAgentName,
  templateName,
  preferBuiltIn,
}) {
  return JSON.stringify({
    userId,
    agentId: agentId || null,
    agentName: agentName || null,
    fallbackAgentName: fallbackAgentName || null,
    templateName: templateName || null,
    preferBuiltIn: !!preferBuiltIn,
  });
}

export async function getProviderAndAdapter(prisma, userId, providerConfigId) {
  log('DEBUG', 'getProviderAndAdapter called', { userId, providerConfigId });
  
  let effectiveProviderId = providerConfigId;
  let defaultModel = null;
  
  // Always fetch user preferences to get the default model
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = user?.preferences || {};
  
  // Get user's global default model (always available for fallback)
  if (prefs && typeof prefs === 'object') {
    defaultModel = prefs.defaultModel || null;
    
    // If no provider specified, use user's default provider
    if (!effectiveProviderId && prefs.defaultProviderId) {
      effectiveProviderId = prefs.defaultProviderId;
      log('DEBUG', 'Using default provider from user preferences', { 
        defaultProviderId: effectiveProviderId, 
        defaultModel 
      });
    }
  }
  
  if (!effectiveProviderId) {
    log('ERROR', 'No provider ID available', { userId, providerConfigId });
    throw new Error('No provider configured for agent and no default provider set.');
  }
  
  const config = await prisma.providerConfig.findFirst({
    where: { id: effectiveProviderId, userId },
  });
  
  if (!config) {
    log('ERROR', 'Provider config not found or access denied', { userId, effectiveProviderId });
    throw new Error(`Provider configuration (ID: ${effectiveProviderId}) not found or was deleted. Please update your default provider settings.`);
  }
  
  log('DEBUG', 'Provider config found', { 
    configId: config.id, 
    providerType: config.providerType,
    hasBaseURL: !!config.baseURL,
    defaultModel
  });

  pruneExpiredCache(providerRuntimeCache);
  const runtimeCacheKey = buildProviderRuntimeCacheKey(config);
  const cachedRuntime = providerRuntimeCache.get(runtimeCacheKey);

  let runtime = cachedRuntime?.runtime;
  if (!runtime) {
    const apiKey = decryptApiKey(config.apiKeyCiphertext);
    log('DEBUG', 'API key decrypted', { keyLength: apiKey?.length || 0 });

    const rawAdapter = await createAdapter(config.providerType, apiKey, config.baseURL || undefined);
    log('DEBUG', 'Adapter created successfully', { providerType: config.providerType });

    const adapterCapabilities = {
      supportsStreaming: rawAdapter.supportsStreaming,
      supportsTools: rawAdapter.supportsTools,
      supportsVision: rawAdapter.supportsVision,
      supportsEmbeddings: rawAdapter.supportsEmbeddings,
      supportsImageGen: rawAdapter.supportsImageGen,
    };

    const guardedAdapter = {
      ...rawAdapter,
      async generate(runtimeConfig, request) {
        const { request: guardedRequest, warnings, capabilities } = applyProviderCapabilitiesToRequest(
          config.providerType,
          request,
          adapterCapabilities,
        );

        if (warnings.length > 0) {
          log('WARN', 'Provider capability guard applied', {
            providerType: config.providerType,
            model: request?.model,
            warnings,
            capabilities,
          });
        }

        return rawAdapter.generate(runtimeConfig, guardedRequest);
      },
    };

    runtime = {
      adapter: guardedAdapter,
      getCapabilities: (model) => getProviderCapabilities(config.providerType, model, adapterCapabilities),
    };

    providerRuntimeCache.set(runtimeCacheKey, {
      runtime,
      expiresAt: Date.now() + PROVIDER_RUNTIME_CACHE_TTL_MS,
    });
  } else {
    log('DEBUG', 'Reusing cached provider runtime', {
      providerType: config.providerType,
      configId: config.id,
    });
  }

  return { config, adapter: runtime.adapter, defaultModel, getCapabilities: runtime.getCapabilities };
}

/**
 * Resolves the model to use based on precedence chain.
 * @param {string|null|undefined} agentModel - Model specified by the agent
 * @param {string|null|undefined} userDefaultModel - User's global default model from preferences
 * @param {string|null|undefined} providerDefaultModel - Provider's default model
 * @returns {string} The resolved model name
 * @throws {Error} If no model is available in the chain
 */
export function resolveModel(agentModel, userDefaultModel, providerDefaultModel) {
  const model = agentModel || userDefaultModel || providerDefaultModel;
  if (!model) {
    throw new Error('No model configured. Please configure a model in the agent, set a global default model, or ensure the provider has a default model.');
  }
  return model;
}

/**
 * 统一的 Agent 调用入口：
 * - 统一模型解析
 * - 统一参数回退
 * - 统一并发限制
 * - 统一 usage 记录
 */
export async function generateWithAgentRuntime({
  prisma,
  userId,
  jobId,
  config,
  adapter,
  agent,
  defaultModel,
  messages,
  temperature,
  maxTokens,
  webSearch,
  responseFormat,
  tools,
  tool_choice,
  timeoutMs = 300000,
}) {
  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);

  const request = {
    messages,
    model: effectiveModel,
    temperature: temperature ?? params.temperature ?? 0.7,
    maxTokens: maxTokens ?? params.maxTokens ?? 4000,
    ...(webSearch !== undefined ? { webSearch } : {}),
    ...(responseFormat ? { responseFormat } : {}),
    ...(tools ? { tools } : {}),
    ...(tool_choice ? { tool_choice } : {}),
  };

  const response = await withConcurrencyLimit(
    () => adapter.generate(config, request),
    timeoutMs,
  );

  if (prisma && userId && jobId) {
    await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);
  }

  return { response, effectiveModel, request };
}

async function findAgentByName(prisma, userId, name, preferBuiltIn = true) {
  if (!name) return null;
  if (preferBuiltIn) {
    return prisma.agentDefinition.findFirst({
      where: { userId, name },
      orderBy: [{ isBuiltIn: 'desc' }, { updatedAt: 'desc' }],
    });
  }
  return prisma.agentDefinition.findFirst({
    where: { userId, name },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function resolveAgentAndTemplate(prisma, { userId, agentId, agentName, fallbackAgentName, templateName, preferBuiltIn = true }) {
  pruneExpiredCache(agentTemplateCache);
  const cacheKey = buildAgentTemplateCacheKey({
    userId,
    agentId,
    agentName,
    fallbackAgentName,
    templateName,
    preferBuiltIn,
  });
  const cached = agentTemplateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let agent = null;
  if (agentId) {
    agent = await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } });
  }
  if (!agent && agentName) {
    agent = await findAgentByName(prisma, userId, agentName, preferBuiltIn);
  }
  if (!agent && fallbackAgentName) {
    agent = await findAgentByName(prisma, userId, fallbackAgentName, preferBuiltIn);
  }

  let template = null;
  if (agent?.templateId) {
    template = await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } });
  }
  if (!template && templateName) {
    template = await prisma.promptTemplate.findFirst({ where: { userId, name: templateName } });
  }

  const value = { agent, template };
  agentTemplateCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + AGENT_TEMPLATE_CACHE_TTL_MS,
  });

  return value;
}

const MAX_CONCURRENT_AI_CALLS = 4;
let activeAICalls = 0;
const aiCallQueue = [];

export async function withConcurrencyLimit(fn, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeAICalls++;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        reject(new Error(`AI request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await fn();
        if (!timedOut) {
          clearTimeout(timeoutId);
          resolve(result);
        }
      } catch (err) {
        if (!timedOut) {
          clearTimeout(timeoutId);
          reject(err);
        }
      } finally {
        activeAICalls--;
        if (aiCallQueue.length > 0) {
          const next = aiCallQueue.shift();
          next();
        }
      }
    };

    if (activeAICalls < MAX_CONCURRENT_AI_CALLS) {
      execute();
    } else {
      aiCallQueue.push(execute);
    }
  });
}

export async function trackUsage(prisma, userId, jobId, provider, model, usage) {
  if (!usage) return;
  const price = await prisma.modelPrice.findUnique({
    where: { provider_model: { provider, model } },
  });
  const estimatedCost = price
    ? (usage.promptTokens * price.promptTokenPrice + usage.completionTokens * price.completionTokenPrice) / 1000000
    : null;
  
  try {
    await prisma.usageRecord.create({
      data: { userId, jobId, provider, model, ...usage, estimatedCost },
    });
  } catch (err) {
    if (err.code === 'P2002') return;
    throw err;
  }
}

export function parseJsonOutput(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    return { raw: content, parseError: error.message };
  }
}

export function extractJsonCandidate(content) {
  if (typeof content !== 'string') return '';
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fenceMatch ? fenceMatch[1] : content).trim();
  const braceIndex = cleaned.indexOf('{');
  const bracketIndex = cleaned.indexOf('[');
  const startCandidates = [braceIndex, bracketIndex].filter(index => index >= 0);
  if (startCandidates.length === 0) return cleaned;
  const start = Math.min(...startCandidates);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endCandidates = [lastBrace, lastBracket].filter(index => index >= 0);
  const end = endCandidates.length > 0 ? Math.max(...endCandidates) : cleaned.length - 1;
  return cleaned.slice(start, end + 1).trim();
}

/**
 * @param {string} content - Raw AI output
 * @param {Object} [options]
 * @param {boolean} [options.throwOnError=false]
 * @returns {Object|Array}
 */
export function parseModelJson(content, options = {}) {
  const { throwOnError = false } = options;
  
  const candidate = extractJsonCandidate(content);
  
  const sanitizeControlChars = (str) => {
    return str
      .replace(/[\x00-\x1F\x7F]/g, (char) => {
        switch (char) {
          case '\n': return '\\n';
          case '\r': return '\\r';
          case '\t': return '\\t';
          default: return '';
        }
      });
  };
  
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      const sanitized = sanitizeControlChars(candidate);
      return JSON.parse(sanitized);
    } catch (sanitizeError) {
      try {
        const fixed = sanitizeControlChars(candidate)
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
        return JSON.parse(fixed);
      } catch (secondError) {
        try {
          const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (arrayMatch) {
            return JSON.parse(sanitizeControlChars(arrayMatch[0]));
          }
        } catch (thirdError) {
          /* fallthrough */
        }
        
        if (throwOnError) {
          throw new Error(`Failed to parse AI JSON output: ${firstError.message}`);
        }
        return { raw: content, parseError: firstError.message };
      }
    }
  }
}

export function truncateText(content, maxChars) {
  if (typeof content !== 'string') return '';
  if (!maxChars || maxChars <= 0) return content;
  return content.length > maxChars ? content.slice(0, maxChars) : content;
}

export function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
