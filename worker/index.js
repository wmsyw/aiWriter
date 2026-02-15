import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { JobType } from './types.js';
import { workerLogger } from '../src/core/logger.js';
import { resolveJobSchedulingProfile, toQueueOptions, toWorkerOptions } from '../src/shared/job-scheduling.js';

const log = workerLogger;

log.info('Worker module loaded', { 
  APP_MODE: process.env.APP_MODE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
  APP_ENCRYPTION_KEY_B64: process.env.APP_ENCRYPTION_KEY_B64 ? '[SET]' : '[NOT SET]'
});

import { handleChapterGenerate, handleChapterGenerateBranches } from './processors/chapter.js';
import { handleOutlineRough, handleOutlineDetailed, handleOutlineChapters, handleOutlineGenerate } from './processors/outline.js';
import { handleReviewScore, handleConsistencyCheck, handleCanonCheck } from './processors/review.js';
import { handleCharacterBios, handleCharacterChat, handleWizardCharacters } from './processors/character.js';
import { handleNovelSeed, handleWizardWorldBuilding, handleWizardInspiration, handleWizardSynopsis, handleWizardGoldenFinger } from './processors/novel.js';
import { handleMemoryExtract, handleDeaiRewrite, handleGitBackup } from './processors/utility.js';
import { handleMaterialSearch, handleMaterialEnhance, handleMaterialDeduplicate } from './processors/material.js';
import { 
  handleContextAssemble, 
  handleChapterSummaryGenerate, 
  handleHooksExtract, 
  handlePendingEntityExtract, 
  handleOutlineAdherenceCheck,
  handleReviewScore5Dim,
  handleSceneBreakdown,
  handleActSummaryGenerate,
  handlePlotSimulate,
  handlePlotBranchGenerate
} from './processors/workflow.js';
import { handlePipelineExecute } from './processors/pipeline.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const handlers = {
  [JobType.CHAPTER_GENERATE]: handleChapterGenerate,
  [JobType.CHAPTER_GENERATE_BRANCHES]: handleChapterGenerateBranches,
  [JobType.OUTLINE_ROUGH]: handleOutlineRough,
  [JobType.OUTLINE_DETAILED]: handleOutlineDetailed,
  [JobType.OUTLINE_CHAPTERS]: handleOutlineChapters,
  [JobType.OUTLINE_GENERATE]: handleOutlineGenerate,
  [JobType.REVIEW_SCORE]: handleReviewScore,
  [JobType.CONSISTENCY_CHECK]: handleConsistencyCheck,
  [JobType.CANON_CHECK]: handleCanonCheck,
  [JobType.CHARACTER_BIOS]: handleCharacterBios,
  [JobType.CHARACTER_CHAT]: handleCharacterChat,
  [JobType.WIZARD_CHARACTERS]: handleWizardCharacters,
  [JobType.NOVEL_SEED]: handleNovelSeed,
  [JobType.WIZARD_WORLD_BUILDING]: handleWizardWorldBuilding,
  [JobType.WIZARD_INSPIRATION]: handleWizardInspiration,
  [JobType.WIZARD_SYNOPSIS]: handleWizardSynopsis,
  [JobType.WIZARD_GOLDEN_FINGER]: handleWizardGoldenFinger,
  [JobType.MEMORY_EXTRACT]: handleMemoryExtract,
  [JobType.DEAI_REWRITE]: handleDeaiRewrite,
  [JobType.GIT_BACKUP]: handleGitBackup,
  [JobType.MATERIAL_SEARCH]: handleMaterialSearch,
  [JobType.MATERIAL_ENHANCE]: handleMaterialEnhance,
  [JobType.MATERIAL_DEDUPLICATE]: handleMaterialDeduplicate,
  [JobType.CONTEXT_ASSEMBLE]: handleContextAssemble,
  [JobType.CHAPTER_SUMMARY_GENERATE]: handleChapterSummaryGenerate,
  [JobType.HOOKS_EXTRACT]: handleHooksExtract,
  [JobType.PENDING_ENTITY_EXTRACT]: handlePendingEntityExtract,
  [JobType.OUTLINE_ADHERENCE_CHECK]: handleOutlineAdherenceCheck,
  [JobType.REVIEW_SCORE_5DIM]: handleReviewScore5Dim,
  [JobType.SCENE_BREAKDOWN]: handleSceneBreakdown,
  [JobType.ACT_SUMMARY_GENERATE]: handleActSummaryGenerate,
  [JobType.PLOT_SIMULATE]: handlePlotSimulate,
  [JobType.PLOT_BRANCH_GENERATE]: handlePlotBranchGenerate,
  [JobType.PIPELINE_EXECUTE]: handlePipelineExecute,
};

