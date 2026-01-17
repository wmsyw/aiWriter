import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { createJob } from '@/src/server/services/jobs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ novelId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const { ids } = await req.json();

  if (ids && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: 'Invalid ids array' }, { status: 400 });
  }

  const job = await createJob(
    session.userId,
    'MATERIAL_DEDUPLICATE',
    {
      novelId,
      targetIds: ids
    }
  );

  return NextResponse.json({ job });
}
