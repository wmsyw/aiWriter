import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
    include: { _count: { select: { chapters: true } } },
  });

  if (!novel) {
    return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  }

  return NextResponse.json(novel);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  try {
    const body = await request.json();
    const data = updateSchema.parse(body);

    const novel = await prisma.novel.updateMany({
      where: { id: novelId, userId: session.userId },
      data,
    });

    if (novel.count === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const updated = await prisma.novel.findUnique({ where: { id: novelId } });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update novel' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;

  const result = await prisma.novel.deleteMany({
    where: { id: novelId, userId: session.userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