const placeholderHandler = async () => ({ status: 'not_implemented' });
const placeholderTypes = [
  JobType.ARTICLE_ANALYZE,
  JobType.BATCH_ARTICLE_ANALYZE,
  JobType.EMBEDDINGS_BUILD,
  JobType.IMAGE_GENERATE,
];

async function cleanupZombieExecutions() {
  log.info('Cleaning up zombie pipeline executions...');
  
  try {
    const zombieThreshold = new Date(Date.now() - 3 * 60 * 60 * 1000);
    
    const updated = await prisma.$executeRaw`
      UPDATE "PipelineExecution" 
      SET status = 'failed', 
          error = 'Worker restart - execution was interrupted',
          "completedAt" = NOW()
      WHERE status = 'running' 
        AND "startedAt" < ${zombieThreshold}
    `;
    
    if (updated > 0) {
      log.info('Cleaned up zombie executions', { count: updated });
    }
    
    const jobsUpdated = await prisma.job.updateMany({
      where: {
        status: 'running',
        updatedAt: { lt: zombieThreshold },
      },
      data: {
        status: 'failed',
        error: 'Worker restart - job was interrupted',
      },
    });
    
    if (jobsUpdated.count > 0) {
      log.info('Cleaned up zombie jobs', { count: jobsUpdated.count });
    }
  } catch (err) {
    log.warn('Failed to cleanup zombie executions', { error: err.message });
  }
}

async function handleJob([job]) {
  if (!job) {
    log.warn('Empty job array received');
    return;
  }
  
  const { id: pgBossJobId, name: jobType, data: jobData } = job;
  const jobLogger = log.child({ pgBossJobId, jobType });
  
  jobLogger.info('Job picked up', { inputPreview: JSON.stringify(jobData || {}).slice(0, 200) });
  
  if (!jobData || typeof jobData !== 'object') {
    jobLogger.error('Job data is missing or invalid', { jobData });
    throw new Error('Job data is missing or invalid');
  }
  
  const { jobId, userId, input } = jobData;
  
  if (!jobId) {
    jobLogger.error('jobId is missing from job data', { jobDataKeys: Object.keys(jobData) });
    throw new Error('jobId is missing from job data');
  }

  const taskLogger = log.child({ pgBossJobId, jobType, jobId, userId });
  taskLogger.info('Processing job');

  const preflightJob = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  if (!preflightJob) {
    taskLogger.warn('Job record not found before execution');
    return { status: 'missing' };
  }
  if (preflightJob.status === 'canceled') {
    taskLogger.info('Job already canceled before execution, skipping');
    return { status: 'canceled' };
  }

  try {
    const runningUpdate = await prisma.job.updateMany({
      where: { id: jobId, status: { in: ['queued', 'running'] } },
      data: { status: 'running', error: null },
    });
    if (runningUpdate.count === 0) {
      const latest = await prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      taskLogger.info('Skip execution due to non-runnable state', { status: latest?.status });
      return { status: latest?.status || 'unknown' };
    }
    taskLogger.info('Job marked as running');
  } catch (updateErr) {
    taskLogger.warn('Failed to mark job as running', {}, updateErr);
  }

  try {
    const handler = handlers[jobType];
    let result;
    
    if (handler) {
      taskLogger.info('Executing handler');
      result = await handler(prisma, job, { jobId, userId, input });
      taskLogger.info('Handler completed successfully');
    } else if (placeholderTypes.includes(jobType)) {
      taskLogger.warn('Using placeholder handler');
      result = await placeholderHandler();
    } else {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    try {
      const latestBeforeSuccess = await prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (latestBeforeSuccess?.status === 'canceled') {
        taskLogger.warn('Job was canceled during execution, keeping canceled status');
        return { status: 'canceled', output: result ?? null };
      }

      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'succeeded', 
          output: result ?? null,
        },
      });
      taskLogger.info('Job succeeded');
    } catch (updateErr) {
      taskLogger.error('Failed to mark job as succeeded', {}, updateErr);
    }

    return result;
  } catch (error) {
    taskLogger.error('Job failed', { errorMessage: error.message }, error);

    const latestBeforeFail = await prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (latestBeforeFail?.status === 'canceled') {
      taskLogger.warn('Job errored after cancellation, keeping canceled status');
      return { status: 'canceled' };
    }
    
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'failed', 
          error: error.message || 'Unknown error',
        },
      });
    } catch (updateErr) {
      taskLogger.error('Failed to mark job as failed in DB', {}, updateErr);
    }
    
    throw error;
  }
}

