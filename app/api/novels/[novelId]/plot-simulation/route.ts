import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { generatePlotBranches, simulatePlotForward, scorePlotPath } from '@/src/server/services/plot-mcts';

const simulateSchema = z.object({
  currentChapter: z.number().int().positive(),
  steps: z.number().int().positive().max(10).optional().default(5),
  iterations: z.number().int().positive().max(500).optional().default(100),
  branchCount: z.number().int().positive().max(5).optional().default(4),
  focusHooks: z.boolean().optional().default(true),
});

const branchSchema = z.object({
  currentChapter: z.number().int().positive(),
  branchCount: z.number().int().positive().max(5).optional().default(3),
  focusHooks: z.boolean().optional().default(true),
});

const scoreSchema = z.object({
  path: z.array(z.string()).min(1),
  currentChapter: z.number().int().positive(),
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
    const rawBranchCount = parseInt(searchParams.get('branchCount') || '3', 10);
    const branchCount = isNaN(rawBranchCount) ? 3 : rawBranchCount;

    const branches = await generatePlotBranches(novelId, currentChapter, {
      branchCount: Math.max(1, Math.min(branchCount, 5)),
      focusHooks: searchParams.get('focusHooks') !== 'false',
    });

    return NextResponse.json({ branches });
  } catch (error) {
    console.error('Plot simulation error:', error);
    return NextResponse.json({ error: 'Failed to generate plot branches' }, { status: 500 });
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
    const action = body.action || 'simulate';

    if (action === 'simulate') {
      const data = simulateSchema.parse(body);
      const result = await simulatePlotForward(
        novelId,
        data.currentChapter,
        {
          steps: data.steps,
          iterations: data.iterations,
          branchCount: data.branchCount,
          focusHooks: data.focusHooks,
        }
      );
      return NextResponse.json(result);
    }

    if (action === 'branches') {
      const data = branchSchema.parse(body);
      const branches = await generatePlotBranches(novelId, data.currentChapter, {
        branchCount: data.branchCount,
        focusHooks: data.focusHooks,
      });
      return NextResponse.json({ branches });
    }

    if (action === 'score') {
      const data = scoreSchema.parse(body);
      const result = await scorePlotPath(data.path, novelId, data.currentChapter);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Plot simulation error:', error);
    return NextResponse.json({ error: 'Failed to simulate plot' }, { status: 500 });
  }
}
