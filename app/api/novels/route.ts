import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

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
  outlineMode: z.enum(['simple', 'detailed']).optional(),
  inspirationData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const novels = await prisma.novel.findMany({
    where: { userId: session.userId },
    include: { chapters: { select: { id: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ novels });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { title, description, type, theme, genre, targetWords, chapterCount, protagonist, worldSetting, keywords, specialRequirements, outlineMode, inspirationData } = parsed.data;

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
        wizardStatus: 'draft',
        wizardStep: 0,
      },
    });

    return NextResponse.json({ novel });
  } catch (error) {
    console.error('Failed to create novel:', error);
    return NextResponse.json({ error: 'Failed to create novel' }, { status: 500 });
  }
}
