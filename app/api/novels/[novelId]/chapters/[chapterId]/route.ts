import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const POST_GENERATION_JOB_TYPES = [
  'MEMORY_EXTRACT',
  'HOOKS_EXTRACT',
  'PENDING_ENTITY_EXTRACT',
  'CHAPTER_SUMMARY_GENERATE',
] as const;

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  generationStage: z.string().optional(),
  reviewIterations: z.number().int().min(0).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
    select: { id: true, genre: true },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, novelId },
  });

  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const isFanfiction = novel.genre?.includes('同人') || false;
  const postGenerationJobs = await prisma.job.findMany({
    where: {
      userId: session.userId,
      type: { in: [...POST_GENERATION_JOB_TYPES] },
      input: { path: ['chapterId'], equals: chapterId },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      type: true,
      status: true,
      error: true,
      updatedAt: true,
    },
    take: 40,
  });

  return NextResponse.json({
    chapter,
    novel: { id: novel.id, genre: novel.genre, isFanfiction },
    postGenerationJobs,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId, chapterId } = await params;

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const body = await request.json();
    const data = updateSchema.parse(body);

    const chapter = await prisma.chapter.update({
      where: { id: chapterId, novelId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ chapter });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update chapter' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  await prisma.chapter.delete({
    where: { id: chapterId, novelId },
  });

  return NextResponse.json({ success: true });
}
