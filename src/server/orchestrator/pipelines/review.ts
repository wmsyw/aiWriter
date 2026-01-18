import type {
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineConfig,
} from '../types';
import { registerPipeline } from '../engine';
import { createPipelineAI } from '@/src/server/services/pipeline-ai';

interface QualityCheckInput {
  novelId: string;
  chapterId: string;
  content: string;
  chapterNumber?: number;
}

interface QualityDimensions {
  readability: number;
  engagement: number;
  pacing: number;
  dialogue: number;
  description: number;
  emotionalImpact: number;
  hookStrength: number;
  characterVoice: number;
  worldBuilding: number;
}

interface QualityCheckOutput {
  score: number;
  feedback: string[];
  dimensions: QualityDimensions;
  toxicPatterns: string[];
}

interface ConsistencyCheckInput {
  novelId: string;
  chapterId: string;
  content: string;
  worldSetting?: string;
  characters?: unknown[];
  previousSummary?: string;
}

interface ConsistencyCheckOutput {
  isConsistent: boolean;
  issues: string[];
  characterInconsistencies: string[];
  plotHoles: string[];
  settingViolations: string[];
}

interface OutlineAdherenceInput {
  novelId: string;
  chapterId: string;
  content: string;
  chapterOutline?: string;
}

interface OutlineAdherenceOutput {
  adherenceScore: number;
  deviations: string[];
  severity: 'minor' | 'major' | 'critical';
  missedElements: string[];
  addedElements: string[];
}

interface AggregateScoreInput {
  novelId: string;
  chapterId: string;
  qualityScore: number;
  qualityDimensions: QualityDimensions;
  consistencyResult: ConsistencyCheckOutput;
  adherenceScore: number;
}

interface AggregateScoreOutput {
  overallScore: number;
  breakdown: Record<string, number>;
  recommendation: string;
  prioritizedIssues: string[];
}

interface ReviewDecisionInput {
  novelId: string;
  chapterId: string;
  overallScore: number;
  breakdown: Record<string, number>;
  issues?: string[];
}

interface ReviewDecisionOutput {
  decision: 'approve' | 'minor_revision' | 'major_revision' | 'reject';
  reason: string;
  actionItems: string[];
}

