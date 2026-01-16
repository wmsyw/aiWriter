import { createAdapter } from '../../src/server/adapters/providers.js';
import { decryptApiKey } from '../../src/server/crypto.js';

export async function getProviderAndAdapter(prisma, userId, providerConfigId) {
  const config = await prisma.providerConfig.findFirst({
    where: providerConfigId ? { id: providerConfigId, userId } : { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!config) throw new Error('No provider configured');
  const apiKey = decryptApiKey(config.apiKeyCiphertext);
  const adapter = await createAdapter(config.providerType, apiKey, config.baseURL || undefined);
  return { config, adapter };
}

export async function resolveAgentAndTemplate(prisma, { userId, agentId, agentName, fallbackAgentName, templateName }) {
  let agent = null;
  if (agentId) {
    agent = await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } });
  }
  if (!agent && agentName) {
    agent = await prisma.agentDefinition.findFirst({ where: { userId, name: agentName }, orderBy: { createdAt: 'desc' } });
  }
  if (!agent && fallbackAgentName) {
    agent = await prisma.agentDefinition.findFirst({ where: { userId, name: fallbackAgentName }, orderBy: { createdAt: 'desc' } });
  }

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : templateName
      ? await prisma.promptTemplate.findFirst({ where: { userId, name: templateName } })
      : null;

  return { agent, template };
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

export function parseModelJson(content) {
  const candidate = extractJsonCandidate(content);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return { raw: content, parseError: error.message };
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
