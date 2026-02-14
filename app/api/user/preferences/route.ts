import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/src/server/auth/session';
import { prisma } from '@/src/server/db';
import { encryptApiKey, decryptApiKey } from '@/src/server/crypto';
import { Prisma } from '@prisma/client';

const preferencesSchema = z.object({
  autoSave: z.boolean().optional(),
  wordCount: z.boolean().optional(),
  lineNumbers: z.boolean().optional(),
  defaultWordCount: z.string().optional(),
  writingStyle: z.string().optional(),
  language: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
  webSearchProvider: z.enum(['tavily', 'exa', 'model']).optional(),
  webSearchApiKey: z.string().max(200).optional(),
  defaultProviderId: z.string().optional(),
  defaultModel: z.string().optional(),
});

type Preferences = z.infer<typeof preferencesSchema>;

interface StoredPreferences {
  autoSave?: boolean;
  wordCount?: boolean;
  lineNumbers?: boolean;
  defaultWordCount?: string;
  writingStyle?: string;
  language?: string;
  webSearchEnabled?: boolean;
  webSearchProvider?: 'tavily' | 'exa' | 'model';
  webSearchApiKeyCiphertext?: string;
  defaultProviderId?: string;
  defaultModel?: string;
  [key: string]: Prisma.JsonValue | undefined;
}

const DEFAULT_PREFERENCES: Required<Omit<Preferences, 'webSearchApiKey' | 'defaultProviderId' | 'defaultModel'>> & { webSearchApiKey?: string; defaultProviderId?: string; defaultModel?: string } = {
  autoSave: true,
  wordCount: true,
  lineNumbers: false,
  defaultWordCount: '2000',
  writingStyle: 'popular',
  language: 'zh-CN',
  webSearchEnabled: false,
  webSearchProvider: 'model',
  webSearchApiKey: undefined,
  defaultProviderId: undefined,
  defaultModel: undefined,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSafePreferences(dbValue: unknown): Partial<StoredPreferences> {
  if (!isPlainObject(dbValue)) {
    return {};
  }
  const { webSearchApiKey, ...rest } = dbValue as Record<string, unknown>;
  return rest as Partial<StoredPreferences>;
}

function decryptStoredApiKey(ciphertext: string | undefined): string | undefined {
  if (!ciphertext) return undefined;
  try {
    return decryptApiKey(ciphertext);
  } catch {
    return undefined;
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { preferences: true },
  });

  const savedPreferences = getSafePreferences(user?.preferences);
  const decryptedApiKey = decryptStoredApiKey(savedPreferences.webSearchApiKeyCiphertext);
  
  const { webSearchApiKeyCiphertext, ...prefsWithoutCiphertext } = savedPreferences;
  
  const response: Partial<Preferences> = {
    ...DEFAULT_PREFERENCES,
    ...prefsWithoutCiphertext,
  };
  
  if (decryptedApiKey) {
    response.webSearchApiKey = '********' + decryptedApiKey.slice(-4);
  }

  return NextResponse.json(response);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { preferences: true },
  });

  const existingPreferences = getSafePreferences(user?.preferences);
  
  const { webSearchApiKey, ...otherUpdates } = parsed.data;
  const updatedPreferences: StoredPreferences = { 
    ...existingPreferences, 
    ...otherUpdates 
  };

  const hasDefaultProviderField = Object.prototype.hasOwnProperty.call(parsed.data, 'defaultProviderId');
  const hasDefaultModelField = Object.prototype.hasOwnProperty.call(parsed.data, 'defaultModel');
  const normalizedProviderId = normalizeOptionalString(parsed.data.defaultProviderId);
  const normalizedDefaultModel = normalizeOptionalString(parsed.data.defaultModel);

  if (hasDefaultProviderField) {
    if (normalizedProviderId) {
      const providerExists = await prisma.providerConfig.findFirst({
        where: { id: normalizedProviderId, userId: session.userId },
        select: { id: true },
      });
      if (!providerExists) {
        return NextResponse.json({ error: { formErrors: ['默认服务商不存在或无权限访问'] } }, { status: 400 });
      }
      updatedPreferences.defaultProviderId = normalizedProviderId;
      if (!hasDefaultModelField) {
        delete updatedPreferences.defaultModel;
      }
    } else {
      delete updatedPreferences.defaultProviderId;
      delete updatedPreferences.defaultModel;
    }
  }

  if (hasDefaultModelField) {
    if (normalizedDefaultModel) {
      const effectiveProviderId = normalizeOptionalString(updatedPreferences.defaultProviderId);
      if (!effectiveProviderId) {
        return NextResponse.json({ error: { formErrors: ['请先选择默认服务商，再设置默认模型'] } }, { status: 400 });
      }
      updatedPreferences.defaultModel = normalizedDefaultModel;
    } else {
      delete updatedPreferences.defaultModel;
    }
  }
  
  if (webSearchApiKey !== undefined) {
    if (webSearchApiKey === '' || webSearchApiKey.startsWith('********')) {
      if (webSearchApiKey === '') {
        delete updatedPreferences.webSearchApiKeyCiphertext;
      }
    } else {
      updatedPreferences.webSearchApiKeyCiphertext = encryptApiKey(webSearchApiKey);
    }
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { preferences: updatedPreferences as Prisma.InputJsonValue },
  });

  const { webSearchApiKeyCiphertext, ...responsePrefs } = updatedPreferences;
  const response: Partial<Preferences> = responsePrefs;
  
  if (webSearchApiKeyCiphertext) {
    response.webSearchApiKey = '********';
  }

  return NextResponse.json(response);
}
