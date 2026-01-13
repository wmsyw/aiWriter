import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/src/server/auth/session';
import { prisma } from '@/src/server/db';

const MAX_FIELD_LENGTH = 5000;

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const query = listQuerySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    });

    const [articles, total] = await Promise.all([
      prisma.articleAnalysis.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          title: true,
          genre: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.articleAnalysis.count({ where: { userId: session.userId } }),
    ]);

    return NextResponse.json({ articles, total, limit: query.limit, offset: query.offset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to list articles' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Missing article id' }, { status: 400 });
    }

    const article = await prisma.articleAnalysis.findFirst({
      where: { id, userId: session.userId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    await prisma.articleAnalysis.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
  }
}
