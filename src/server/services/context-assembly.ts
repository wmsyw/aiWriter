import { prisma } from '../db';
import { DEFAULT_WORKFLOW_CONFIG } from '../../constants/workflow';
import { buildMaterialContext } from './materials';
import { formatHooksForContext } from './hooks';
import { formatPendingEntitiesForContext } from './pending-entities';
import { buildMentionBasedContext } from './mention-detection';
import { 
  getSummariesForContextWindow, 
  formatMultipleSummariesForContext,
  type ChapterSummary 
} from './chapter-summary';
import {
  getHierarchicalContext,
  formatHierarchicalContextForPrompt
} from './hierarchical-summary';

export interface ContextConfig {
  recentChaptersCount: number;
  summaryChaptersCount: number;
  maxTotalTokens: number;
  includeMaterials: boolean;
  includeHooks: boolean;
  includePendingEntities: boolean;
  includeOutline: boolean;
  useMentionBasedContext: boolean;
  useHierarchicalContext: boolean;
}

export interface AssembledContext {
  sections: ContextSection[];
  totalEstimatedTokens: number;
  warnings: string[];
  config: ContextConfig;
}

export interface ContextSection {
  type: 'recent_chapters' | 'summaries' | 'materials' | 'hooks' | 'pending_entities' | 'outline' | 'mentions' | 'hierarchical_summary' | 'custom';
  title: string;
  content: string;
  estimatedTokens: number;
  priority: number;
}

function estimateTokens(text: string): number {
  let tokenCount = 0;
  for (const char of text) {
    if (char.charCodeAt(0) > 0x4e00 && char.charCodeAt(0) < 0x9fff) {
      tokenCount += 1.5;
    } else if (char.charCodeAt(0) > 127) {
      tokenCount += 1.2;
    } else {
      tokenCount += 0.25;
    }
  }
  return Math.ceil(tokenCount);
}

export async function getRecentChapters(
  novelId: string,
  currentChapterOrder: number,
  count: number
): Promise<Array<{ order: number; title: string; content: string }>> {
  const chapters = await prisma.chapter.findMany({
    where: {
      novelId,
      order: { lt: currentChapterOrder },
      generationStage: { in: ['approved', 'humanized', 'completed'] },
    },
    select: {
      order: true,
      title: true,
      content: true,
    },
    orderBy: { order: 'desc' },
    take: count,
  });
  
  return chapters.reverse();
}

export async function getNovelOutline(
  novelId: string
): Promise<string | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { outline: true },
  });
  
  return novel?.outline || null;
}

