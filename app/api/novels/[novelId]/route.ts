import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  outline: z.string().optional(),
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

  return NextResponse.json(novel);
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
    const updateData = {
      ...data,
      inspirationData: data.inspirationData ? (data.inspirationData as Prisma.InputJsonValue) : undefined,
    };

    const novel = await prisma.novel.updateMany({
      where: { id: novelId, userId: session.userId },
      data: updateData,
    });

    if (novel.count === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const updated = await prisma.novel.findUnique({ where: { id: novelId } });
    return NextResponse.json(updated);
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
