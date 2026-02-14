import type {
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineConfig,
} from '../types';
import { registerPipeline } from '../engine';
import { createPipelineAI } from '@/src/server/services/pipeline-ai';
import { prisma } from '@/src/server/db';
import { checkBlockingPendingEntities } from '@/src/server/services/pending-entities';

interface ChapterCardInput {
  must?: string[];
  should?: string[];
  mustNot?: string[];
  hooks?: string[];
  styleGuidance?: string;
  sceneObjective?: string;
}

interface ContextAssemblyInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  previousSummary?: string;
  worldSetting?: string;
  characters?: unknown[];
  chapterOutline?: string;
}

interface ContextAssemblyOutput {
  assembledContext: string;
  tokenCount: number;
  warnings: string[];
}

interface PreCheckInput {
  novelId: string;
  chapterId: string;
  chapterNumber?: number;
  assembledContext: string;
}

interface PreCheckOutput {
  canProceed: boolean;
  blockers: string[];
  pendingEntities: number;
}

interface GenerateInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string;
  assembledContext: string;
  outline?: string;
  chapterCard?: ChapterCardInput | null;
  targetWords?: number;
  authorStyle?: string;
}

interface GenerateOutput {
  content: string;
  wordCount: number;
  tokensUsed: number;
}

interface MemoryExtractInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  content: string;
}

interface MemoryExtractOutput {
  extractedData: {
    events: string[];
    characterUpdates: Record<string, string>;
    plotProgression: string;
    newSettings: string[];
  };
  newCharacters: string[];
  newOrganizations: string[];
}

interface HookAnalysisInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  content: string;
}

interface HookAnalysisOutput {
  hooksPlanted: string[];
  hooksReferenced: string[];
  hooksResolved: string[];
}

interface EntityDetectionInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  content: string;
}

interface EntityDetectionOutput {
  detectedEntities: Array<{
    type: string;
    name: string;
    isNew: boolean;
    description?: string;
  }>;
  pendingConfirmation: number;
}

interface PreCheckEvaluation {
  canProceed: boolean;
  blockers: string[];
  pendingEntities: number;
}

function normalizeChapterCard(raw?: ChapterCardInput | null): ChapterCardInput | null {
  if (!raw || typeof raw !== 'object') return null;

  const ensureList = (value?: string[]) =>
    Array.isArray(value)
      ? value.map((item) => item.trim()).filter((item) => item.length > 0)
      : [];

  const normalized: ChapterCardInput = {
    must: ensureList(raw.must),
    should: ensureList(raw.should),
    mustNot: ensureList(raw.mustNot),
    hooks: ensureList(raw.hooks),
    styleGuidance: raw.styleGuidance?.trim(),
    sceneObjective: raw.sceneObjective?.trim(),
  };

  const hasContent =
    (normalized.must?.length || 0) > 0 ||
    (normalized.should?.length || 0) > 0 ||
    (normalized.mustNot?.length || 0) > 0 ||
    (normalized.hooks?.length || 0) > 0 ||
    !!normalized.styleGuidance ||
    !!normalized.sceneObjective;

  return hasContent ? normalized : null;
}

function formatChapterCardForPrompt(card: ChapterCardInput): string {
  const lines: string[] = ['【章节任务卡（必须遵循）】'];

  const pushList = (title: string, items?: string[]) => {
    if (!items || items.length === 0) return;
    lines.push(title);
    items.forEach((item) => lines.push(`- ${item}`));
  };

  pushList('Must（本章必须发生）', card.must);
  pushList('Should（优先覆盖）', card.should);
  pushList('MustNot（禁止偏离）', card.mustNot);
  pushList('Hooks（本章需触及钩子）', card.hooks);

  if (card.sceneObjective) {
    lines.push(`场景目标：${card.sceneObjective}`);
  }
  if (card.styleGuidance) {
    lines.push(`风格指导：${card.styleGuidance}`);
  }

  return lines.join('\n');
}

