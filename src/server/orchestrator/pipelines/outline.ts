import type {
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineConfig,
} from '../types';
import { registerPipeline } from '../engine';
import { createPipelineAI } from '@/src/server/services/pipeline-ai';

interface RoughOutlineInput {
  novelId: string;
  keywords?: string;
  theme?: string;
  genre?: string;
  targetWords?: number;
  chapterCount?: number;
  worldSetting?: string;
  protagonist?: string;
  synopsis?: string;
  goldenFinger?: string;
}

interface VolumeNode {
  id: string;
  title: string;
  summary: string;
  keyEvents: string[];
  emotionalArc: string;
}

interface Volume {
  id: string;
  title: string;
  theme: string;
  nodes: VolumeNode[];
}

interface RoughOutlineOutput {
  roughOutline: {
    volumes: Volume[];
  };
  volumeCount: number;
  nodesPerVolume: number;
}

interface DetailedOutlineInput {
  novelId: string;
  roughOutline: RoughOutlineOutput['roughOutline'];
  targetWords?: number;
  chapterCount?: number;
  worldSetting?: string;
  characters?: unknown[];
}

interface StoryArc {
  title: string;
  volumeId: string;
  startNode: string;
  endNode: string;
  events: string[];
  conflicts: string[];
  resolution: string;
}

interface DetailedOutlineOutput {
  detailedOutline: {
    storyArcs: StoryArc[];
    totalEvents: number;
  };
  storyArcs: StoryArc[];
}

interface ChapterOutlineInput {
  novelId: string;
  detailedOutline: DetailedOutlineOutput['detailedOutline'];
  roughOutline?: RoughOutlineOutput['roughOutline'];
  chaptersPerNode?: number;
  targetWordsPerChapter?: number;
}

interface ChapterOutline {
  id: string;
  order: number;
  title: string;
  summary: string;
  wordTarget: number;
  keyScenes: string[];
  pov?: string;
  hooks: string[];
}

interface ChapterOutlineOutput {
  chapterOutlines: {
    chapters: ChapterOutline[];
  };
  totalChapters: number;
}

interface OutlineValidationInput {
  novelId: string;
  roughOutline: RoughOutlineOutput['roughOutline'];
  detailedOutline: DetailedOutlineOutput['detailedOutline'];
  chapterOutlines: ChapterOutlineOutput['chapterOutlines'];
}

interface OutlineValidationOutput {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
  plotHoles: string[];
  pacingIssues: string[];
}

