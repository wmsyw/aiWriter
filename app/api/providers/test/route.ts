import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { decryptApiKey } from '@/src/server/crypto';
import { createAdapter, getProviderBaseURL, getProviderCapabilities } from '@/src/server/adapters/providers';

const testSchema = z.object({
  providerId: z.string().min(1).optional(),
  providerType: z.string().min(1),
  baseURL: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasKey = typeof data.apiKey === 'string' && data.apiKey.trim().length > 0;
  const hasProviderId = typeof data.providerId === 'string' && data.providerId.trim().length > 0;
  if (!hasKey && !hasProviderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKey'],
      message: 'API key is required',
    });
  }
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = testSchema.parse(body);

    const apiKeyInput = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
    let apiKey = apiKeyInput;
    let baseURL = data.baseURL;
    let providerType = data.providerType;
    let testModel = data.model;

    if (!apiKey) {
      if (!data.providerId) {
        throw new Error('API key is required');
      }
      const config = await prisma.providerConfig.findFirst({
        where: { id: data.providerId, userId: session.userId },
      });
      if (!config) {
        return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
      }
      apiKey = decryptApiKey(config.apiKeyCiphertext);
      baseURL = baseURL || config.baseURL || undefined;
      const models = Array.isArray(config.models) ? config.models.filter((model): model is string => typeof model === 'string') : [];
      testModel = testModel || config.defaultModel || models[0] || undefined;
      providerType = providerType || config.providerType;
    }

    const resolvedBaseURL = getProviderBaseURL(providerType, baseURL);
    const adapter = await createAdapter(providerType, apiKey, resolvedBaseURL);

    const finalModel = testModel || getDefaultTestModel(providerType);

    const startTime = Date.now();
    const response = await adapter.generate(
      { providerType, baseURL: resolvedBaseURL, defaultModel: finalModel } as Parameters<typeof adapter.generate>[0],
      {
        messages: [{ role: 'user', content: 'Say "Connection successful" in exactly 2 words.' }],
        model: finalModel,
        temperature: 0,
        maxTokens: 10,
      }
    );
    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: '连接成功',
      latency,
      model: finalModel,
      response: response.content?.slice(0, 50),
      capabilities: getProviderCapabilities(providerType, finalModel, {
        supportsStreaming: adapter.supportsStreaming,
        supportsTools: adapter.supportsTools,
        supportsVision: adapter.supportsVision,
        supportsEmbeddings: adapter.supportsEmbeddings,
        supportsImageGen: adapter.supportsImageGen,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 400 });
  }
}

function getDefaultTestModel(providerType: string): string {
  switch (providerType) {
    case 'openai':
      return 'gpt-5-mini';
    case 'claude':
      return 'claude-sonnet-4-5-20250929';
    case 'gemini':
      return 'gemini-3-flash-preview';
    default:
      return 'gpt-5-mini';
  }
}