async function evaluatePreChecks(input: PreCheckInput): Promise<PreCheckEvaluation> {
  const blockers: string[] = [];
  let pendingEntities = 0;
  let chapterNumber = input.chapterNumber;

  if ((!chapterNumber || chapterNumber < 1) && input.chapterId) {
    const chapter = await prisma.chapter.findUnique({
      where: { id: input.chapterId },
      select: { order: true },
    });
    chapterNumber = chapter?.order;
  }

  if (!chapterNumber || chapterNumber < 1) {
    blockers.push('Chapter number is missing');
  } else {
    if (chapterNumber > 1) {
      const incompleteCount = await prisma.chapter.count({
        where: {
          novelId: input.novelId,
          order: { lt: chapterNumber },
          generationStage: { not: 'completed' },
        },
      });

      if (incompleteCount > 0) {
        blockers.push(`${incompleteCount} previous chapters are not completed`);
      }
    }

    const blockingCheck = await checkBlockingPendingEntities(input.novelId, chapterNumber);
    pendingEntities = blockingCheck.pendingEntities.length;

    if (blockingCheck.blocked) {
      const previewNames = blockingCheck.pendingEntities
        .slice(0, 5)
        .map((entity) => entity.name)
        .join(', ');
      const extraSuffix = blockingCheck.pendingEntities.length > 5 ? ', ...' : '';
      blockers.push(
        `${blockingCheck.pendingEntities.length} pending entities require confirmation` +
          (previewNames ? ` (${previewNames}${extraSuffix})` : '')
      );
    }
  }

  if (!input.assembledContext || input.assembledContext.trim().length < 100) {
    blockers.push('Insufficient context assembled');
  }

  return {
    canProceed: blockers.length === 0,
    blockers,
    pendingEntities,
  };
}

const contextAssemblyStage: Stage<ContextAssemblyInput, ContextAssemblyOutput> = {
  id: 'context-assembly',
  name: '上下文组装',
  type: 'chapter',
  estimatedDurationSec: 10,
  
  async execute(ctx: StageContext<ContextAssemblyInput>): Promise<StageResult<ContextAssemblyOutput>> {
    const { input, logger, progress } = ctx;
    
    logger.info('Assembling context', { 
      novelId: input.novelId, 
      chapterNumber: input.chapterNumber 
    });
    progress.report(30, 'Gathering context from previous chapters...');
    
    // Build context from available inputs
    const contextParts: string[] = [];
    
    if (input.worldSetting) {
      contextParts.push(`【世界观】\n${input.worldSetting}`);
    }
    
    if (input.characters && input.characters.length > 0) {
      contextParts.push(`【主要角色】\n${JSON.stringify(input.characters, null, 2)}`);
    }
    
    if (input.previousSummary) {
      contextParts.push(`【前情提要】\n${input.previousSummary}`);
    }
    
    if (input.chapterOutline) {
      contextParts.push(`【本章大纲】\n${input.chapterOutline}`);
    }
    
    const assembledContext = contextParts.join('\n\n');
    const tokenCount = Math.ceil(assembledContext.length / 2); // Rough estimate
    
    const warnings: string[] = [];
    if (tokenCount > 8000) {
      warnings.push('Context is large, may need truncation');
    }
    if (!input.previousSummary && input.chapterNumber > 1) {
      warnings.push('No previous summary provided');
    }
    
    progress.report(100, 'Context assembly complete');
    
    return {
      success: true,
      output: { 
        assembledContext, 
        tokenCount,
        warnings 
      },
      contextUpdate: { assembledContext, contextTokens: tokenCount },
    };
  },
};

