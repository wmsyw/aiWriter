import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';
import {
  mergeCreativeIntentIntoWorkflowConfig,
  normalizeCreativeIntent,
  withCreativeIntentField,
} from '@/src/server/services/creative-intent';

const continuityGateSchema = z.object({
  enabled: z.boolean().optional(),
  passScore: z.number().min(1).max(10).optional(),
  rejectScore: z.number().min(1).max(10).optional(),
  maxRepairAttempts: z.number().int().min(0).max(5).optional(),
});

const workflowConfigSchema = z.object({
  continuityGate: continuityGateSchema.optional(),
  review: z.object({
    passThreshold: z.number().min(1).max(10).optional(),
  }).passthrough().optional(),
}).passthrough();

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['short', 'long']).default('short'),
  theme: z.string().optional(),
  genre: z.string().optional(),
  targetWords: z.number().int().min(1).optional(),
  chapterCount: z.number().int().min(1).optional(),
  protagonist: z.string().optional(),
  worldSetting: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  specialRequirements: z.string().optional(),
  creativeIntent: z.string().optional(),
  outlineMode: z.enum(['simple', 'detailed']).optional(),
  inspirationData: z.record(z.string(), z.unknown()).optional(),
  workflowConfig: workflowConfigSchema.optional(),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResponse = await checkRateLimit(ip, 'novels');
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const novels = await prisma.novel.findMany({
    where: { userId: session.userId },
    include: { chapters: { select: { id: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ novels: novels.map((novel) => withCreativeIntentField(novel)) });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimitResponse = await checkRateLimit(ip, 'novels/create');
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const {
      title,
      description,
      type,
      theme,
      genre,
      targetWords,
      chapterCount,
      protagonist,
      worldSetting,
      keywords,
      specialRequirements,
      creativeIntent,
      outlineMode,
      inspirationData,
      workflowConfig,
    } = parsed.data;
    const normalizedCreativeIntent = normalizeCreativeIntent(creativeIntent);
    const initialWorkflowConfig = workflowConfig
      ? (workflowConfig as Prisma.InputJsonValue)
      : undefined;
    const mergedWorkflowConfig = normalizedCreativeIntent !== undefined
      ? mergeCreativeIntentIntoWorkflowConfig(
          workflowConfig as Prisma.JsonValue | undefined,
          normalizedCreativeIntent
        )
      : initialWorkflowConfig;

    const novel = await prisma.novel.create({
      data: {
        userId: session.userId,
        title,
        description,
        type,
        theme,
        genre,
        targetWords,
        chapterCount,
        protagonist,
        worldSetting,
        keywords: keywords || [],
        specialRequirements,
        outlineMode: outlineMode || 'simple',
        inspirationData: inspirationData ? (inspirationData as Prisma.InputJsonValue) : undefined,
        workflowConfig: mergedWorkflowConfig,
        wizardStatus: 'draft',
        wizardStep: 0,
      },
    });

    return NextResponse.json({ novel: withCreativeIntentField(novel) });
  } catch (error) {
    console.error('Failed to create novel:', error);
    return NextResponse.json({ error: 'Failed to create novel' }, { status: 500 });
  }
}
