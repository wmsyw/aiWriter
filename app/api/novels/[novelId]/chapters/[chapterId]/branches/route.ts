import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { getBranches, selectBranch } from '@/src/server/services/versioning';
import { enqueuePostGenerationJobs } from '@/src/server/services/post-generation-jobs';
import { z } from 'zod';
import { assessChapterContinuity } from '@/src/shared/chapter-continuity-gate';
import { normalizeBranchCandidates } from '@/src/shared/chapter-branch-review';
import { resolveContinuityGateConfig } from '@/src/shared/continuity-gate-config';

const selectBranchSchema = z.object({
  versionId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { novelId, chapterId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const continuityGateConfig = resolveContinuityGateConfig(novel.workflowConfig);
  const [branches, rawPreviousChapters, chapterSummaries] = await Promise.all([
    getBranches(chapterId),
    prisma.chapter.findMany({
      where: { novelId, order: { lt: chapter.order } },
      orderBy: { order: 'desc' },
      take: 6,
      select: {
        order: true,
        title: true,
        content: true,
      },
    }),
    prisma.chapterSummary.findMany({
      where: { novelId, chapterNumber: { lt: chapter.order } },
      orderBy: { chapterNumber: 'desc' },
      take: 20,
      select: {
        chapterNumber: true,
        oneLine: true,
        keyEvents: true,
        characterDevelopments: true,
        hooksPlanted: true,
        hooksReferenced: true,
        hooksResolved: true,
      },
    }),
  ]);

  const previousChapters = [...rawPreviousChapters].sort((a, b) => a.order - b.order);
  const branchesWithContinuity = branches.map((branch) => {
    const continuity = assessChapterContinuity(
      branch.content,
      previousChapters,
      chapterSummaries,
      {
        passScore: continuityGateConfig.passScore,
        rejectScore: continuityGateConfig.rejectScore,
      }
    );

    return {
      ...branch,
      continuityScore: continuity.score,
      continuityVerdict: continuity.verdict,
      continuityIssues: continuity.issues.slice(0, 2).map((issue) => issue.message),
    };
  });

  const branchesForDisplay = normalizeBranchCandidates(branchesWithContinuity);

  return NextResponse.json({
    branches: branchesForDisplay,
    continuityGate: {
      passScore: continuityGateConfig.passScore,
      rejectScore: continuityGateConfig.rejectScore,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; chapterId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { novelId, chapterId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = selectBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await selectBranch(chapterId, parsed.data.versionId);
    const updatedChapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        content: true,
        generationStage: true,
        reviewIterations: true,
        updatedAt: true,
      },
    });
    const postProcess = await enqueuePostGenerationJobs(session.userId, chapterId);
    const analysisQueueError = postProcess.failed.length
      ? postProcess.failed.map((item) => `${item.type}: ${item.error}`).join('; ')
      : null;
    const analysisQueued = postProcess.allQueued;
    return NextResponse.json({
      success: true,
      analysisQueued,
      analysisQueueError,
      postProcess,
      content: updatedChapter?.content || '',
      chapter: updatedChapter || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
