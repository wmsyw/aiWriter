import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { getBranches, selectBranch } from '@/src/server/services/versioning';
import { createJob, JobType } from '@/src/server/services/jobs';
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
    let analysisQueued = true;
    let analysisQueueError: string | null = null;
    try {
      await createJob(session.userId, JobType.MEMORY_EXTRACT, { chapterId });
    } catch (error) {
      analysisQueued = false;
      analysisQueueError = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to enqueue memory extract', analysisQueueError);
    }
    return NextResponse.json({ success: true, analysisQueued, analysisQueueError });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
