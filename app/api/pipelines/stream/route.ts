import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { Orchestrator, type PipelineType, getPipeline } from '@/src/server/orchestrator';
import { JobType, getBoss, getJobSendOptions } from '@/src/server/services/jobs';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_PIPELINE_TYPES: PipelineType[] = [
  'novel-setup',
  'outline', 
  'chapter',
  'review',
  'finalize',
];

function isValidPipelineType(type: string): type is PipelineType {
  return VALID_PIPELINE_TYPES.includes(type as PipelineType);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: {
    pipelineType: string;
    novelId: string;
    chapterId?: string;
    config?: Record<string, unknown>;
    input?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { pipelineType, novelId, chapterId, config, input } = body;

  if (!pipelineType || !isValidPipelineType(pipelineType)) {
    return new Response(
      `Invalid pipeline type. Must be one of: ${VALID_PIPELINE_TYPES.join(', ')}`,
      { status: 400 }
    );
  }

  if (!novelId) {
    return new Response('novelId is required', { status: 400 });
  }

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
    select: { id: true },
  });
  if (!novel) {
    return Response.json({ error: 'Novel not found' }, { status: 404 });
  }

  if (chapterId) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true },
    });
    if (!chapter) {
      return Response.json({ error: 'Chapter not found' }, { status: 404 });
    }
  }

  const providerConfigId =
    config && typeof config === 'object' && typeof config.providerConfigId === 'string'
      ? config.providerConfigId
      : undefined;
  if (providerConfigId) {
    const ownedProvider = await prisma.providerConfig.findFirst({
      where: { id: providerConfigId, userId: session.userId },
      select: { id: true },
    });
    if (!ownedProvider) {
      return Response.json({ error: 'Provider config not found' }, { status: 404 });
    }
  }

  const pipeline = getPipeline(pipelineType);
  if (!pipeline) {
    return new Response(`Pipeline not found: ${pipelineType}`, { status: 400 });
  }

  let boss: Awaited<ReturnType<typeof getBoss>>;
  try {
    boss = await getBoss();
  } catch {
    return Response.json(
      { error: 'Job queue is not available', code: 'QUEUE_UNAVAILABLE' },
      { status: 503 }
    );
  }

  let job: { id: string } | null = null;
  let execution: { id: string } | null = null;
  let queueJobId: string | null = null;

  try {
    execution = await prisma.pipelineExecution.create({
      data: {
        novelId,
        chapterId: chapterId ?? null,
        userId: session.userId,
        pipelineType,
        status: 'pending',
        currentStageId: pipeline.stages[0]?.id ?? 'unknown',
        stageIndex: 0,
        config: (config ?? null) as Prisma.InputJsonValue,
        context: (input ?? null) as Prisma.InputJsonValue,
      },
    });

    job = await prisma.job.create({
      data: {
        type: JobType.PIPELINE_EXECUTE,
        status: 'queued',
        userId: session.userId,
        pipelineExecutionId: execution.id,
        input: {
          pipelineType,
          novelId,
          chapterId: chapterId ?? null,
          config: config ?? null,
          pipelineInput: input ?? null,
          executionId: execution.id,
        } as Prisma.InputJsonValue,
      },
    });

    const sendOptions = getJobSendOptions(JobType.PIPELINE_EXECUTE, {
      expireInSeconds: pipelineType === 'chapter' ? 7200 : 3600,
      priority: pipelineType === 'chapter' ? 95 : 88,
    });

    queueJobId = await boss.send(JobType.PIPELINE_EXECUTE, {
      jobId: job.id,
      userId: session.userId,
      input: {
        pipelineType,
        novelId,
        chapterId,
        config,
        pipelineInput: input,
        executionId: execution.id,
      },
    }, sendOptions);

    if (!queueJobId) {
      await prisma.$transaction([
        prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: 'Failed to enqueue job' },
        }),
        prisma.pipelineExecution.update({
          where: { id: execution.id },
          data: { status: 'failed', error: 'Failed to enqueue job' },
        }),
      ]);
      return Response.json(
        { error: 'Failed to enqueue job', code: 'ENQUEUE_FAILED' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (execution) {
      await prisma.pipelineExecution.update({
        where: { id: execution.id },
        data: { 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        },
      }).catch(() => {});
    }
    if (job) {
      await prisma.job.update({
        where: { id: job.id },
        data: { 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        },
      }).catch(() => {});
    }
    throw error;
  }

  return Response.json({
    jobId: job.id,
    executionId: execution.id,
    status: 'queued',
    message: 'Pipeline execution queued. Connect to /api/pipelines/events/{executionId} for real-time updates.',
  });
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const executionId = searchParams.get('executionId');
  const jobId = searchParams.get('jobId');

  if (jobId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.userId !== session.userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    return Response.json({
      jobId: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      output: job.output,
      error: job.error,
    });
  }

  if (executionId) {
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
        durationMs: h.durationMs,
        error: h.error,
      })),
    });
  }

  return Response.json(
    { error: 'Either executionId or jobId query parameter is required' },
    { status: 400 }
  );
}
