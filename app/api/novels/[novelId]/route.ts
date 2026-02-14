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
    const { creativeIntent, ...rest } = data;
    const existing = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
      select: { id: true, workflowConfig: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const normalizedCreativeIntent = normalizeCreativeIntent(creativeIntent);
    const shouldUpdateCreativeIntent = creativeIntent !== undefined;
    const updateData = {
      ...rest,
      inspirationData: rest.inspirationData ? (rest.inspirationData as Prisma.InputJsonValue) : undefined,
      outlineRough: rest.outlineRough ? (rest.outlineRough as Prisma.InputJsonValue) : undefined,
      outlineDetailed: rest.outlineDetailed ? (rest.outlineDetailed as Prisma.InputJsonValue) : undefined,
      outlineChapters: rest.outlineChapters ? (rest.outlineChapters as Prisma.InputJsonValue) : undefined,
      workflowConfig: shouldUpdateCreativeIntent
        ? mergeCreativeIntentIntoWorkflowConfig(existing.workflowConfig, normalizedCreativeIntent)
        : undefined,
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