export async function assembleContext(
  novelId: string,
  currentChapterOrder: number,
  customConfig?: Partial<ContextConfig>
): Promise<AssembledContext> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { userId: true, outline: true },
  });
  
  if (!novel) {
    throw new Error('Novel not found');
  }
  
  const userId = novel.userId;
  
  const config: ContextConfig = {
    recentChaptersCount: customConfig?.recentChaptersCount ?? DEFAULT_WORKFLOW_CONFIG.context.recentChaptersFull,
    summaryChaptersCount: customConfig?.summaryChaptersCount ?? DEFAULT_WORKFLOW_CONFIG.context.summaryChaptersCount,
    maxTotalTokens: customConfig?.maxTotalTokens ?? DEFAULT_WORKFLOW_CONFIG.context.maxTokens,
    includeMaterials: customConfig?.includeMaterials ?? true,
    includeHooks: customConfig?.includeHooks ?? true,
    includePendingEntities: customConfig?.includePendingEntities ?? true,
    includeOutline: customConfig?.includeOutline ?? true,
    useMentionBasedContext: customConfig?.useMentionBasedContext ?? true,
    useHierarchicalContext: customConfig?.useHierarchicalContext ?? true,
  };
  
  const sections: ContextSection[] = [];
  const warnings: string[] = [];
  
  const summaryStartChapter = currentChapterOrder - config.recentChaptersCount;
  
  const [
    materialsContext,
    mentionResult,
    hooksContext,
    pendingContext,
    recentChapters,
    hierarchicalCtx,
    summaries,
  ] = await Promise.all([
    config.includeMaterials 
      ? buildMaterialContext(novelId, userId) 
      : Promise.resolve(''),
    config.useMentionBasedContext && novel.outline 
      ? buildMentionBasedContext(novelId, novel.outline, currentChapterOrder, 8) 
      : Promise.resolve({ formattedContext: '', mentionedMaterials: [] }),
    config.includeHooks 
      ? formatHooksForContext(novelId, currentChapterOrder) 
      : Promise.resolve(''),
    config.includePendingEntities 
      ? formatPendingEntitiesForContext(novelId, currentChapterOrder) 
      : Promise.resolve(''),
    getRecentChapters(novelId, currentChapterOrder, config.recentChaptersCount),
    config.useHierarchicalContext 
      ? getHierarchicalContext(novelId, currentChapterOrder, {
          recentChapterCount: config.summaryChaptersCount,
          includeScenes: true
        }) 
      : Promise.resolve(null),
    !config.useHierarchicalContext && summaryStartChapter > 1 
      ? getSummariesForContextWindow(novelId, summaryStartChapter, config.summaryChaptersCount) 
      : Promise.resolve([] as ChapterSummary[]),
  ]);
  
  if (config.includeOutline && novel.outline) {
    sections.push({
      type: 'outline',
      title: '## Story Outline',
      content: novel.outline,
      estimatedTokens: estimateTokens(novel.outline),
      priority: 1,
    });
  }
  
  if (materialsContext.trim()) {
    sections.push({
      type: 'materials',
      title: '## World & Characters',
      content: materialsContext,
      estimatedTokens: estimateTokens(materialsContext),
      priority: 2,
    });
  }

  if (mentionResult.formattedContext.trim()) {
    sections.push({
      type: 'mentions',
      title: '',
      content: mentionResult.formattedContext,
      estimatedTokens: estimateTokens(mentionResult.formattedContext),
      priority: 2.5,
    });
  }
  
  if (hooksContext.trim()) {
    sections.push({
      type: 'hooks',
      title: '',
      content: hooksContext,
      estimatedTokens: estimateTokens(hooksContext),
      priority: 3,
    });
  }
  
  if (pendingContext.trim()) {
    sections.push({
      type: 'pending_entities',
      title: '',
      content: pendingContext,
      estimatedTokens: estimateTokens(pendingContext),
      priority: 4,
    });
    warnings.push('Pending entities require confirmation before proceeding');
  }
  
  if (recentChapters.length > 0) {
    const recentContent = recentChapters.map(ch => 
      `### Chapter ${ch.order}: ${ch.title || 'Untitled'}\n\n${ch.content}`
    ).join('\n\n---\n\n');
    
    sections.push({
      type: 'recent_chapters',
      title: '## Recent Chapters (Full Content)',
      content: recentContent,
      estimatedTokens: estimateTokens(recentContent),
      priority: 5,
    });
  }
  
  if (hierarchicalCtx) {
    const hierarchicalContent = formatHierarchicalContextForPrompt(hierarchicalCtx);
    if (hierarchicalContent.trim()) {
      sections.push({
        type: 'hierarchical_summary',
        title: '',
        content: hierarchicalContent,
        estimatedTokens: estimateTokens(hierarchicalContent),
        priority: 6,
      });
    }
  } else if (summaries.length > 0) {
    const summaryContent = formatMultipleSummariesForContext(summaries);
    sections.push({
      type: 'summaries',
      title: '',
      content: summaryContent,
      estimatedTokens: estimateTokens(summaryContent),
      priority: 6,
    });
  }
  
  const totalEstimatedTokens = sections.reduce((sum, s) => sum + s.estimatedTokens, 0);
  
  if (totalEstimatedTokens > config.maxTotalTokens) {
    warnings.push(`Context exceeds token limit: ${totalEstimatedTokens} > ${config.maxTotalTokens}`);
  }
  
  return {
    sections: sections.sort((a, b) => a.priority - b.priority),
    totalEstimatedTokens,
    warnings,
    config,
  };
}

