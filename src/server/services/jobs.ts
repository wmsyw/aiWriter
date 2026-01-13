import { PgBoss } from 'pg-boss';
import { prisma } from '../db';

export const JobType = {
  OUTLINE_GENERATE: 'OUTLINE_GENERATE',
  CHAPTER_GENERATE: 'CHAPTER_GENERATE',
  CHAPTER_GENERATE_BRANCHES: 'CHAPTER_GENERATE_BRANCHES',
  REVIEW_SCORE: 'REVIEW_SCORE',
  DEAI_REWRITE: 'DEAI_REWRITE',
  MEMORY_EXTRACT: 'MEMORY_EXTRACT',
  CONSISTENCY_CHECK: 'CONSISTENCY_CHECK',
  EMBEDDINGS_BUILD: 'EMBEDDINGS_BUILD',
  IMAGE_GENERATE: 'IMAGE_GENERATE',
  GIT_BACKUP: 'GIT_BACKUP',
  CHARACTER_CHAT: 'CHARACTER_CHAT',
  ARTICLE_ANALYZE: 'ARTICLE_ANALYZE',
  BATCH_ARTICLE_ANALYZE: 'BATCH_ARTICLE_ANALYZE',
  WORKFLOW_EXECUTE: 'WORKFLOW_EXECUTE',
} as const;

export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

let boss: PgBoss | null = null;

export async function getBoss() {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
  }
  return boss;
}

export async function createJob(userId: string, type: string, input: any) {
  const job = await prisma.job.create({
    data: { userId, type, status: JobStatus.QUEUED, input },
  });
  const pgBoss = await getBoss();
  await pgBoss.send(type, { jobId: job.id, userId, input }, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
  return job;
}

export async function getJob(id: string) {
  return prisma.job.findUnique({ where: { id } });
}

export async function listJobs(userId: string) {
  return prisma.job.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function cancelJob(id: string) {
  return prisma.job.update({ where: { id }, data: { status: JobStatus.CANCELED } });
}
