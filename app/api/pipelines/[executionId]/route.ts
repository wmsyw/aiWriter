import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { Orchestrator } from '@/src/server/orchestrator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { executionId } = await params;
  const orchestrator = new Orchestrator();
  const state = await orchestrator.getState(executionId);

  if (!state) {
    return Response.json({ error: 'Execution not found' }, { status: 404 });
  }

  if (state.userId !== session.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json({
    executionId: state.executionId,
    pipelineType: state.pipelineType,
    novelId: state.novelId,
    chapterId: state.chapterId,
    status: state.status,
    currentStageId: state.currentStageId,
    stageIndex: state.stageIndex,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    durationMs: state.durationMs,
    error: state.error,
    history: state.history.map(h => ({
      stageId: h.stageId,
      stageName: h.stageName,
      status: h.status,
      retryCount: h.retryCount,
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      durationMs: h.durationMs,
      error: h.error,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { action: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body;
  if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
    return Response.json(
      { error: 'Invalid action. Must be: pause, resume, or cancel' },
      { status: 400 }
    );
  }

  const { executionId } = await params;
  const orchestrator = new Orchestrator();
  const state = await orchestrator.getState(executionId);

  if (!state) {
    return Response.json({ error: 'Execution not found' }, { status: 404 });
  }

  if (state.userId !== session.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    switch (action) {
      case 'pause':
        await orchestrator.pause(executionId);
        return Response.json({ success: true, status: 'paused' });
      
      case 'resume':
        const result = await orchestrator.resume(executionId);
        return Response.json({ success: true, status: result.status, output: result.output });
      
      case 'cancel':
        await orchestrator.cancel(executionId);
        return Response.json({ success: true, status: 'cancelled' });
      
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
