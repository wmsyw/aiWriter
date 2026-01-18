import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob, listJobs } from '@/src/server/services/jobs';
import { checkRateLimit } from '@/src/server/middleware/rate-limit';

const MAX_PAYLOAD_SIZE = 100 * 1024;
const MAX_FIELD_LENGTH = 5000;

const outlineInputSchema = z.object({
  novelId: z.string().optional(),
  keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
  theme: z.string().max(MAX_FIELD_LENGTH).optional(),
  genre: z.string().max(200).optional(),
  targetWords: z.number().min(1).max(1000).optional(),
  chapterCount: z.number().min(1).max(2000).optional(),
  protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
  worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
  specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
});

const novelSeedInputSchema = z.object({
  novelId: z.string(),
  title: z.string().max(200).optional(),
  theme: z.string().max(MAX_FIELD_LENGTH).optional(),
  genre: z.string().max(200).optional(),
  keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
  protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
  specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
});

const outlineRoughInputSchema = z.object({
  novelId: z.string().optional(),
  keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
  theme: z.string().max(MAX_FIELD_LENGTH).optional(),
  genre: z.string().max(200).optional(),
  targetWords: z.number().min(1).max(1000).optional(),
  chapterCount: z.number().min(1).max(2000).optional(),
  protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
  worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
  specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
});

const outlineDetailedInputSchema = z.object({
  novelId: z.string(),
  roughOutline: z.unknown().optional(),
  targetWords: z.number().min(1).max(1000).optional(),
  chapterCount: z.number().min(1).max(2000).optional(),
  detailedNodeCount: z.number().optional(),
  agentId: z.string().optional(),
  target_id: z.string().optional(),
  target_title: z.string().optional(),
  target_content: z.string().optional(),
  rough_outline_context: z.string().optional(),
  prev_block_title: z.string().optional(),
  prev_block_content: z.string().optional(),
  next_block_title: z.string().optional(),
  next_block_content: z.string().optional(),
  regenerate_single: z.boolean().optional(),
  original_node_title: z.string().optional(),
});

const outlineChaptersInputSchema = z.object({
  novelId: z.string(),
  detailedOutline: z.unknown().optional(),
  chaptersPerNode: z.number().optional(),
  targetWords: z.number().optional(),
  chapterCount: z.number().optional(),
  agentId: z.string().optional(),
  target_id: z.string().optional(),
  target_title: z.string().optional(),
  target_content: z.string().optional(),
  detailed_outline_context: z.string().optional(),
  prev_chapter_title: z.string().optional(),
  prev_chapter_content: z.string().optional(),
  next_chapter_title: z.string().optional(),
  next_chapter_content: z.string().optional(),
  parent_rough_title: z.string().optional(),
  parent_rough_content: z.string().optional(),
  regenerate_single: z.boolean().optional(),
  original_chapter_title: z.string().optional(),
});

const characterBiosInputSchema = z.object({
  novelId: z.string(),
  characters: z.array(z.object({
    name: z.string().max(100),
    role: z.string().max(200).optional(),
    brief: z.string().max(MAX_FIELD_LENGTH).optional(),
  })).min(1),
  outlineContext: z.string().max(MAX_FIELD_LENGTH * 4).optional(),
  agentId: z.string().optional(),
});

const chapterInputSchema = z.object({
  chapterId: z.string(),
  agentId: z.string().optional(),
  outline: z.string().max(MAX_FIELD_LENGTH).optional(),
  enableWebSearch: z.boolean().optional(),
});

const wizardWorldInputSchema = z.object({
  novelId: z.string(),
  theme: z.string().max(MAX_FIELD_LENGTH).optional(),
  genre: z.string().max(200).optional(),
  keywords: z.array(z.string()).optional(),
  protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
  worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
  specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
});

const wizardCharactersInputSchema = z.object({
  novelId: z.string(),
  theme: z.string().max(MAX_FIELD_LENGTH).optional(),
  genre: z.string().max(200).optional(),
  keywords: z.array(z.string()).optional(),
  protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
  worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
  characterCount: z.number().int().min(1).max(20).optional(),
  agentId: z.string().optional(),
});

const reviewInputSchema = z.object({
  chapterId: z.string(),
  agentId: z.string().optional(),
});

const characterChatInputSchema = z.object({
  novelId: z.string(),
  characterId: z.string(),
  userMessage: z.string().max(MAX_FIELD_LENGTH),
  conversationHistory: z.string().max(MAX_FIELD_LENGTH * 4).optional(),
  agentId: z.string().optional(),
});

const articleAnalyzeInputSchema = z.object({
  title: z.string().max(500),
  content: z.string().max(MAX_FIELD_LENGTH * 20),
  genre: z.string().max(100).optional(),
  analysisFocus: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
  saveToMaterials: z.boolean().optional(),
  novelId: z.string().optional(),
  templateId: z.string().optional(),
});

const batchArticleAnalyzeInputSchema = z.object({
  articles: z.array(z.object({
    title: z.string().max(500),
    content: z.string().max(MAX_FIELD_LENGTH * 20),
    genre: z.string().max(100).optional(),
  })).min(1).max(10),
  analysisFocus: z.string().max(MAX_FIELD_LENGTH).optional(),
  agentId: z.string().optional(),
  saveToMaterials: z.boolean().optional(),
  novelId: z.string().optional(),
  templateId: z.string().optional(),
});

const reviewerModelSchema = z.object({
  model: z.string().min(1).max(100),
  providerConfigId: z.string().optional(),
  persona: z.string().max(200).optional(),
});

const multiReviewInputSchema = z.object({
  chapterId: z.string(),
  agentId: z.string().optional(),
  reviewerModels: z.array(reviewerModelSchema).min(1).max(5).optional(),
});

