import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getPendingEntitiesForNovel, getPendingEntitiesSummary } from '@/src/server/services/pending-entities';

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'merged']).optional(),
  includeSummary: z.coerce.boolean().optional().default(false),
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
      status: searchParams.get('status') || undefined,
      includeSummary: searchParams.get('includeSummary') || false,
    });

    const entities = await getPendingEntitiesForNovel(novelId, query.status);

    if (query.includeSummary) {
      const summary = await getPendingEntitiesSummary(novelId);
      return NextResponse.json({ entities, summary });
    }

    return NextResponse.json({ entities });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch pending entities' }, { status: 500 });
  }
}
