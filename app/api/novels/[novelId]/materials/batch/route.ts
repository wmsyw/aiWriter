import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ novelId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Invalid ids array' }, { status: 400 });
  }

  const result = await prisma.material.deleteMany({
    where: {
      id: { in: ids },
      novelId,
      userId: session.userId,
    },
  });

  return NextResponse.json({ deleted: result.count });
}
