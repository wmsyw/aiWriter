import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PipelineEventWithId = {
  id: string;
  executionId: string;
  pipelineType: string;
  eventType: string;
  data: unknown;
  timestamp: Date;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { executionId } = await params;
  if (!executionId) {
    return new Response('executionId is required', { status: 400 });
  }

  const execution = await prisma.pipelineExecution.findUnique({
    where: { id: executionId },
    select: { userId: true, status: true },
  });

  if (!execution) {
    return new Response('Execution not found', { status: 404 });
  }

  if (execution.userId !== session.userId) {
    return new Response('Forbidden', { status: 403 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let isAborted = false;
  let lastEventId: string | null = null;
  let pollCount = 0;
  const MAX_POLLS = 1200; // 1 hour at 3s intervals

  req.signal.addEventListener('abort', () => {
    isAborted = true;
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvents = async (isInitial = false) => {
        if (isAborted) return;
        pollCount++;

        if (pollCount > MAX_POLLS) {
          controller.close();
          return;
        }

        try {
          const whereClause: {
            executionId: string;
            id?: { gt: string };
          } = { executionId };

          if (lastEventId) {
            whereClause.id = { gt: lastEventId };
          }

          const events = await prisma.pipelineEventLog.findMany({
            where: whereClause,
            orderBy: { timestamp: 'asc' },
            take: 100,
          });

          if (events.length > 0) {
            lastEventId = events[events.length - 1].id;

            for (const event of events) {
              if (isAborted) break;
              const eventData: PipelineEventWithId = {
                id: event.id,
                executionId: event.executionId,
                pipelineType: event.pipelineType,
                eventType: event.eventType,
                data: event.data,
                timestamp: event.timestamp,
              };
              const sseData = `event: ${event.eventType}\ndata: ${JSON.stringify(eventData)}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
          }

          const currentExec = await prisma.pipelineExecution.findUnique({
            where: { id: executionId },
            select: { status: true, error: true, completedAt: true },
          });

          if (currentExec && ['completed', 'failed', 'cancelled'].includes(currentExec.status)) {
            const completeEvent = `event: execution:complete\ndata: ${JSON.stringify({
              executionId,
              status: currentExec.status,
              error: currentExec.error,
              completedAt: currentExec.completedAt,
            })}\n\n`;
            controller.enqueue(encoder.encode(completeEvent));

            if (intervalId) {
              clearInterval(intervalId);
            }
            controller.close();
            return;
          }

          if (isInitial) {
            const initEvent = `event: connected\ndata: ${JSON.stringify({
              executionId,
              message: 'Connected to event stream',
            })}\n\n`;
            controller.enqueue(encoder.encode(initEvent));
          }
        } catch (error) {
          console.error('SSE pipeline event fetch error:', error);
        }
      };

      await sendEvents(true);
      intervalId = setInterval(() => sendEvents(false), 3000);
    },
    cancel() {
      isAborted = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
