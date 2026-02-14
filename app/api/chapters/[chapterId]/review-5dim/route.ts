import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob, JobType } from '@/src/server/services/jobs';

const triggerReviewSchema = z.object({
  passThreshold: z.number().min(1).max(10).optional().default(7.0),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { chapterId } = await params;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId },
    include: { novel: { select: { userId: true } } },
  });

  if (!chapter || chapter.novel.userId !== session.userId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const chapterData = chapter as unknown as Record<string, unknown>;
  const reviewFeedback = chapterData.reviewFeedback;

  return NextResponse.json({
    hasReview: !!reviewFeedback,
    feedback: reviewFeedback ?? null,
    pendingReview: chapterData.pendingReview ?? false,
    lastReviewAt: chapterData.lastReviewAt ?? null,
    approvedAt: chapterData.approvedAt ?? null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { chapterId } = await params;

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId },
      include: { novel: { select: { id: true, userId: true } } },
    });

    if (!chapter || chapter.novel.userId !== session.userId) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    if (!chapter.content || chapter.content.trim().length < 100) {
      return NextResponse.json({ 
        error: 'Chapter content is too short for review' 
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const data = triggerReviewSchema.parse(body);

    const job = await createJob(session.userId, JobType.REVIEW_SCORE_5DIM, {
      chapterId,
      novelId: chapter.novel.id,
      passThreshold: data.passThreshold,
    });

    return NextResponse.json({ 
      message: 'Review job queued',
      jobId: job.id,
      chapterId,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to trigger review' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { chapterId } = await params;

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId },
      include: { novel: { select: { userId: true } } },
    });

    if (!chapter || chapter.novel.userId !== session.userId) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const body = await request.json();
    const action = z.enum(['approve', 'reject']).parse(body.action);

    const now = new Date();
    
    if (action === 'approve') {
      await prisma.$executeRaw`UPDATE "Chapter" SET "approvedAt" = ${now}, "pendingReview" = false WHERE id = ${chapterId}`;
      return NextResponse.json({ message: 'Chapter approved', approvedAt: now });
    }

    if (action === 'reject') {
      await prisma.$executeRaw`UPDATE "Chapter" SET "approvedAt" = NULL, "pendingReview" = false WHERE id = ${chapterId}`;
      return NextResponse.json({ message: 'Chapter rejected - awaiting regeneration' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update review status' }, { status: 500 });
  }
}
