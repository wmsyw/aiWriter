import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/src/server/auth/session';
import { prisma } from '@/src/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const article = await prisma.articleAnalysis.findFirst({
    where: { id, userId: session.userId },
  });

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  return NextResponse.json(article);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const article = await prisma.articleAnalysis.findFirst({
    where: { id, userId: session.userId },
  });

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  await prisma.articleAnalysis.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
