import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const querySchema = z.object({
  chapterNumber: z.coerce.number().int().positive().optional(),
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
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  try {
    const { searchParams } = new URL(request.url);
    const chapterNumberParam = searchParams.get('chapterNumber');
    querySchema.parse({
      chapterNumber: chapterNumberParam ?? undefined,
    });

    return NextResponse.json({
      blocked: false,
      pendingEntities: [],
      hasBlocking: false,
      count: 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to check blocking entities' }, { status: 500 });
  }
}
