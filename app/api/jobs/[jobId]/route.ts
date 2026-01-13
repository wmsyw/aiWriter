import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;

  const job = await prisma.job.findFirst({
    where: { 
      id: jobId,
      userId: session.userId 
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
