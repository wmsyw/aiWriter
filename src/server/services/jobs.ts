import { PgBoss } from 'pg-boss';
import { prisma } from '../db';

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

export async function getBoss() {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
  }
  if (!queuesCreated) {
    const allQueues = Object.values(JobType);
    for (const queue of allQueues) {
      await boss.createQueue(queue);
    }
    queuesCreated = true;
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
