import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser, auditRequest } from '@/src/server/middleware/audit';
import { encryptApiKey } from '@/src/server/crypto';
import { AuditActions } from '@/src/server/services/audit';
import { getProviderBaseURL, getProviderCapabilities } from '@/src/server/adapters/providers';
import { verifyCsrf } from '@/src/server/middleware/csrf';

const createSchema = z.object({
  name: z.string().min(1),
  providerType: z.string().min(1),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1, { message: '请选择默认模型' }),
  models: z.array(z.string()).min(1, { message: '请至少添加一个模型' }),
});

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configs = await prisma.providerConfig.findMany({
    where: { userId: session.userId },
    select: {
      id: true,
      name: true,
      providerType: true,
      baseURL: true,
      defaultModel: true,
      models: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const configsWithCapabilities = configs.map((config) => {
    const models = Array.isArray(config.models)
      ? config.models.filter((model): model is string => typeof model === 'string')
      : [];
    const capabilityModel = config.defaultModel || models[0];
    return {
      ...config,
      capabilities: getProviderCapabilities(config.providerType, capabilityModel),
    };
  });

  return NextResponse.json({ configs: configsWithCapabilities });
}

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const encryptedKey = encryptApiKey(data.apiKey);
    const baseURL = data.baseURL || getProviderBaseURL(data.providerType);

    const config = await prisma.providerConfig.create({
      data: {
        userId: session.userId,
        name: data.name,
        providerType: data.providerType,
        baseURL,
        apiKeyCiphertext: encryptedKey,
        defaultModel: data.defaultModel,
        models: data.models || [],
      },
    });

    await auditRequest(request, AuditActions.PROVIDER_CREATE, 'provider_config', {
      resourceId: config.id,
      metadata: { name: data.name, providerType: data.providerType },
    });

    return NextResponse.json({
      id: config.id,
      name: config.name,
      providerType: config.providerType,
      baseURL: config.baseURL,
      defaultModel: config.defaultModel,
      models: config.models,
      capabilities: getProviderCapabilities(config.providerType, config.defaultModel || data.models[0]),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create provider config' }, { status: 500 });
  }
}
