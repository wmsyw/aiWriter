import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/src/server/auth/session';
import { getJob, cancelJob } from '@/src/server/services/jobs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const updatedJob = await cancelJob(jobId);
    return NextResponse.json(updatedJob);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
