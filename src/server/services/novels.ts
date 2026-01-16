import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';

const OutlineNodeSchema: z.ZodType<unknown> = z.lazy(() => z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  level: z.enum(['rough', 'detailed', 'chapter']).optional(),
  children: z.array(OutlineNodeSchema).optional(),
  isExpanded: z.boolean().optional(),
  isGenerating: z.boolean().optional(),
}).passthrough());

const OutlineBlocksSchema = z.object({
  blocks: z.array(OutlineNodeSchema),
}).passthrough();

const InspirationDataSchema = z.record(z.string(), z.unknown());

const WorkflowConfigSchema = z.object({
  context: z.object({
    recentChaptersFull: z.number().optional(),
    summaryChaptersCount: z.number().optional(),
    maxTokens: z.number().optional(),
  }).optional(),
}).passthrough();

function parseOutlineBlocks(data: Prisma.JsonValue | null): { blocks: unknown[] } | null {
  if (!data) return null;
  const result = OutlineBlocksSchema.safeParse(data);
  return result.success ? result.data : { blocks: [] };
}

function parseInspirationData(data: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!data) return null;
  const result = InspirationDataSchema.safeParse(data);
  return result.success ? result.data : {};
}

function parseWorkflowConfig(data: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!data) return null;
  const result = WorkflowConfigSchema.safeParse(data);
  return result.success ? result.data : {};
}

export interface ParsedNovel {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: string;
  outline: string | null;
  outlineRough: { blocks: unknown[] } | null;
  outlineDetailed: { blocks: unknown[] } | null;
  outlineChapters: { blocks: unknown[] } | null;
  outlineStage: string;
  inspirationData: Record<string, unknown> | null;
  workflowConfig: Record<string, unknown> | null;
  [key: string]: unknown;
}

type PrismaNovel = Awaited<ReturnType<typeof prisma.novel.findFirst>>;

function toNovel<T extends NonNullable<PrismaNovel>>(novel: T): T & ParsedNovel {
  return {
    ...novel,
    outlineRough: parseOutlineBlocks(novel.outlineRough),
    outlineDetailed: parseOutlineBlocks(novel.outlineDetailed),
    outlineChapters: parseOutlineBlocks(novel.outlineChapters),
    inspirationData: parseInspirationData(novel.inspirationData),
    workflowConfig: parseWorkflowConfig(novel.workflowConfig),
  } as T & ParsedNovel;
}

export interface CreateNovelInput {
  userId: string;
  title: string;
  description?: string;
  type?: 'short' | 'long';
  theme?: string;
  genre?: string;
  targetWords?: number;
  chapterCount?: number;
  protagonist?: string;
  worldSetting?: string;
  keywords?: string[];
  specialRequirements?: string;
  outlineMode?: 'simple' | 'detailed';
  inspirationData?: Record<string, unknown>;
}

export interface UpdateNovelInput {
  title?: string;
  description?: string;
  type?: 'short' | 'long';
  theme?: string;
  genre?: string;
  targetWords?: number;
  chapterCount?: number;
  protagonist?: string;
  worldSetting?: string;
  keywords?: string[];
  specialRequirements?: string;
  outlineMode?: 'simple' | 'detailed';
  inspirationData?: Record<string, unknown>;
  goldenFinger?: string;
  generationStage?: string;
  outline?: string;
  outlineRough?: Prisma.InputJsonValue;
  outlineDetailed?: Prisma.InputJsonValue;
  outlineChapters?: Prisma.InputJsonValue;
  outlineStage?: string;
  wizardStatus?: string;
  wizardStep?: number;
  hookReminderChapters?: number;
  outlineDeviationLimit?: number;
  workflowConfig?: Prisma.InputJsonValue;
}

export async function createNovel(input: CreateNovelInput) {
  const novel = await prisma.novel.create({
    data: {
      userId: input.userId,
      title: input.title,
      description: input.description,
      type: input.type || 'short',
      theme: input.theme,
      genre: input.genre,
      targetWords: input.targetWords,
      chapterCount: input.chapterCount,
      protagonist: input.protagonist,
      worldSetting: input.worldSetting,
      keywords: input.keywords || [],
      specialRequirements: input.specialRequirements,
      outlineMode: input.outlineMode || 'simple',
      inspirationData: input.inspirationData as Prisma.InputJsonValue,
      wizardStatus: 'draft',
      wizardStep: 0,
    },
  });
  return toNovel(novel);
}

export async function getNovel(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: { id, userId },
    include: { chapters: { select: { id: true } } },
  });
  return novel ? toNovel(novel) : null;
}

export async function listNovels(userId: string) {
  const novels = await prisma.novel.findMany({
    where: { userId },
    include: { chapters: { select: { id: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return novels.map(toNovel);
}

export async function updateNovel(id: string, userId: string, input: UpdateNovelInput) {
  const existing = await prisma.novel.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new Error('Novel not found or access denied');
  }

  const allowedKeys: (keyof UpdateNovelInput)[] = [
    'title', 'description', 'type', 'theme', 'genre', 'targetWords', 'chapterCount',
    'protagonist', 'worldSetting', 'keywords', 'specialRequirements', 'outlineMode',
    'inspirationData', 'goldenFinger', 'generationStage', 'outline', 'outlineRough',
    'outlineDetailed', 'outlineChapters', 'outlineStage', 'wizardStatus', 'wizardStep',
    'hookReminderChapters', 'outlineDeviationLimit', 'workflowConfig',
  ];

  const updateData: Prisma.NovelUpdateInput = {};
  for (const key of allowedKeys) {
    if (input[key] !== undefined) {
      (updateData as Record<string, unknown>)[key] = input[key];
    }
  }

  const updated = await prisma.novel.update({ where: { id }, data: updateData });
  return toNovel(updated);
}

export async function deleteNovel(id: string, userId: string) {
  const existing = await prisma.novel.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new Error('Novel not found or access denied');
  }

  await prisma.novel.delete({ where: { id } });
}

export async function getNovelWithDetails(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: { id, userId },
    include: {
      chapters: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          generationStage: true,
          reviewIterations: true,
          pendingReview: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      materials: {
        select: {
          id: true,
          type: true,
          name: true,
        },
      },
      _count: {
        select: {
          chapters: true,
          materials: true,
          narrativeHooks: true,
        },
      },
    },
  });
  return novel ? toNovel(novel) : null;
}

export async function verifyNovelOwnership(novelId: string, userId: string): Promise<boolean> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    select: { id: true },
  });
  return novel !== null;
}
