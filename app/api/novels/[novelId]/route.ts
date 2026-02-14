import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import {
  mergeCreativeIntentIntoWorkflowConfig,
  normalizeCreativeIntent,
  withCreativeIntentField,
} from '@/src/server/services/creative-intent';

type JsonRecord = Record<string, unknown>;

function asObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as JsonRecord) };
}

function mergeObjectsDeep(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const next: JsonRecord = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = next[key];
    if (
      patchValue &&
      typeof patchValue === 'object' &&
      !Array.isArray(patchValue) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      next[key] = mergeObjectsDeep(
        asObject(baseValue),
        asObject(patchValue)
      );
      continue;
    }
    next[key] = patchValue;
  }

  return next;
}

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

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  outline: z.string().optional(),
  outlineRough: z.any().optional(),
  outlineDetailed: z.any().optional(),
  outlineChapters: z.any().optional(),
  outlineStage: z.enum(['none', 'rough', 'detailed', 'chapters']).optional(),
  theme: z.string().optional(),
  genre: z.string().optional(),
  targetWords: z.number().int().min(1).optional(),
  chapterCount: z.number().int().min(1).optional(),
  protagonist: z.string().optional(),
  worldSetting: z.string().optional(),
  worldTimePeriod: z.string().optional(),
  worldLocation: z.string().optional(),
  worldAtmosphere: z.string().optional(),
  worldRules: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  specialRequirements: z.string().optional(),
  creativeIntent: z.string().optional(),
  outlineMode: z.enum(['simple', 'detailed']).optional(),
  wizardStatus: z.enum(['draft', 'in_progress', 'completed']).optional(),
  wizardStep: z.number().int().min(0).optional(),
  inspirationData: z.record(z.string(), z.unknown()).optional(),
  workflowConfig: workflowConfigSchema.optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
    include: { _count: { select: { chapters: true } } },
  });

  if (!novel) {
    return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  }

  return NextResponse.json(withCreativeIntentField(novel));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  try {
    const body = await request.json();
    const data = updateSchema.parse(body);
    const { creativeIntent, workflowConfig, ...rest } = data;
    const existing = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
      select: { id: true, workflowConfig: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const normalizedCreativeIntent = normalizeCreativeIntent(creativeIntent);
    const shouldUpdateCreativeIntent = creativeIntent !== undefined;
    const shouldUpdateWorkflowConfig = workflowConfig !== undefined;
    const mergedWorkflowConfig = shouldUpdateWorkflowConfig
      ? mergeObjectsDeep(
          asObject(existing.workflowConfig),
          workflowConfig as JsonRecord
        )
      : asObject(existing.workflowConfig);
    let workflowConfigUpdate:
      | Prisma.InputJsonValue
      | typeof Prisma.JsonNull
      | undefined;

    if (shouldUpdateCreativeIntent) {
      workflowConfigUpdate = mergeCreativeIntentIntoWorkflowConfig(
        mergedWorkflowConfig as Prisma.JsonValue,
        normalizedCreativeIntent
      );
    } else if (shouldUpdateWorkflowConfig) {
      workflowConfigUpdate = Object.keys(mergedWorkflowConfig).length > 0
        ? (mergedWorkflowConfig as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(rest, key);
    const updateData = {
      ...rest,
      inspirationData: hasOwn('inspirationData')
        ? (rest.inspirationData ? (rest.inspirationData as Prisma.InputJsonValue) : Prisma.JsonNull)
        : undefined,
      outlineRough: hasOwn('outlineRough')
        ? (rest.outlineRough === null ? Prisma.JsonNull : (rest.outlineRough as Prisma.InputJsonValue))
        : undefined,
      outlineDetailed: hasOwn('outlineDetailed')
        ? (rest.outlineDetailed === null ? Prisma.JsonNull : (rest.outlineDetailed as Prisma.InputJsonValue))
        : undefined,
      outlineChapters: hasOwn('outlineChapters')
        ? (rest.outlineChapters === null ? Prisma.JsonNull : (rest.outlineChapters as Prisma.InputJsonValue))
        : undefined,
      workflowConfig: workflowConfigUpdate,
    };

    const novel = await prisma.novel.update({
      where: { id: existing.id },
      data: updateData,
    });
    return NextResponse.json(withCreativeIntentField(novel));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update novel' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  const result = await prisma.novel.deleteMany({
    where: { id: novelId, userId: session.userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
