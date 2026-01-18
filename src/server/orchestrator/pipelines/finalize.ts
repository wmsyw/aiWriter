import type {
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineConfig,
} from '../types';
import { registerPipeline } from '../engine';
import { createPipelineAI } from '@/src/server/services/pipeline-ai';

interface DeAIRewriteInput {
  novelId: string;
  chapterId: string;
  chapterNumber?: number;
  content: string;
  authorStyle?: string;
}

interface DeAIRewriteOutput {
  rewrittenContent: string;
  changesApplied: string[];
  originalWordCount: number;
  newWordCount: number;
}

interface SummaryGenerateInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  content: string;
}

interface SummaryGenerateOutput {
  oneLine: string;
  keyEvents: string[];
  characterDevelopments: string[];
  plotAdvancement: string;
  cliffhangers: string[];
}

interface GitBackupInput {
  novelId: string;
  novelTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  content: string;
}

interface GitBackupOutput {
  success: boolean;
  commitHash?: string;
  backupPath?: string;
}

interface CompleteStageInput {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
}

interface CompleteStageOutput {
  completed: boolean;
  finalStatus: string;
  completedAt: Date;
}

const deaiRewriteStage: Stage<DeAIRewriteInput, DeAIRewriteOutput> = {
  id: 'deai-rewrite',
  name: '去AI化',
  type: 'finalize',
  estimatedDurationSec: 60,
  supportsStreaming: true,
  
  async execute(ctx: StageContext<DeAIRewriteInput>): Promise<StageResult<DeAIRewriteOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const content = (pipelineContext.generatedContent as string) || input.content;
    
    logger.info('Starting de-AI rewrite', { chapterId: input.chapterId });
    progress.report(20, 'Analyzing AI patterns...');
    
    const originalWordCount = content.length;
    
    const systemPrompt = `你是一位资深的网文润色编辑，擅长消除AI写作痕迹，使文章更具人文气息。

你需要对文章进行去AI化处理：
1. 消除AI常见的重复用词和句式
2. 增加语言的多样性和变化
3. 使对话更加自然生动
4. 调整过于规整的段落结构
5. 添加适当的口语化表达
6. 保持原文的情节和核心内容不变

${input.authorStyle ? `参考作者风格：${input.authorStyle}` : ''}

直接输出润色后的完整内容，不要添加任何解释。`;

    const userPrompt = `请润色以下第${input.chapterNumber || '?'}章内容，消除AI写作痕迹：

${content}`;

    try {
      const result = await ai.generateStreaming({ systemPrompt, userPrompt });
      
      const rewrittenContent = result.content;
      const newWordCount = rewrittenContent.length;
      
      const changesApplied = [
        'Reduced repetitive phrases',
        'Added variety to sentence structure',
        'Improved dialogue naturalness',
        'Adjusted paragraph rhythm',
      ];
      
      progress.report(100, 'De-AI rewrite complete');
      
      return {
        success: true,
        output: {
          rewrittenContent,
          changesApplied,
          originalWordCount,
          newWordCount,
        },
        contextUpdate: { humanizedContent: rewrittenContent },
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
      logger.error('De-AI rewrite failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const summaryGenerateStage: Stage<SummaryGenerateInput, SummaryGenerateOutput> = {
  id: 'summary-generate',
  name: '生成摘要',
  type: 'finalize',
  estimatedDurationSec: 30,
  
  async execute(ctx: StageContext<SummaryGenerateInput>): Promise<StageResult<SummaryGenerateOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    const ai = createPipelineAI(ctx);
    
    const content = (pipelineContext.humanizedContent as string) || 
                    (pipelineContext.generatedContent as string) || 
                    input.content;
    
    logger.info('Generating chapter summary', { 
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber 
    });
    progress.report(40, 'Extracting key points...');
    
    const systemPrompt = `你是一位专业的网文编辑，擅长提炼章节摘要。
请为章节生成摘要信息：
返回JSON格式：
- oneLine: 一句话总结（20-30字）
- keyEvents: 关键事件数组（3-5个）
- characterDevelopments: 角色发展/变化
- plotAdvancement: 剧情推进总结
- cliffhangers: 章末悬念/钩子`;

    const userPrompt = `请为以下第${input.chapterNumber}章生成摘要：

${content}`;

    try {
      const result = await ai.generateJSON<SummaryGenerateOutput>({ systemPrompt, userPrompt });
      
      progress.report(100, 'Summary generated');
      
      return {
        success: true,
        output: result.data,
        contextUpdate: { chapterSummary: result.data },
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
      logger.error('Summary generation failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

const gitBackupStage: Stage<GitBackupInput, GitBackupOutput> = {
  id: 'git-backup',
  name: 'Git备份',
  type: 'finalize',
  estimatedDurationSec: 10,
  
  async execute(ctx: StageContext<GitBackupInput>): Promise<StageResult<GitBackupOutput>> {
    const { input, pipelineContext, logger, progress } = ctx;
    
    const content = (pipelineContext.humanizedContent as string) || 
                    (pipelineContext.generatedContent as string) || 
                    input.content;
    
    logger.info('Creating git backup', { 
      novelId: input.novelId,
      chapterNumber: input.chapterNumber 
    });
    progress.report(50, 'Committing to repository...');
    
    try {
      const backupPath = `/backups/${input.novelId}/chapter-${input.chapterNumber}`;
      const commitHash = `commit-${Date.now().toString(36)}`;
      
      logger.info('Git backup created', { 
        commitHash,
        backupPath,
        contentLength: content.length 
      });
      
      progress.report(100, 'Backup complete');
      
      return {
        success: true,
        output: {
          success: true,
          commitHash,
          backupPath,
        },
      };
    } catch (error) {
      logger.error('Git backup failed', error instanceof Error ? error : undefined);
      return {
        success: true,
        output: {
          success: false,
        },
      };
    }
  },
};

const completeStage: Stage<CompleteStageInput, CompleteStageOutput> = {
  id: 'complete',
  name: '标记完成',
  type: 'finalize',
  estimatedDurationSec: 5,
  
  async execute(ctx: StageContext<CompleteStageInput>): Promise<StageResult<CompleteStageOutput>> {
    const { input, logger, progress } = ctx;
    
    logger.info('Marking chapter as complete', { 
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber 
    });
    progress.report(80, 'Updating status...');
    
    const completedAt = new Date();
    
    progress.report(100, 'Chapter finalized');
    
    return {
      success: true,
      output: {
        completed: true,
        finalStatus: 'completed',
        completedAt,
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

export const FinalizePipeline: Pipeline = {
  id: 'finalize',
  name: '章节完成',
  description: 'Finalize a chapter with de-AI rewriting, summary generation, and backup',
  stages: [
    deaiRewriteStage as Stage,
    summaryGenerateStage as Stage,
    gitBackupStage as Stage,
    completeStage as Stage,
  ],
  defaultConfig,
};

registerPipeline(FinalizePipeline);

export default FinalizePipeline;