const preCheckStage: Stage<PreCheckInput, PreCheckOutput> = {
  id: 'pre-check',
  name: '前置检查',
  type: 'chapter',
  estimatedDurationSec: 5,
  
  async preCheck(ctx: StageContext<PreCheckInput>) {
    const evaluation = await evaluatePreChecks(ctx.input);
    if (evaluation.canProceed) {
      return { canProceed: true };
    }

    return {
      canProceed: false,
      reason: evaluation.blockers.join('; '),
      suggestedFixes: [
        'Complete previous chapters before generating the next one',
        'Confirm pending entities before continuing chapter generation',
      ],
    };
  },
  
  async execute(ctx: StageContext<PreCheckInput>): Promise<StageResult<PreCheckOutput>> {
    const { input, logger, progress } = ctx;
    
    logger.info('Running pre-generation checks', { chapterId: input.chapterId });
    progress.report(50, 'Checking prerequisites...');
    
    const evaluation = await evaluatePreChecks(input);
    if (evaluation.blockers.length > 0) {
      logger.warn('Pre-check blockers found', { blockers: evaluation.blockers });
    }
    
    progress.report(100, 'Pre-check complete');
    
    return {
      success: true,
      output: {
        canProceed: evaluation.canProceed,
        blockers: evaluation.blockers,
        pendingEntities: evaluation.pendingEntities,
      },
    };
  },
};