export async function assembleContextAsString(
  novelId: string,
  currentChapterOrder: number,
  customConfig?: Partial<ContextConfig>
): Promise<{ context: string; warnings: string[]; tokens: number }> {
  const assembled = await assembleContext(novelId, currentChapterOrder, customConfig);
  
  const contextParts: string[] = [];
  
  for (const section of assembled.sections) {
    if (section.title) {
      contextParts.push(section.title);
    }
    contextParts.push(section.content);
    contextParts.push('');
  }
  
  return {
    context: contextParts.join('\n').trim(),
    warnings: assembled.warnings,
    tokens: assembled.totalEstimatedTokens,
  };
}

export async function assembleTruncatedContext(
  novelId: string,
  currentChapterOrder: number,
  maxTokens: number,
  customConfig?: Partial<ContextConfig>
): Promise<{ context: string; warnings: string[]; tokens: number; truncated: boolean }> {
  const assembled = await assembleContext(novelId, currentChapterOrder, customConfig);
  
  if (assembled.totalEstimatedTokens <= maxTokens) {
    const { context, warnings, tokens } = await assembleContextAsString(novelId, currentChapterOrder, customConfig);
    return { context, warnings, tokens, truncated: false };
  }
  
  const includedSections: ContextSection[] = [];
  let currentTokens = 0;
  const warnings = [...assembled.warnings, 'Context was truncated to fit token limit'];
  
  for (const section of assembled.sections) {
    if (currentTokens + section.estimatedTokens <= maxTokens) {
      includedSections.push(section);
      currentTokens += section.estimatedTokens;
    } else if (section.type === 'recent_chapters') {
      const remainingTokens = maxTokens - currentTokens;
      const truncatedContent = truncateContent(section.content, remainingTokens);
      
      includedSections.push({
        ...section,
        content: truncatedContent,
        estimatedTokens: estimateTokens(truncatedContent),
      });
      currentTokens += estimateTokens(truncatedContent);
      break;
    }
  }
  
  const contextParts: string[] = [];
  for (const section of includedSections) {
    if (section.title) {
      contextParts.push(section.title);
    }
    contextParts.push(section.content);
    contextParts.push('');
  }
  
  return {
    context: contextParts.join('\n').trim(),
    warnings,
    tokens: currentTokens,
    truncated: true,
  };
}

function truncateContent(content: string, maxTokens: number): string {
  const currentTokens = estimateTokens(content);
  if (currentTokens <= maxTokens) {
    return content;
  }
  
  const ratio = maxTokens / currentTokens;
  const targetLength = Math.floor(content.length * ratio);
  const truncated = content.substring(content.length - targetLength);
  
  const firstNewline = truncated.indexOf('\n');
  if (firstNewline > 0 && firstNewline < 200) {
    return '[...truncated...]\n' + truncated.substring(firstNewline + 1);
  }
  
  return '[...truncated...]\n' + truncated;
}

export interface ContextBreakdown {
  totalTokens: number;
  breakdown: Array<{
    type: string;
    tokens: number;
    percentage: number;
  }>;
}

export async function getContextBreakdown(
  novelId: string,
  currentChapterOrder: number
): Promise<ContextBreakdown> {
  const assembled = await assembleContext(novelId, currentChapterOrder);
  
  const breakdown = assembled.sections.map(section => ({
    type: section.type,
    tokens: section.estimatedTokens,
    percentage: assembled.totalEstimatedTokens > 0 
      ? (section.estimatedTokens / assembled.totalEstimatedTokens) * 100
      : 0,
  }));
  
  return {
    totalTokens: assembled.totalEstimatedTokens,
    breakdown,
  };
}
