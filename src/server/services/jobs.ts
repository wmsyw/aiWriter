import { PgBoss } from 'pg-boss';
import { prisma } from '../db';
import {
  resolveJobSchedulingProfile,
  toQueueOptions,
  toSendOptions,
  type JobSendOptions,
} from '@/src/shared/job-scheduling';

const log = (level: string, message: string, data: Record<string, unknown> = {}) => {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [JOBS-SVC] [${level}] ${message}${dataStr}`);
};

export const JobType = {
  OUTLINE_GENERATE: 'OUTLINE_GENERATE',
  NOVEL_SEED: 'NOVEL_SEED',
  OUTLINE_ROUGH: 'OUTLINE_ROUGH',
  OUTLINE_DETAILED: 'OUTLINE_DETAILED',
  OUTLINE_CHAPTERS: 'OUTLINE_CHAPTERS',
  CHARACTER_BIOS: 'CHARACTER_BIOS',
  CHAPTER_GENERATE: 'CHAPTER_GENERATE',
  CHAPTER_GENERATE_BRANCHES: 'CHAPTER_GENERATE_BRANCHES',
  REVIEW_SCORE: 'REVIEW_SCORE',
  DEAI_REWRITE: 'DEAI_REWRITE',
  MEMORY_EXTRACT: 'MEMORY_EXTRACT',
  CONSISTENCY_CHECK: 'CONSISTENCY_CHECK',
  CANON_CHECK: 'CANON_CHECK',
  EMBEDDINGS_BUILD: 'EMBEDDINGS_BUILD',
  IMAGE_GENERATE: 'IMAGE_GENERATE',
  GIT_BACKUP: 'GIT_BACKUP',
  CHARACTER_CHAT: 'CHARACTER_CHAT',
  ARTICLE_ANALYZE: 'ARTICLE_ANALYZE',
  BATCH_ARTICLE_ANALYZE: 'BATCH_ARTICLE_ANALYZE',
  MATERIAL_SEARCH: 'MATERIAL_SEARCH',
  WIZARD_WORLD_BUILDING: 'WIZARD_WORLD_BUILDING',
  WIZARD_CHARACTERS: 'WIZARD_CHARACTERS',
  WIZARD_INSPIRATION: 'WIZARD_INSPIRATION',
  WIZARD_SYNOPSIS: 'WIZARD_SYNOPSIS',
  WIZARD_GOLDEN_FINGER: 'WIZARD_GOLDEN_FINGER',
  CONTEXT_ASSEMBLE: 'CONTEXT_ASSEMBLE',
  HOOKS_EXTRACT: 'HOOKS_EXTRACT',
  CHAPTER_SUMMARY_GENERATE: 'CHAPTER_SUMMARY_GENERATE',
  OUTLINE_ADHERENCE_CHECK: 'OUTLINE_ADHERENCE_CHECK',
  PENDING_ENTITY_EXTRACT: 'PENDING_ENTITY_EXTRACT',
  REVIEW_SCORE_5DIM: 'REVIEW_SCORE_5DIM',
  SCENE_BREAKDOWN: 'SCENE_BREAKDOWN',
  ACT_SUMMARY_GENERATE: 'ACT_SUMMARY_GENERATE',
  PLOT_SIMULATE: 'PLOT_SIMULATE',
  PLOT_BRANCH_GENERATE: 'PLOT_BRANCH_GENERATE',
  MATERIAL_ENHANCE: 'MATERIAL_ENHANCE',
  MATERIAL_DEDUPLICATE: 'MATERIAL_DEDUPLICATE',
  PIPELINE_EXECUTE: 'PIPELINE_EXECUTE',
} as const;

export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

let boss: PgBoss | null = null;
let queuesCreated = false;

export function getJobSendOptions(type: string, overrides: Partial<JobSendOptions> = {}): JobSendOptions {
  return toSendOptions(resolveJobSchedulingProfile(type), overrides);
}

export async function getBoss() {
  if (!boss) {
    log('INFO', 'Initializing pg-boss instance', { DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]' });
    boss = new PgBoss(process.env.DATABASE_URL!);
    boss.on('error', (error) => log('ERROR', 'PgBoss error event', { error: error.message }));
    try {
      await boss.start();
      log('INFO', 'PgBoss started successfully');
    } catch (startErr) {
      log('ERROR', 'Failed to start PgBoss', { error: (startErr as Error).message });
      throw startErr;
    }
  }
  if (!queuesCreated) {
    const allQueues = Object.values(JobType);
    log('INFO', 'Creating queues', { count: allQueues.length });
    for (const queue of allQueues) {
      const profile = resolveJobSchedulingProfile(queue);
      await boss.createQueue(queue, toQueueOptions(profile));
    }
    queuesCreated = true;
    log('INFO', 'All queues created');
  }
  return boss;
}

export async function createJob(
  userId: string,
  type: string,
  input: any,
  options: { sendOptions?: Partial<JobSendOptions> } = {}
) {
  log('INFO', 'createJob called', { userId, type });
  
  const job = await prisma.job.create({
    data: { userId, type, status: JobStatus.QUEUED, input },
  });
  log('INFO', 'Job created in DB', { jobId: job.id, type });
  
  const pgBoss = await getBoss();
  
  try {
    const sendOptions = getJobSendOptions(type, options.sendOptions);
    const sendResult = await pgBoss.send(type, { jobId: job.id, userId, input }, sendOptions);
    log('INFO', 'Job enqueued to pg-boss', { jobId: job.id, type, pgBossJobId: sendResult });
  } catch (sendErr) {
    log('ERROR', 'Failed to enqueue job to pg-boss', { jobId: job.id, type, error: (sendErr as Error).message });
    throw sendErr;
  }
  
  return job;
}

export async function getJob(id: string) {
  return prisma.job.findUnique({ where: { id } });
}

export async function listJobs(
  userId: string,
  options?: { limit?: number; cursor?: string }
): Promise<{ jobs: Awaited<ReturnType<typeof prisma.job.findMany>>; nextCursor: string | null }> {
  const limit = options?.limit ?? 50;
  
  const jobs = await prisma.job.findMany({
    where: {
      userId,
      ...(options?.cursor && { id: { lt: options.cursor } }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  
  const hasMore = jobs.length > limit;
  const resultJobs = hasMore ? jobs.slice(0, limit) : jobs;
  const nextCursor = hasMore ? resultJobs[resultJobs.length - 1].id : null;
  
  return { jobs: resultJobs, nextCursor };
}

export async function cancelJob(id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.job.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new Error('Job not found');
    }

    if (
      existing.status === JobStatus.SUCCEEDED ||
      existing.status === JobStatus.FAILED ||
      existing.status === JobStatus.CANCELED
    ) {
      return tx.job.findUnique({ where: { id } });
    }

    return tx.job.update({
      where: { id },
      data: { status: JobStatus.CANCELED, error: null },
    });
  });
}
