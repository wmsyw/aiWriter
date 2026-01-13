import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob, listJobs } from '@/src/server/services/jobs';

const MAX_PAYLOAD_SIZE = 100 * 1024;
const MAX_FIELD_LENGTH = 5000;

const outlineInputSchema = z.object({
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

const chapterInputSchema = z.object({
  chapterId: z.string(),
  agentId: z.string().optional(),
  outline: z.string().max(MAX_FIELD_LENGTH).optional(),
  enableWebSearch: z.boolean().optional(),
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
};

const createJobSchema = z.object({
  type: z.enum([
    'OUTLINE_GENERATE',
    'CHAPTER_GENERATE',
    'CHAPTER_GENERATE_BRANCHES',
    'REVIEW_SCORE',
    'DEAI_REWRITE',
    'MEMORY_EXTRACT',
    'CONSISTENCY_CHECK',
    'EMBEDDINGS_BUILD',
    'IMAGE_GENERATE',
    'GIT_BACKUP',
    'CHARACTER_CHAT',
    'ARTICLE_ANALYZE',
    'BATCH_ARTICLE_ANALYZE',
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
    
    const inputSchema = jobInputSchemas[data.type];
    if (inputSchema) {
      inputSchema.parse(data.input);
    }
    
    const job = await createJob(session.userId, data.type, data.input);
    
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await listJobs(session.userId);
  return NextResponse.json(jobs);
}
