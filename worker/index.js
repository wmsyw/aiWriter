import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { JobType } from './types.js';

// === DIAGNOSTIC LOGGING ===
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [WORKER] [${level}] ${message}${dataStr}`);
};
log('INFO', 'Worker module loaded', { 
  APP_MODE: process.env.APP_MODE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
  APP_ENCRYPTION_KEY_B64: process.env.APP_ENCRYPTION_KEY_B64 ? '[SET]' : '[NOT SET]'
});
import { handleChapterGenerate, handleChapterGenerateBranches } from './processors/chapter.js';
import { handleOutlineRough, handleOutlineDetailed, handleOutlineChapters, handleOutlineGenerate } from './processors/outline.js';
import { handleReviewScore, handleConsistencyCheck, handleCanonCheck } from './processors/review.js';
import { handleCharacterBios, handleCharacterChat, handleWizardCharacters } from './processors/character.js';
import { handleNovelSeed, handleWizardWorldBuilding } from './processors/novel.js';
import { handleMemoryExtract, handleDeaiRewrite, handleGitBackup } from './processors/utility.js';
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
  [JobType.MEMORY_EXTRACT]: handleMemoryExtract,
  [JobType.DEAI_REWRITE]: handleDeaiRewrite,
  [JobType.GIT_BACKUP]: handleGitBackup,
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
};

const placeholderHandler = async () => ({ status: 'not_implemented' });
const placeholderTypes = [
  JobType.ARTICLE_ANALYZE,
  JobType.BATCH_ARTICLE_ANALYZE,
  JobType.MATERIAL_SEARCH,
  JobType.EMBEDDINGS_BUILD,
  JobType.IMAGE_GENERATE,
];

async function handleJob([job]) {
  if (!job) {
    log('WARN', 'Empty job array received');
    return;
  }
  
  const { id: pgBossJobId, name: jobType, data: jobData } = job;
  
  log('INFO', '>>> JOB PICKED UP', { pgBossJobId, jobType, jobData: JSON.stringify(jobData || {}).slice(0, 200) });
  
  if (!jobData || typeof jobData !== 'object') {
    log('ERROR', 'Job data is missing or invalid', { pgBossJobId, jobType, jobData });
    throw new Error('Job data is missing or invalid');
  }
  
  const { jobId, userId, input } = jobData;
  
  if (!jobId) {
    log('ERROR', 'jobId is missing from job data', { pgBossJobId, jobType, jobDataKeys: Object.keys(jobData) });
    throw new Error('jobId is missing from job data');
  }

  log('INFO', 'Processing job', { pgBossJobId, jobType, jobId, userId });

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'running' },
    });
    log('INFO', 'Job marked as running', { jobId });
  } catch (updateErr) {
    log('WARN', 'Failed to mark job as running', { jobId, error: updateErr.message });
  }

  try {
    const handler = handlers[jobType];
    let result;
    
    if (handler) {
      log('INFO', 'Executing handler', { jobType, handlerFound: true });
      result = await handler(prisma, job, { jobId, userId, input });
      log('INFO', 'Handler completed successfully', { jobId });
    } else if (placeholderTypes.includes(jobType)) {
      log('WARN', 'Using placeholder handler', { jobType });
      result = await placeholderHandler();
    } else {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'succeeded', 
          output: result ?? null,
        },
      });
      log('INFO', '<<< JOB SUCCEEDED', { jobId });
    } catch (updateErr) {
      log('ERROR', 'Failed to mark job as succeeded', { jobId, error: updateErr.message });
    }

    return result;
  } catch (error) {
    log('ERROR', '<<< JOB FAILED', { jobId, error: error.message, stack: error.stack?.slice(0, 500) });
    
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'failed', 
          error: error.message || 'Unknown error',
        },
      });
    } catch (updateErr) {
      log('ERROR', 'Failed to mark job as failed in DB', { jobId, error: updateErr.message });
    }
    
    throw error;
  }
}

async function startWorker() {
  log('INFO', '=== STARTING WORKER ===');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log('ERROR', 'DATABASE_URL is not set - worker cannot start');
    process.exit(1);
  }
  log('INFO', 'Connecting to pg-boss', { dbHost: dbUrl.split('@')[1]?.split('/')[0] || '[hidden]' });
  
  const boss = new PgBoss(dbUrl);
  
  boss.on('error', error => {
    log('ERROR', 'PgBoss internal error', { error: error.message, stack: error.stack?.slice(0, 300) });
  });
  
  boss.on('monitor-states', states => {
    log('DEBUG', 'PgBoss monitor-states', states);
  });
  
  try {
    await boss.start();
    log('INFO', 'PgBoss started successfully');
  } catch (startErr) {
    log('ERROR', 'Failed to start PgBoss', { error: startErr.message, stack: startErr.stack });
    process.exit(1);
  }
  
  const allQueues = Object.values(JobType);
  log('INFO', 'Creating queues', { count: allQueues.length, queues: allQueues });
  
  for (const queue of allQueues) {
    try {
      await boss.createQueue(queue);
      log('DEBUG', 'Queue created', { queue });
    } catch (queueErr) {
      log('WARN', 'Queue creation issue', { queue, error: queueErr.message });
    }
  }
  
  for (const queue of allQueues) {
    try {
      await boss.work(queue, handleJob);
      log('INFO', 'Subscribed to queue', { queue });
    } catch (workErr) {
      log('ERROR', 'Failed to subscribe to queue', { queue, error: workErr.message });
    }
  }
  
  log('INFO', '=== WORKER STARTED - LISTENING FOR JOBS ===');
}

if (process.env.APP_MODE === 'worker') {
  log('INFO', 'APP_MODE=worker detected, starting worker process');
  startWorker().catch(err => {
    log('ERROR', 'Fatal: Failed to start worker', { error: err.message, stack: err.stack });
    process.exit(1);
  });
} else {
  log('INFO', 'APP_MODE is not worker, skipping worker startup', { APP_MODE: process.env.APP_MODE });
}

export { handleJob };
