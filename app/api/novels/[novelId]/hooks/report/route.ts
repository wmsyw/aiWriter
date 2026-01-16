import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getHooksReport } from '@/src/server/services/hooks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  try {
    const report = await getHooksReport(novelId);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: 'Failed to generate hooks report' }, { status: 500 });
  }
}
