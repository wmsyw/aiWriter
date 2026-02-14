import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { getBranches, selectBranch } from '@/src/server/services/versioning';
import { enqueuePostGenerationJobs } from '@/src/server/services/post-generation-jobs';
import { z } from 'zod';

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

  const branches = await getBranches(chapterId);
  return NextResponse.json({ branches });
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
    const postProcess = await enqueuePostGenerationJobs(session.userId, chapterId);
    const analysisQueueError = postProcess.failed.length
      ? postProcess.failed.map((item) => `${item.type}: ${item.error}`).join('; ')
      : null;
    const analysisQueued = postProcess.allQueued;
    return NextResponse.json({ success: true, analysisQueued, analysisQueueError, postProcess });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