const jobInputSchemas: Record<string, z.ZodType> = {
  OUTLINE_GENERATE: outlineInputSchema,
  NOVEL_SEED: novelSeedInputSchema,
  OUTLINE_ROUGH: outlineRoughInputSchema,
  OUTLINE_DETAILED: outlineDetailedInputSchema,
  OUTLINE_CHAPTERS: outlineChaptersInputSchema,
  CHARACTER_BIOS: characterBiosInputSchema,
  CHAPTER_GENERATE: chapterInputSchema,
  CHAPTER_GENERATE_BRANCHES: z.object({
    chapterId: z.string(),
    agentId: z.string().optional(),
    outline: z.string().max(MAX_FIELD_LENGTH).optional(),
    branchCount: z.number().min(1).max(5).optional(),
    selectedVersionId: z.string().optional(),
    selectedContent: z.string().max(MAX_FIELD_LENGTH * 10).optional(),
    feedback: z.string().max(MAX_FIELD_LENGTH).optional(),
    iterationRound: z.number().min(1).max(10).optional(),
    enableWebSearch: z.boolean().optional(),
  }),
  REVIEW_SCORE: multiReviewInputSchema,
  DEAI_REWRITE: reviewInputSchema,
  MEMORY_EXTRACT: reviewInputSchema,
  CONSISTENCY_CHECK: reviewInputSchema,
  CHARACTER_CHAT: characterChatInputSchema,
  ARTICLE_ANALYZE: articleAnalyzeInputSchema,
  BATCH_ARTICLE_ANALYZE: batchArticleAnalyzeInputSchema,
  WIZARD_WORLD_BUILDING: wizardWorldInputSchema,
  WIZARD_CHARACTERS: wizardCharactersInputSchema,
  WIZARD_INSPIRATION: z.object({
    genre: z.string().max(200),
    targetWords: z.number().min(10).max(1000),
    targetAudience: z.string().max(500).optional(),
    keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
    count: z.number().min(1).max(10).optional(),
    agentId: z.string().optional(),
  }),
  WIZARD_SYNOPSIS: z.object({
    novelId: z.string(),
    title: z.string().max(200),
    genre: z.string().max(100).optional(),
    theme: z.string().max(500).optional(),
    keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
    protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
    worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
    goldenFinger: z.string().max(MAX_FIELD_LENGTH).optional(),
    existingSynopsis: z.string().max(MAX_FIELD_LENGTH).optional(),
    specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  }),
  WIZARD_GOLDEN_FINGER: z.object({
    novelId: z.string(),
    title: z.string().max(200),
    genre: z.string().max(100).optional(),
    theme: z.string().max(500).optional(),
    keywords: z.string().max(MAX_FIELD_LENGTH).optional(),
    protagonist: z.string().max(MAX_FIELD_LENGTH).optional(),
    worldSetting: z.string().max(MAX_FIELD_LENGTH).optional(),
    targetWords: z.number().min(10).max(1000).optional(),
    existingGoldenFinger: z.string().max(MAX_FIELD_LENGTH).optional(),
    specialRequirements: z.string().max(MAX_FIELD_LENGTH).optional(),
  }),
};

const createJobSchema = z.object({
  type: z.enum([
    'OUTLINE_GENERATE',
    'NOVEL_SEED',
    'OUTLINE_ROUGH',
    'OUTLINE_DETAILED',
    'OUTLINE_CHAPTERS',
    'CHARACTER_BIOS',
    'CHAPTER_GENERATE',
    'CHAPTER_GENERATE_BRANCHES',
    'REVIEW_SCORE',
    'DEAI_REWRITE',
    'MEMORY_EXTRACT',
    'CONSISTENCY_CHECK',
    'CANON_CHECK',
    'EMBEDDINGS_BUILD',
    'IMAGE_GENERATE',
    'GIT_BACKUP',
    'CHARACTER_CHAT',
    'ARTICLE_ANALYZE',
    'BATCH_ARTICLE_ANALYZE',
    'MATERIAL_SEARCH',
    'WIZARD_WORLD_BUILDING',
    'WIZARD_CHARACTERS',
    'WIZARD_INSPIRATION',
    'WIZARD_SYNOPSIS',
    'WIZARD_GOLDEN_FINGER',
    'CONTEXT_ASSEMBLE',
    'HOOKS_EXTRACT',
    'CHAPTER_SUMMARY_GENERATE',
    'OUTLINE_ADHERENCE_CHECK',
    'PENDING_ENTITY_EXTRACT',
    'REVIEW_SCORE_5DIM',
    'SCENE_BREAKDOWN',
    'ACT_SUMMARY_GENERATE',
    'PLOT_SIMULATE',
    'PLOT_BRANCH_GENERATE',
  ]),
  input: z.record(z.string(), z.unknown()),
  providerConfigId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    
    if (JSON.stringify(body).length > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const data = createJobSchema.parse(body);
    
    if (data.type === 'WIZARD_INSPIRATION') {
      const rateLimitResponse = await checkRateLimit(session.userId, 'jobs/inspiration');
      if (rateLimitResponse) return rateLimitResponse;
    }
    
    const inputSchema = jobInputSchemas[data.type];
    if (inputSchema) {
      inputSchema.parse(data.input);
    }
    
    const job = await createJob(session.userId, data.type, data.input);
    
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Failed to create job:', error);
    const message = error instanceof Error ? error.message : 'Failed to create job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const cursor = searchParams.get('cursor') || undefined;

  const { jobs, nextCursor } = await listJobs(session.userId, { limit, cursor });
  return NextResponse.json({ jobs, nextCursor, hasMore: nextCursor !== null });
}
