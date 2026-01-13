import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.userId;
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let isAborted = false;
  let lastUpdatedAt: Date | null = null;

  req.signal.addEventListener('abort', () => {
    isAborted = true;
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendJobs = async (isInitial = false) => {
        if (isAborted) return;
        
        try {
          const where: { userId: string; updatedAt?: { gt: Date } } = { userId };
          if (!isInitial && lastUpdatedAt) {
            where.updatedAt = { gt: lastUpdatedAt };
          }
          
          const jobs = await prisma.job.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: isInitial ? 50 : 100,
          });
          
          if (jobs.length > 0) {
            lastUpdatedAt = jobs[0].updatedAt;
          }
          
          if (!isAborted && (isInitial || jobs.length > 0)) {
            const data = `event: jobs\ndata: ${JSON.stringify({ jobs, isInitial })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        } catch (error) {
          console.error('SSE job fetch error:', error);
        }
      };

      await sendJobs(true);

      intervalId = setInterval(() => sendJobs(false), 5000);
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