async function startWorker() {
  log.info('Starting worker');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log.error('DATABASE_URL is not set - worker cannot start');
    process.exit(1);
  }
  
  const dbHost = dbUrl.split('@')[1]?.split('/')[0] || '[hidden]';
  log.info('Connecting to pg-boss', { dbHost });
  
  const boss = new PgBoss(dbUrl);
  
  boss.on('error', error => {
    log.error('PgBoss internal error', {}, error);
  });
  
  boss.on('monitor-states', states => {
    log.debug('PgBoss monitor-states', states);
  });
  
  const setupGracefulShutdown = () => {
    let isShuttingDown = false;
    
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      
      log.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        await boss.stop({ graceful: true, timeout: 60000 });
        log.info('PgBoss stopped gracefully');
        
        await prisma.$disconnect();
        log.info('Prisma disconnected');
        
        await pool.end();
        log.info('PostgreSQL pool closed');
        
        process.exit(0);
      } catch (err) {
        log.error('Error during graceful shutdown', {}, err);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };
  
  try {
    await boss.start();
    log.info('PgBoss started successfully');
    setupGracefulShutdown();
  } catch (startErr) {
    log.error('Failed to start PgBoss', {}, startErr);
    process.exit(1);
  }
  
  await cleanupZombieExecutions();
  
  const allQueues = Object.values(JobType);
  log.info('Creating queues', { count: allQueues.length });
  
  for (const queue of allQueues) {
    try {
      const profile = resolveJobSchedulingProfile(queue);
      await boss.createQueue(queue, toQueueOptions(profile));
      log.debug('Queue created', { queue, profile });
    } catch (queueErr) {
      log.warn('Queue creation issue', { queue, error: queueErr.message });
    }
  }
  
  for (const queue of allQueues) {
    try {
      const profile = resolveJobSchedulingProfile(queue);
      await boss.work(queue, toWorkerOptions(profile), handleJob);
      log.info('Subscribed to queue', { queue });
    } catch (workErr) {
      log.error('Failed to subscribe to queue', { queue }, workErr);
    }
  }
  
  log.info('Worker started - listening for jobs');
}

if (process.env.APP_MODE === 'worker') {
  log.info('APP_MODE=worker detected, starting worker process');
  startWorker().catch(err => {
    log.error('Fatal: Failed to start worker', {}, err);
    process.exit(1);
  });
} else {
  log.info('APP_MODE is not worker, skipping worker startup', { APP_MODE: process.env.APP_MODE });
}

export { handleJob };