const qualityCheckStage: Stage<QualityCheckInput, QualityCheckOutput> = {
  id: 'quality-check',
  name: '质量检查',
  type: 'review',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<QualityCheckInput>): Promise<StageResult<QualityCheckOutput>> {
    const { input, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    logger.info('Running quality check', { chapterId: input.chapterId });
    progress.report(30, 'Analyzing writing quality...');
    
    const systemPrompt = `你是一位资深的网文编辑，擅长评估章节质量。
请从多个维度对章节进行评分（1-10分）：
返回JSON格式：
- dimensions: 各维度评分
  - readability: 可读性
  - engagement: 吸引力
  - pacing: 节奏
  - dialogue: 对话质量
  - description: 描写水平
  - emotionalImpact: 情感冲击
  - hookStrength: 钩子强度
  - characterVoice: 角色声音
  - worldBuilding: 世界构建
- score: 综合评分（1-10）
- feedback: 具体反馈建议数组
- toxicPatterns: 发现的问题模式（如AI腔、重复用词等）`;

    const userPrompt = `请评估以下第${input.chapterNumber || '?'}章的质量：

${input.content}`;

    try {
      const result = await ai.generateJSON<QualityCheckOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Quality check complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { 
          qualityScore: result.data.score, 
          qualityDimensions: result.data.dimensions 
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
      logger.error('Quality check failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const consistencyCheckStage: Stage<ConsistencyCheckInput, ConsistencyCheckOutput> = {
  id: 'consistency-check',
  name: '一致性检查',
  type: 'review',
  estimatedDurationSec: 45,
  
  async execute(ctx: StageContext<ConsistencyCheckInput>): Promise<StageResult<ConsistencyCheckOutput>> {
    const { input, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    logger.info('Running consistency check', { chapterId: input.chapterId });
    progress.report(40, 'Checking character consistency...');
    
    const systemPrompt = `你是一位专业的网文连载编辑，擅长发现前后不一致的问题。
请检查章节内容与已有设定的一致性：
返回JSON格式：
- isConsistent: 是否整体一致（布尔值）
- issues: 所有发现的问题数组
- characterInconsistencies: 角色相关不一致
- plotHoles: 剧情漏洞
- settingViolations: 违反世界观设定的地方`;

    const userPrompt = `请检查以下章节的一致性：

【章节内容】
${input.content}

${input.worldSetting ? `【世界观设定】\n${input.worldSetting}` : ''}

${input.characters ? `【角色设定】\n${JSON.stringify(input.characters, null, 2)}` : ''}

${input.previousSummary ? `【前情提要】\n${input.previousSummary}` : ''}`;

    try {
      const result = await ai.generateJSON<ConsistencyCheckOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Consistency check complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { consistencyResult: result.data },
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
      logger.error('Consistency check failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const outlineAdherenceStage: Stage<OutlineAdherenceInput, OutlineAdherenceOutput> = {
  id: 'outline-adherence',
  name: '大纲符合度',
  type: 'review',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<OutlineAdherenceInput>): Promise<StageResult<OutlineAdherenceOutput>> {
    const { input, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    logger.info('Checking outline adherence', { chapterId: input.chapterId });
    progress.report(50, 'Comparing with planned outline...');
    
    if (!input.chapterOutline) {
      progress.report(100, 'No outline to compare - skipping');
      return {
        success: true,
        output: {
          adherenceScore: 1.0,
          deviations: [],
          severity: 'minor',
          missedElements: [],
          addedElements: [],
        },
        contextUpdate: { adherenceScore: 1.0 },
      };
    }
    
    const systemPrompt = `你是一位专业的网文策划编辑，擅长比对大纲与实际内容。
请检查章节内容与大纲的符合程度：
返回JSON格式：
- adherenceScore: 符合度分数（0-1）
- deviations: 偏离大纲的地方
- severity: 偏离严重程度（minor/major/critical）
- missedElements: 大纲要求但章节未写的内容
- addedElements: 大纲未要求但章节添加的内容`;

    const userPrompt = `请检查章节与大纲的符合度：

【章节大纲】
${input.chapterOutline}

【章节内容】
${input.content}`;

    try {
      const result = await ai.generateJSON<OutlineAdherenceOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Adherence check complete');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { adherenceScore: result.data.adherenceScore },
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
      logger.error('Outline adherence check failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const aggregateScoreStage: Stage<AggregateScoreInput, AggregateScoreOutput> = {
  id: 'aggregate-score',
  name: '综合评分',
  type: 'review',
  estimatedDurationSec: 10,
  
  async execute(ctx: StageContext<AggregateScoreInput>): Promise<StageResult<AggregateScoreOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    
    logger.info('Aggregating scores', { chapterId: input.chapterId });
    progress.report(70, 'Calculating final score...');
    
    const qualityScore = (pipelineContext.qualityScore as number) ?? input.qualityScore;
    const consistencyResult = (pipelineContext.consistencyResult as ConsistencyCheckOutput) ?? input.consistencyResult;
    const adherenceScore = (pipelineContext.adherenceScore as number) ?? input.adherenceScore;
    
    const weights = {
      quality: 0.4,
      consistency: 0.3,
      adherence: 0.3,
    };
    
    const consistencyScore = consistencyResult.isConsistent ? 9 : 
      (10 - Math.min(consistencyResult.issues.length * 1.5, 5));
    
    const overallScore = 
      qualityScore * weights.quality +
      consistencyScore * weights.consistency +
      adherenceScore * 10 * weights.adherence;
    
    const breakdown = {
      quality: qualityScore,
      consistency: consistencyScore,
      adherence: adherenceScore * 10,
    };
    
    const prioritizedIssues: string[] = [];
    
    if (!consistencyResult.isConsistent) {
      prioritizedIssues.push(...consistencyResult.issues.slice(0, 3));
    }
    if (adherenceScore < 0.7) {
      prioritizedIssues.push('Major deviation from outline');
    }
    if (qualityScore < 6) {
      prioritizedIssues.push('Overall quality needs improvement');
    }
    
    let recommendation = 'Approve';
    if (overallScore < 5) recommendation = 'Complete rewrite recommended';
    else if (overallScore < 6) recommendation = 'Major revision needed';
    else if (overallScore < 7) recommendation = 'Minor revision recommended';
    
    progress.report(100, 'Score aggregation complete');
    
    return {
      success: true,
      output: {
        overallScore,
        breakdown,
        recommendation,
        prioritizedIssues,
      },
      contextUpdate: { overallScore, scoreBreakdown: breakdown },
    };
  },
};

const reviewDecisionStage: Stage<ReviewDecisionInput, ReviewDecisionOutput> = {
  id: 'review-decision',
  name: '审查决策',
  type: 'review',
  estimatedDurationSec: 5,
  
  async execute(ctx: StageContext<ReviewDecisionInput>): Promise<StageResult<ReviewDecisionOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    
    const overallScore = (pipelineContext.overallScore as number) ?? input.overallScore;
    const breakdown = (pipelineContext.scoreBreakdown as Record<string, number>) ?? input.breakdown;
    
    logger.info('Making review decision', { 
      chapterId: input.chapterId,
      score: overallScore 
    });
    progress.report(80, 'Determining verdict...');
    
    let decision: ReviewDecisionOutput['decision'];
    let reason: string;
    const actionItems: string[] = [];
    
    if (overallScore >= 8) {
      decision = 'approve';
      reason = 'Chapter meets quality standards';
    } else if (overallScore >= 7) {
      decision = 'minor_revision';
      reason = 'Minor improvements needed';
      if (breakdown.quality < 7) actionItems.push('Improve writing quality');
      if (breakdown.consistency < 7) actionItems.push('Fix consistency issues');
      if (breakdown.adherence < 7) actionItems.push('Align better with outline');
    } else if (overallScore >= 5) {
      decision = 'major_revision';
      reason = 'Significant revision required';
      if (breakdown.quality < 6) actionItems.push('Major quality improvement needed');
      if (breakdown.consistency < 6) actionItems.push('Resolve consistency problems');
      if (breakdown.adherence < 6) actionItems.push('Rewrite to match outline');
      if (input.issues) actionItems.push(...input.issues.slice(0, 2));
    } else {
      decision = 'reject';
      reason = 'Chapter does not meet minimum standards';
      actionItems.push('Complete rewrite recommended');
      actionItems.push('Review outline before rewriting');
    }
    
    progress.report(100, 'Decision made');
    
    return {
      success: true,
      output: {
        decision,
        reason,
        actionItems,
      },
    };
  },
};

const defaultConfig: PipelineConfig = {
  maxRetries: 2,
  retryDelayMs: 2000,
  exponentialBackoff: true,
  timeoutMs: 5 * 60 * 1000,
  enableCheckpoints: true,
  enableParallel: false,
};

export const ReviewPipeline: Pipeline = {
  id: 'review',
  name: '章节审查',
  description: 'Review a chapter for quality, consistency, and outline adherence',
  stages: [
    qualityCheckStage as Stage,
    consistencyCheckStage as Stage,
    outlineAdherenceStage as Stage,
    aggregateScoreStage as Stage,
    reviewDecisionStage as Stage,
  ],
  defaultConfig,
};

registerPipeline(ReviewPipeline);

export default ReviewPipeline;