const roughOutlineStage: Stage<RoughOutlineInput, RoughOutlineOutput> = {
  id: 'rough-outline',
  name: '粗纲生成',
  type: 'outline',
  estimatedDurationSec: 60,
  
  async execute(ctx: StageContext<RoughOutlineInput>): Promise<StageResult<RoughOutlineOutput>> {
    const { input, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    logger.info('Starting rough outline generation', { novelId: input.novelId });
    progress.report(20, 'Analyzing story structure...');
    
    const volumeCount = Math.ceil((input.targetWords || 100) / 50);
    const nodesPerVolume = 8;
    
    const systemPrompt = `你是一位专业的网文大纲策划师，擅长设计宏观故事结构。
你需要根据小说设定，生成一个完整的粗纲结构。
返回JSON格式，包含volumes数组，每个volume包含：
- id: 卷ID（如volume-1）
- title: 卷名
- theme: 本卷主题
- nodes: 剧情节点数组，每个节点包含：
  - id: 节点ID
  - title: 节点标题
  - summary: 剧情概述（50-100字）
  - keyEvents: 关键事件数组
  - emotionalArc: 情感走向`;

    const userPrompt = `请为以下小说生成${volumeCount}卷粗纲，每卷${nodesPerVolume}个剧情节点：
${input.synopsis ? `故事简介：${input.synopsis}` : ''}
${input.theme ? `主题：${input.theme}` : ''}
${input.genre ? `类型：${input.genre}` : ''}
${input.worldSetting ? `世界观：${input.worldSetting}` : ''}
${input.protagonist ? `主角：${input.protagonist}` : ''}
${input.goldenFinger ? `金手指：${input.goldenFinger}` : ''}
${input.targetWords ? `目标字数：${input.targetWords}万字` : ''}

要求：
1. 每卷要有明确的主题和目标
2. 剧情节点要循序渐进，有起承转合
3. 每个节点的情感走向要清晰
4. 注意爽点的分布和节奏控制`;

    try {
      const result = await ai.generateJSON<{ volumes: Volume[] }>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Rough outline complete');
      
      const roughOutline = result.data;
      
      return {
        success: true,
        output: { 
          roughOutline, 
          volumeCount: roughOutline.volumes.length, 
          nodesPerVolume 
        },
        contextUpdate: { roughOutline },
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
      logger.error('Rough outline generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const detailedOutlineStage: Stage<DetailedOutlineInput, DetailedOutlineOutput> = {
  id: 'detailed-outline',
  name: '细纲生成',
  type: 'outline',
  estimatedDurationSec: 120,
  
  async execute(ctx: StageContext<DetailedOutlineInput>): Promise<StageResult<DetailedOutlineOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const roughOutline = (pipelineContext.roughOutline as RoughOutlineOutput['roughOutline']) || input.roughOutline;
    
    logger.info('Starting detailed outline generation', { novelId: input.novelId });
    progress.report(10, 'Expanding rough outline...');
    
    const systemPrompt = `你是一位专业的网文细纲设计师，擅长将粗纲展开为详细的故事弧线。
基于已有的粗纲结构，生成详细的故事弧线。
返回JSON格式，包含storyArcs数组，每个arc包含：
- title: 弧线标题
- volumeId: 所属卷ID
- startNode: 起始节点ID
- endNode: 结束节点ID
- events: 详细事件列表（每个弧线5-10个事件）
- conflicts: 主要冲突
- resolution: 解决方式`;

    const userPrompt = `请基于以下粗纲生成详细故事弧线：
${JSON.stringify(roughOutline, null, 2)}

${input.worldSetting ? `世界观：${input.worldSetting}` : ''}
${input.characters ? `主要角色：${JSON.stringify(input.characters)}` : ''}

要求：
1. 每个卷至少2-3个故事弧线
2. 弧线之间要有承接关系
3. 冲突要有层次感
4. 解决方式要合理且有创意`;

    try {
      const result = await ai.generateJSON<{ storyArcs: StoryArc[] }>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Detailed outline complete');
      
      const storyArcs = result.data.storyArcs;
      const detailedOutline = {
        storyArcs,
        totalEvents: storyArcs.reduce((sum, arc) => sum + arc.events.length, 0),
      };
      
      return {
        success: true,
        output: { detailedOutline, storyArcs },
        contextUpdate: { detailedOutline },
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
      logger.error('Detailed outline generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const chapterOutlineStage: Stage<ChapterOutlineInput, ChapterOutlineOutput> = {
  id: 'chapter-outline',
  name: '章节大纲',
  type: 'outline',
  estimatedDurationSec: 90,
  
  async execute(ctx: StageContext<ChapterOutlineInput>): Promise<StageResult<ChapterOutlineOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const detailedOutline = (pipelineContext.detailedOutline as DetailedOutlineOutput['detailedOutline']) || input.detailedOutline;
    const roughOutline = pipelineContext.roughOutline as RoughOutlineOutput['roughOutline'] | undefined;
    
    logger.info('Starting chapter outline generation', { novelId: input.novelId });
    progress.report(15, 'Breaking down into chapters...');
    
    const wordTarget = input.targetWordsPerChapter || 2000;
    
    const systemPrompt = `你是一位专业的网文章节策划师，擅长将故事弧线拆解为具体章节。
基于故事弧线，生成每个章节的详细大纲。
返回JSON格式，包含chapters数组，每个chapter包含：
- id: 章节ID（如chapter-1）
- order: 章节序号
- title: 章节标题（吸引人的标题）
- summary: 章节摘要（100-150字）
- wordTarget: 目标字数
- keyScenes: 关键场景列表
- pov: 视角（如果有切换）
- hooks: 章末钩子（吸引读者继续阅读）`;

    const userPrompt = `请基于以下故事弧线生成章节大纲：

故事弧线：
${JSON.stringify(detailedOutline, null, 2)}

${roughOutline ? `粗纲结构：${JSON.stringify(roughOutline, null, 2)}` : ''}

每章目标字数：${wordTarget}字

要求：
1. 章节标题要吸引眼球
2. 每章要有明确的小高潮或钩子
3. 章节长度适中，保持阅读节奏
4. 关键场景描述清晰
5. 注意伏笔的埋设和回收`;

    try {
      const result = await ai.generateJSON<{ chapters: ChapterOutline[] }>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Chapter outline complete');
      
      const chapterOutlines = result.data;
      
      return {
        success: true,
        output: { chapterOutlines, totalChapters: chapterOutlines.chapters.length },
        contextUpdate: { chapterOutlines },
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
      logger.error('Chapter outline generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const outlineValidationStage: Stage<OutlineValidationInput, OutlineValidationOutput> = {
  id: 'outline-validation',
  name: '大纲校验',
  type: 'outline',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<OutlineValidationInput>): Promise<StageResult<OutlineValidationOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const roughOutline = (pipelineContext.roughOutline as RoughOutlineOutput['roughOutline']) || input.roughOutline;
    const detailedOutline = (pipelineContext.detailedOutline as DetailedOutlineOutput['detailedOutline']) || input.detailedOutline;
    const chapterOutlines = (pipelineContext.chapterOutlines as ChapterOutlineOutput['chapterOutlines']) || input.chapterOutlines;
    
    logger.info('Starting outline validation', { novelId: input.novelId });
    progress.report(30, 'Validating outline consistency...');
    
    const systemPrompt = `你是一位资深的网文编辑，擅长发现大纲中的问题。
请仔细审查提供的大纲结构，找出潜在问题。
返回JSON格式，包含：
- isValid: 是否通过验证（布尔值）
- warnings: 警告列表（不影响发布但建议修改）
- suggestions: 改进建议列表
- plotHoles: 剧情漏洞列表
- pacingIssues: 节奏问题列表`;

    const userPrompt = `请审查以下大纲结构：

粗纲：
${JSON.stringify(roughOutline, null, 2)}

细纲：
${JSON.stringify(detailedOutline, null, 2)}

章节大纲：
${JSON.stringify(chapterOutlines, null, 2)}

请检查：
1. 剧情逻辑是否自洽
2. 人物行为是否合理
3. 节奏是否均衡
4. 伏笔是否有回收
5. 高潮分布是否合理`;

    try {
      const result = await ai.generateJSON<OutlineValidationOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Validation complete');
      
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
      logger.error('Outline validation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const defaultConfig: PipelineConfig = {
  maxRetries: 3,
  retryDelayMs: 3000,
  exponentialBackoff: true,
  timeoutMs: 15 * 60 * 1000,
  enableCheckpoints: true,
  enableParallel: false,
};

export const OutlinePipeline: Pipeline = {
  id: 'outline',
  name: '大纲生成',
  description: 'Generate novel outline from rough to detailed to chapter level',
  stages: [
    roughOutlineStage as Stage,
    detailedOutlineStage as Stage,
    chapterOutlineStage as Stage,
    outlineValidationStage as Stage,
  ],
  defaultConfig,
};

registerPipeline(OutlinePipeline);

export default OutlinePipeline;
