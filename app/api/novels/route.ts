import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const createSchema = z.object({
  title: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const novels = await prisma.novel.findMany({
    where: { userId: session.userId },
    include: { chapters: { select: { id: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ novels });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { title } = createSchema.parse(body);

    const novel = await prisma.novel.create({
      data: { userId: session.userId, title },
    });

    return NextResponse.json({ novel });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create novel' }, { status: 500 });
  }
}