const generateStage: Stage<GenerateInput, GenerateOutput> = {
  id: 'generate',
  name: '内容生成',
  type: 'chapter',
  estimatedDurationSec: 120,
  supportsStreaming: true,
  
  async execute(ctx: StageContext<GenerateInput>): Promise<StageResult<GenerateOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const assembledContext = (pipelineContext.assembledContext as string) || input.assembledContext;
    const targetWords = input.targetWords || 2000;
    const chapterCard = normalizeChapterCard(input.chapterCard);
    const chapterCardSection = chapterCard ? formatChapterCardForPrompt(chapterCard) : '';
    
    logger.info('Starting chapter generation', { 
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber 
    });
    
    progress.report(10, 'Initializing generation...');
    
    const systemPrompt = `你是一位专业的网文写手，擅长创作引人入胜的小说章节。
你需要根据提供的大纲和上下文，创作完整的章节内容。

写作要求：
1. 文风流畅自然，有网文特色
2. 对话生动，符合角色性格
3. 场景描写到位，有画面感
4. 注意节奏控制，有张有弛
5. 章末留钩子，吸引读者继续
6. 目标字数：${targetWords}字左右

${input.authorStyle ? `作者风格参考：${input.authorStyle}` : ''}`;

    const userPrompt = `请创作第${input.chapterNumber}章${input.chapterTitle ? `「${input.chapterTitle}」` : ''}的完整内容。

${assembledContext}

${input.outline ? `本章具体要求：\n${input.outline}` : ''}

${chapterCardSection}

请开始创作：`;

    try {
      // Use streaming for chapter generation
      const result = await ai.generateStreaming({ 
        systemPrompt, 
        userPrompt 
      });
      
      const content = result.content;
      const wordCount = content.length;
      
      progress.report(100, 'Generation complete');
      
      return {
        success: true,
        output: {
          content,
          wordCount,
          tokensUsed: result.usage.totalTokens,
        },
        contextUpdate: { 
          generatedContent: content,
          wordCount,
        },
        metrics: {
          durationMs: result.durationMs,
          tokensUsed: {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          },
        },
      };
    } catch (error) {
      logger.error('Chapter generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const memoryExtractStage: Stage<MemoryExtractInput, MemoryExtractOutput> = {
  id: 'memory-extract',
  name: '记忆提取',
  type: 'chapter',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<MemoryExtractInput>): Promise<StageResult<MemoryExtractOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const content = (pipelineContext.generatedContent as string) || input.content;
    
    logger.info('Extracting memories from chapter', { chapterId: input.chapterId });
    progress.report(40, 'Analyzing chapter content...');
    
    const systemPrompt = `你是一位专业的网文编辑，擅长从章节内容中提取关键信息。
请分析章节内容，提取以下信息：
返回JSON格式：
- events: 本章发生的关键事件数组
- characterUpdates: 角色状态变化（键为角色名，值为变化描述）
- plotProgression: 剧情推进总结
- newSettings: 新出现的设定数组
- newCharacters: 新出现的角色名数组
- newOrganizations: 新出现的组织名数组`;

    const userPrompt = `请分析以下第${input.chapterNumber}章内容，提取关键记忆点：

${content}`;

    try {
      const result = await ai.generateJSON<{
        events: string[];
        characterUpdates: Record<string, string>;
        plotProgression: string;
        newSettings: string[];
        newCharacters: string[];
        newOrganizations: string[];
      }>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Memory extraction complete');
      
      return {
        success: true,
        output: {
          extractedData: {
            events: result.data.events,
            characterUpdates: result.data.characterUpdates,
            plotProgression: result.data.plotProgression,
            newSettings: result.data.newSettings,
          },
          newCharacters: result.data.newCharacters,
          newOrganizations: result.data.newOrganizations,
        },
        contextUpdate: { memorySnapshot: result.data },
        metrics: {
          durationMs: result.durationMs,
          tokensUsed: {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          },
        },
      };
    } catch (error) {
      logger.error('Memory extraction failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const hookAnalysisStage: Stage<HookAnalysisInput, HookAnalysisOutput> = {
  id: 'hook-analysis',
  name: '钩子分析',
  type: 'chapter',
  estimatedDurationSec: 20,
  
  async execute(ctx: StageContext<HookAnalysisInput>): Promise<StageResult<HookAnalysisOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const content = (pipelineContext.generatedContent as string) || input.content;
    
    logger.info('Analyzing narrative hooks', { chapterId: input.chapterId });
    progress.report(50, 'Detecting hooks...');
    
    const systemPrompt = `你是一位专业的网文编辑，擅长分析叙事钩子（伏笔）。
请分析章节内容中的钩子：
返回JSON格式：
- hooksPlanted: 本章埋下的新钩子/伏笔
- hooksReferenced: 本章提及但未解决的旧钩子
- hooksResolved: 本章解决/回收的钩子`;

    const userPrompt = `请分析以下第${input.chapterNumber}章内容中的叙事钩子：

${content}`;

    try {
      const result = await ai.generateJSON<HookAnalysisOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Hook analysis complete');
      
      return {
        success: true,
        output: result.data,
        metrics: {
          durationMs: result.durationMs,
          tokensUsed: {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          },
        },
      };
    } catch (error) {
      logger.error('Hook analysis failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const entityDetectionStage: Stage<EntityDetectionInput, EntityDetectionOutput> = {
  id: 'entity-detection',
  name: '实体检测',
  type: 'chapter',
  estimatedDurationSec: 15,
  
  async execute(ctx: StageContext<EntityDetectionInput>): Promise<StageResult<EntityDetectionOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const content = (pipelineContext.generatedContent as string) || input.content;
    
    logger.info('Detecting entities', { chapterId: input.chapterId });
    progress.report(60, 'Scanning for new entities...');
    
    const systemPrompt = `你是一位专业的网文编辑，擅长识别文中的命名实体。
请识别章节中的所有命名实体（人物、地点、组织、物品等）。
返回JSON格式：
- detectedEntities: 实体数组，每个包含：
  - type: 类型（character/location/organization/item/skill/other）
  - name: 名称
  - isNew: 是否为首次出现（推测）
  - description: 简短描述
- pendingConfirmation: 需要确认的新实体数量`;

    const userPrompt = `请识别以下第${input.chapterNumber}章内容中的命名实体：

${content}`;

    try {
      const result = await ai.generateJSON<EntityDetectionOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Entity detection complete');
      
      return {
        success: true,
        output: result.data,
        metrics: {
          durationMs: result.durationMs,
          tokensUsed: {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          },
        },
      };
    } catch (error) {
      logger.error('Entity detection failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const defaultConfig: PipelineConfig = {
  maxRetries: 2,
  retryDelayMs: 5000,
  exponentialBackoff: true,
  timeoutMs: 10 * 60 * 1000,
  enableCheckpoints: true,
  enableParallel: false,
};

export const ChapterPipeline: Pipeline = {
  id: 'chapter',
  name: '章节生成',
  description: 'Generate a single chapter with context, generation, and post-processing',
  stages: [
    contextAssemblyStage as Stage,
    preCheckStage as Stage,
    generateStage as Stage,
    memoryExtractStage as Stage,
    hookAnalysisStage as Stage,
    entityDetectionStage as Stage,
  ],
  defaultConfig,
};

registerPipeline(ChapterPipeline);

export default ChapterPipeline;
