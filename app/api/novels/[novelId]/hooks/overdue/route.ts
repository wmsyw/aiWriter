import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getOverdueHooks } from '@/src/server/services/hooks';

const querySchema = z.object({
  currentChapter: z.coerce.number().int().positive(),
  threshold: z.coerce.number().int().positive().optional(),
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
    const query = querySchema.parse({
      currentChapter: searchParams.get('currentChapter'),
      threshold: searchParams.get('threshold') || undefined,
    });

    const warnings = await getOverdueHooks(novelId, query.currentChapter, query.threshold);
    return NextResponse.json({ warnings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch overdue hooks' }, { status: 500 });
  }
}
