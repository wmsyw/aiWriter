import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { JobType } from './types.js';
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

async function handleJob(job) {
  const { id: pgBossJobId, name: jobType, data: input } = job;
  const { jobId, userId } = input;

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'running' },
    });
  } catch (updateErr) {
    console.warn(`Failed to mark job ${jobId} as running:`, updateErr.message);
  }

  try {
    const handler = handlers[jobType];
    let result;
    
    if (handler) {
      result = await handler(prisma, job, { jobId, userId, input });
    } else if (placeholderTypes.includes(jobType)) {
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
    } catch (updateErr) {
      console.error(`Failed to mark job ${jobId} as succeeded:`, updateErr.message);
    }

    return result;
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'failed', 
          error: error.message || 'Unknown error',
        },
      });
    } catch (updateErr) {
      console.error(`Failed to mark job ${jobId} as failed:`, updateErr.message);
    }
    
    throw error;
  }
}

async function startWorker() {
  const boss = new PgBoss(process.env.DATABASE_URL);
  
  boss.on('error', error => console.error('PgBoss Error:', error));
  
  await boss.start();
  
  const allQueues = Object.values(JobType);
  for (const queue of allQueues) {
    await boss.createQueue(queue);
  }
  
  for (const queue of allQueues) {
    await boss.work(queue, handleJob);
  }
  
  console.log('Worker started');
}

if (process.env.APP_MODE === 'worker') {
  startWorker().catch(err => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}

export { handleJob };
