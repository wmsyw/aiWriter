import type {
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import { registerPipeline } from '../engine';
import { createPipelineAI } from '@/src/server/services/pipeline-ai';

interface NovelSeedInput {
  title: string;
  theme?: string;
  genre?: string;
  keywords?: string[];
  protagonist?: string;
  specialRequirements?: string;
}

interface NovelSeedOutput {
  synopsis?: string;
  goldenFinger?: string;
  worldSetting?: string;
  worldTimePeriod?: string;
  worldLocation?: string;
  worldAtmosphere?: string;
  worldRules?: string;
}

interface WorldBuildingInput extends NovelSeedOutput {
  novelId: string;
  title?: string;
  theme?: string;
  genre?: string;
}

interface WorldBuildingOutput {
  worldSetting: string;
  worldTimePeriod?: string;
  worldLocation?: string;
  worldAtmosphere?: string;
  worldRules?: string;
}

interface CharacterGenInput {
  novelId: string;
  title?: string;
  theme?: string;
  genre?: string;
  worldSetting?: string;
  protagonist?: string;
  characterCount?: number;
}

interface CharacterGenOutput {
  characters: Array<{
    name: string;
    role: string;
    description: string;
    traits?: string;
    goals?: string;
  }>;
}

interface GoldenFingerInput {
  novelId: string;
  title: string;
  genre?: string;
  theme?: string;
  worldSetting?: string;
  targetWords?: number;
}

interface GoldenFingerOutput {
  goldenFinger: string;
  name?: string;
  coreAbility?: string;
  growthStages?: string[];
  limitations?: string[];
}

const seedStage: Stage<NovelSeedInput, NovelSeedOutput> = {
  id: 'seed',
  name: '生成种子',
  type: 'setup',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<NovelSeedInput>): Promise<StageResult<NovelSeedOutput>> {
    const { input, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    logger.info('Starting novel seed generation', { title: input.title });
    progress.report(10, 'Generating novel concept...');
    
    const systemPrompt = `你是一位专业的网文策划编辑，擅长为网络小说构思创意种子。
你需要根据用户提供的信息，生成一个完整的小说概念种子。
返回JSON格式，包含以下字段：
- synopsis: 故事简介（200-300字）
- goldenFinger: 主角的金手指/特殊能力概念
- worldSetting: 世界观概述
- worldTimePeriod: 时代背景
- worldLocation: 主要地点
- worldAtmosphere: 整体氛围
- worldRules: 世界规则（如修炼体系）`;

    const userPrompt = `请为以下小说构思种子：
标题：${input.title}
${input.theme ? `主题：${input.theme}` : ''}
${input.genre ? `类型：${input.genre}` : ''}
${input.keywords?.length ? `关键词：${input.keywords.join('、')}` : ''}
${input.protagonist ? `主角设定：${input.protagonist}` : ''}
${input.specialRequirements ? `特殊要求：${input.specialRequirements}` : ''}`;

    try {
      const result = await ai.generateJSON<NovelSeedOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Seed generation complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { seed: result.data },
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
      logger.error('Seed generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const worldBuildingStage: Stage<WorldBuildingInput, WorldBuildingOutput> = {
  id: 'world-building',
  name: '构建世界观',
  type: 'setup',
  estimatedDurationSec: 45,
  
  async execute(ctx: StageContext<WorldBuildingInput>): Promise<StageResult<WorldBuildingOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const seed = (pipelineContext.seed as NovelSeedOutput) || input;
    
    logger.info('Starting world building', { novelId: input.novelId });
    progress.report(20, 'Expanding world setting...');
    
    const systemPrompt = `你是一位专业的网文世界观设计师，擅长构建完整、自洽的小说世界观。
根据已有的种子信息，扩展并完善世界观设定。
返回JSON格式，包含以下字段：
- worldSetting: 完整的世界观描述（500-800字）
- worldTimePeriod: 详细的时代背景
- worldLocation: 主要地点及其特色
- worldAtmosphere: 整体氛围与风格
- worldRules: 详细的世界规则（如力量体系、社会制度等）`;

    const userPrompt = `请基于以下信息完善世界观：
${seed.synopsis ? `故事简介：${seed.synopsis}` : ''}
${seed.worldSetting ? `初步世界观：${seed.worldSetting}` : ''}
${seed.worldTimePeriod ? `时代：${seed.worldTimePeriod}` : ''}
${seed.worldLocation ? `地点：${seed.worldLocation}` : ''}
${seed.worldAtmosphere ? `氛围：${seed.worldAtmosphere}` : ''}
${seed.worldRules ? `规则：${seed.worldRules}` : ''}`;

    try {
      const result = await ai.generateJSON<WorldBuildingOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'World building complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { world: result.data },
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
      logger.error('World building failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const characterGenStage: Stage<CharacterGenInput, CharacterGenOutput> = {
  id: 'character-gen',
  name: '创建角色',
  type: 'setup',
  estimatedDurationSec: 60,
  
  async execute(ctx: StageContext<CharacterGenInput>): Promise<StageResult<CharacterGenOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const seed = pipelineContext.seed as NovelSeedOutput | undefined;
    const world = pipelineContext.world as WorldBuildingOutput | undefined;
    const count = input.characterCount || 5;
    
    logger.info('Starting character generation', { novelId: input.novelId, characterCount: count });
    progress.report(10, 'Designing characters...');
    
    const systemPrompt = `你是一位专业的网文角色设计师，擅长创建立体、有魅力的角色。
根据世界观和故事设定，创建一组角色。
返回JSON格式，包含characters数组，每个角色包含：
- name: 角色名称
- role: 角色定位（protagonist/antagonist/mentor/rival/love_interest/sidekick/supporting）
- description: 角色描述（100-150字）
- traits: 性格特点
- goals: 角色目标与动机`;

    const userPrompt = `请创建${count}个角色：
${input.protagonist ? `主角设定参考：${input.protagonist}` : ''}
${seed?.synopsis ? `故事背景：${seed.synopsis}` : ''}
${world?.worldSetting ? `世界观：${world.worldSetting}` : ''}
${input.genre ? `类型：${input.genre}` : ''}
${input.theme ? `主题：${input.theme}` : ''}

要求：
1. 第一个必须是主角
2. 包含至少一个对手/反派
3. 每个角色都要有明确的动机和特点
4. 角色之间要有潜在的关系和冲突`;

    try {
      const result = await ai.generateJSON<CharacterGenOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Character generation complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { characters: result.data.characters },
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
      logger.error('Character generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const goldenFingerStage: Stage<GoldenFingerInput, GoldenFingerOutput> = {
  id: 'golden-finger',
  name: '设计金手指',
  type: 'setup',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<GoldenFingerInput>): Promise<StageResult<GoldenFingerOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const seed = pipelineContext.seed as NovelSeedOutput | undefined;
    const world = pipelineContext.world as WorldBuildingOutput | undefined;
    
    logger.info('Starting golden finger design', { novelId: input.novelId });
    progress.report(30, 'Designing power system...');
    
    const systemPrompt = `你是一位专业的网文金手指设计师，擅长设计有吸引力且平衡的主角特殊能力/系统。
设计一个符合世界观的金手指系统。
返回JSON格式，包含：
- goldenFinger: 金手指完整描述（300-500字）
- name: 金手指名称
- coreAbility: 核心能力
- growthStages: 成长阶段数组（4-6个阶段）
- limitations: 限制条件数组（让金手指不至于过于逆天）`;

    const userPrompt = `请设计金手指系统：
${input.title ? `小说标题：${input.title}` : ''}
${input.genre ? `类型：${input.genre}` : ''}
${seed?.goldenFinger ? `初步构思：${seed.goldenFinger}` : ''}
${world?.worldRules ? `世界规则：${world.worldRules}` : ''}
${input.targetWords ? `目标字数：${input.targetWords}万字` : ''}

要求：
1. 金手指要有明确的成长路线
2. 既要强力又要有合理限制
3. 能够支撑故事发展的多个阶段
4. 符合网文读者的爽感预期`;

    try {
      const result = await ai.generateJSON<GoldenFingerOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Golden finger design complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { goldenFinger: result.data },
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
      logger.error('Golden finger design failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const defaultConfig: PipelineConfig = {
  maxRetries: 3,
  retryDelayMs: 2000,
  exponentialBackoff: true,
  timeoutMs: 5 * 60 * 1000,
  enableCheckpoints: true,
  enableParallel: false,
};

export const SetupPipeline: Pipeline = {
  id: 'novel-setup',
  name: '小说初始化',
  description: 'Initialize a new novel with seed, world building, characters, and golden finger',
  stages: [
    seedStage as Stage,
    worldBuildingStage as Stage,
    characterGenStage as Stage,
    goldenFingerStage as Stage,
  ],
  defaultConfig,
};

registerPipeline(SetupPipeline);

export default SetupPipeline;
