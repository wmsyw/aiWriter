import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional().default(''),
  order: z.number().int().min(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;
  
  // SECURITY: Verify novel belongs to user before fetching chapters
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    orderBy: { order: 'asc' },
  });

  return NextResponse.json({ chapters });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId } = await params;
    
    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const body = await request.json();
    const data = createSchema.parse(body);

    const chapter = await prisma.chapter.create({
      data: { novelId, ...data },
    });

    return NextResponse.json({ chapter });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 });
  }
}
