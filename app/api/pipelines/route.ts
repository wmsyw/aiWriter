import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { Orchestrator } from '@/src/server/orchestrator';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const novelId = searchParams.get('novelId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const cursor = searchParams.get('cursor') || undefined;

  if (!novelId) {
    return Response.json(
      { error: 'novelId query parameter is required' },
      { status: 400 }
    );
  }

  const orchestrator = new Orchestrator();
  const { executions, nextCursor } = await orchestrator.listExecutions(novelId, { limit, cursor });

  const userExecutions = executions.filter(e => e.userId === session.userId);

  return Response.json({
    executions: userExecutions.map(e => ({
      executionId: e.executionId,
      pipelineType: e.pipelineType,
      novelId: e.novelId,
      chapterId: e.chapterId,
      status: e.status,
      currentStageId: e.currentStageId,
      stageIndex: e.stageIndex,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      durationMs: e.durationMs,
      error: e.error,
    })),
    nextCursor,
    hasMore: nextCursor !== null,
  });
}
