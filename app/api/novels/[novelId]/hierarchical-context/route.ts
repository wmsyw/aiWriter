import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { 
  getHierarchicalContext, 
  formatHierarchicalContextForPrompt,
  detectActBoundaries,
  syncActSummaries
} from '@/src/server/services/hierarchical-summary';

const contextSchema = z.object({
  currentChapter: z.number().int().positive(),
  recentChapterCount: z.number().int().positive().max(10).optional().default(5),
  includeScenes: z.boolean().optional().default(true),
});

const syncSchema = z.object({
  action: z.literal('sync'),
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
    const currentChapter = parseInt(searchParams.get('currentChapter') || '1', 10);
    const recentChapterCount = parseInt(searchParams.get('recentChapterCount') || '5', 10);
    const includeScenes = searchParams.get('includeScenes') !== 'false';

    const context = await getHierarchicalContext(novelId, currentChapter, {
      recentChapterCount,
      includeScenes,
    });

    const formatted = formatHierarchicalContextForPrompt(context);

    return NextResponse.json({ 
      context, 
      formatted,
      actBoundaries: await detectActBoundaries(novelId),
    });
  } catch (error) {
    console.error('Hierarchical context error:', error);
    return NextResponse.json({ error: 'Failed to get hierarchical context' }, { status: 500 });
  }
}

export async function POST(
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
    const body = await request.json();
    
    if (body.action === 'sync') {
      const count = await syncActSummaries(novelId);
      return NextResponse.json({ 
        message: `Synchronized ${count} act summaries`,
        actCount: count,
      });
    }

    if (body.action === 'getContext') {
      const data = contextSchema.parse(body);
      const context = await getHierarchicalContext(novelId, data.currentChapter, {
        recentChapterCount: data.recentChapterCount,
        includeScenes: data.includeScenes,
      });
      return NextResponse.json({ context });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Hierarchical context error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
