import { prisma } from '../db';

export interface ChapterSummary {
  id: string;
  chapterId: string;
  novelId: string;
  chapterNumber: number;
  oneLine: string;
  keyEvents: string[];
  characterDevelopments: string[];
  plotAdvancement: string | null;
  emotionalArc: string | null;
  newCharacters: string[];
  newOrganizations: string[];
  hooksPlanted: string[];
  hooksReferenced: string[];
  hooksResolved: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChapterSummaryInput {
  chapterId: string;
  novelId: string;
  chapterNumber: number;
  oneLine: string;
  keyEvents?: string[];
  characterDevelopments?: string[];
  plotAdvancement?: string;
  emotionalArc?: string;
  newCharacters?: string[];
  newOrganizations?: string[];
  hooksPlanted?: string[];
  hooksReferenced?: string[];
  hooksResolved?: string[];
}

export interface UpdateChapterSummaryInput {
  oneLine?: string;
  keyEvents?: string[];
  characterDevelopments?: string[];
  plotAdvancement?: string;
  emotionalArc?: string;
  newCharacters?: string[];
  newOrganizations?: string[];
  hooksPlanted?: string[];
  hooksReferenced?: string[];
  hooksResolved?: string[];
}

export async function createChapterSummary(
  input: CreateChapterSummaryInput
): Promise<ChapterSummary> {
  const summary = await prisma.chapterSummary.create({
    data: {
      chapterId: input.chapterId,
      novelId: input.novelId,
      chapterNumber: input.chapterNumber,
      oneLine: input.oneLine,
      keyEvents: input.keyEvents || [],
      characterDevelopments: input.characterDevelopments || [],
      plotAdvancement: input.plotAdvancement || null,
      emotionalArc: input.emotionalArc || null,
      newCharacters: input.newCharacters || [],
      newOrganizations: input.newOrganizations || [],
      hooksPlanted: input.hooksPlanted || [],
      hooksReferenced: input.hooksReferenced || [],
      hooksResolved: input.hooksResolved || [],
    },
  });
  
  return summary as unknown as ChapterSummary;
}

export async function getChapterSummary(chapterId: string): Promise<ChapterSummary | null> {
  const summary = await prisma.chapterSummary.findUnique({
    where: { chapterId },
  });
  
  return summary as unknown as ChapterSummary | null;
}

export async function updateChapterSummary(
  chapterId: string,
  input: UpdateChapterSummaryInput
): Promise<ChapterSummary> {
  const updateData: Record<string, unknown> = {};
  
  if (input.oneLine !== undefined) updateData.oneLine = input.oneLine;
  if (input.keyEvents !== undefined) updateData.keyEvents = input.keyEvents;
  if (input.characterDevelopments !== undefined) updateData.characterDevelopments = input.characterDevelopments;
  if (input.plotAdvancement !== undefined) updateData.plotAdvancement = input.plotAdvancement;
  if (input.emotionalArc !== undefined) updateData.emotionalArc = input.emotionalArc;
  if (input.newCharacters !== undefined) updateData.newCharacters = input.newCharacters;
  if (input.newOrganizations !== undefined) updateData.newOrganizations = input.newOrganizations;
  if (input.hooksPlanted !== undefined) updateData.hooksPlanted = input.hooksPlanted;
  if (input.hooksReferenced !== undefined) updateData.hooksReferenced = input.hooksReferenced;
  if (input.hooksResolved !== undefined) updateData.hooksResolved = input.hooksResolved;
  
  const summary = await prisma.chapterSummary.update({
    where: { chapterId },
    data: updateData,
  });
  
  return summary as unknown as ChapterSummary;
}

export async function upsertChapterSummary(
  input: CreateChapterSummaryInput
): Promise<ChapterSummary> {
  const existing = await getChapterSummary(input.chapterId);
  
  if (existing) {
    return updateChapterSummary(input.chapterId, {
      oneLine: input.oneLine,
      keyEvents: input.keyEvents,
      characterDevelopments: input.characterDevelopments,
      plotAdvancement: input.plotAdvancement,
      emotionalArc: input.emotionalArc,
      newCharacters: input.newCharacters,
      newOrganizations: input.newOrganizations,
      hooksPlanted: input.hooksPlanted,
      hooksReferenced: input.hooksReferenced,
      hooksResolved: input.hooksResolved,
    });
  }
  
  return createChapterSummary(input);
}

export async function deleteChapterSummary(chapterId: string): Promise<void> {
  await prisma.chapterSummary.delete({
    where: { chapterId },
  });
}

export async function getNovelSummaries(
  novelId: string,
  options?: { limit?: number; beforeChapter?: number }
): Promise<ChapterSummary[]> {
  const summaries = await prisma.chapterSummary.findMany({
    where: {
      novelId,
      ...(options?.beforeChapter ? { chapterNumber: { lt: options.beforeChapter } } : {}),
    },
    orderBy: { chapterNumber: 'desc' },
    take: options?.limit,
  });
  
  return summaries as unknown as ChapterSummary[];
}

export async function getSummariesForContextWindow(
  novelId: string,
  currentChapter: number,
  maxSummaries: number = 10
): Promise<ChapterSummary[]> {
  return getNovelSummaries(novelId, {
    limit: maxSummaries,
    beforeChapter: currentChapter,
  });
}

export function formatSummaryForContext(summary: ChapterSummary): string {
  const lines: string[] = [];
  
  lines.push(summary.oneLine);
  
  if (summary.keyEvents && summary.keyEvents.length > 0) {
    lines.push(`Key events: ${summary.keyEvents.join('; ')}`);
  }
  
  if (summary.characterDevelopments && summary.characterDevelopments.length > 0) {
    lines.push(`Character developments: ${summary.characterDevelopments.join('; ')}`);
  }
  
  if (summary.plotAdvancement) {
    lines.push(`Plot: ${summary.plotAdvancement}`);
  }
  
  return lines.join(' ');
}

export function formatMultipleSummariesForContext(
  summaries: ChapterSummary[]
): string {
  if (summaries.length === 0) {
    return '';
  }
  
  const lines: string[] = ['## Previous Chapters Summary'];
  
  const sortedSummaries = [...summaries].sort((a, b) => a.chapterNumber - b.chapterNumber);
  
  for (const summary of sortedSummaries) {
    lines.push(`\n### Chapter ${summary.chapterNumber}`);
    lines.push(formatSummaryForContext(summary));
  }
  
  return lines.join('\n');
}

export async function ensureSummaryExists(
  chapterId: string,
  novelId: string,
  chapterNumber: number,
  fallbackContent: string
): Promise<ChapterSummary> {
  const existing = await getChapterSummary(chapterId);
  
  if (existing) {
    return existing;
  }
  
  const truncatedSummary = fallbackContent.length > 500
    ? fallbackContent.substring(0, 500) + '...'
    : fallbackContent;
  
  return createChapterSummary({
    chapterId,
    novelId,
    chapterNumber,
    oneLine: `[Auto-generated] ${truncatedSummary}`,
    keyEvents: [],
    characterDevelopments: [],
  });
}

export interface SummaryStats {
  totalSummaries: number;
  chaptersWithoutSummary: number;
  totalChapters: number;
  hooksTracked: {
    planted: number;
    referenced: number;
    resolved: number;
  };
}

export async function getSummaryStats(novelId: string): Promise<SummaryStats> {
  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    select: { id: true },
  });
  
  const summaries = await prisma.chapterSummary.findMany({
    where: { novelId },
    select: { 
      hooksPlanted: true,
      hooksReferenced: true,
      hooksResolved: true,
    },
  });
  
  let planted = 0, referenced = 0, resolved = 0;
  for (const s of summaries) {
    planted += Array.isArray(s.hooksPlanted) ? s.hooksPlanted.length : 0;
    referenced += Array.isArray(s.hooksReferenced) ? s.hooksReferenced.length : 0;
    resolved += Array.isArray(s.hooksResolved) ? s.hooksResolved.length : 0;
  }
  
  return {
    totalSummaries: summaries.length,
    chaptersWithoutSummary: chapters.length - summaries.length,
    totalChapters: chapters.length,
    hooksTracked: { planted, referenced, resolved },
  };
}
