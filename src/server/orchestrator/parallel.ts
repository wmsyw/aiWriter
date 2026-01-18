import type { 
  Pipeline,
  Stage,
  StageContext,
  StageResult,
  PipelineEvent,
  PipelineConfig,
  StageExecution,
  StageStatus,
} from './types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface ParallelExecutionResult<T = unknown> {
  results: Map<string, StageResult<T>>;
  failed: string[];
  succeeded: string[];
  duration: number;
}

export interface ParallelStageGroup {
  groupId: string;
  stages: Stage[];
  maxConcurrency?: number;
}

export interface ParallelExecutorOptions {
  maxConcurrency: number;
  stopOnFirstFailure: boolean;
  timeoutMs: number;
  onStageStart?: (stageId: string) => void;
  onStageComplete?: (stageId: string, result: StageResult) => void;
  onProgress?: (completed: number, total: number) => void;
}

const DEFAULT_OPTIONS: ParallelExecutorOptions = {
  maxConcurrency: 3,
  stopOnFirstFailure: false,
  timeoutMs: 5 * 60 * 1000,
};

export class ParallelExecutor {
  private activeAbortController: AbortController | null = null;
  private activeExecutions: Map<string, Promise<StageResult>> = new Map();

  async executeParallel<TInput, TOutput>(
    stages: Stage<TInput, TOutput>[],
    contextFactory: (stage: Stage<TInput, TOutput>) => StageContext<TInput>,
    options: Partial<ParallelExecutorOptions> = {}
  ): Promise<ParallelExecutionResult<TOutput>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    const results = new Map<string, StageResult<TOutput>>();
    const failed: string[] = [];
    const succeeded: string[] = [];

    const semaphore = new Semaphore(opts.maxConcurrency);
    const pendingStages = [...stages];
    const executionPromises: Promise<void>[] = [];

    for (const stage of pendingStages) {
      const promise = (async () => {
        await semaphore.acquire();
        
        if (abortController.signal.aborted) {
          semaphore.release();
          return;
        }

        try {
          opts.onStageStart?.(stage.id);
          
          const ctx = contextFactory(stage);
          const result = await this.executeWithTimeout(
            stage,
            ctx,
            opts.timeoutMs,
            abortController.signal
          );
          
          results.set(stage.id, result);
          
          if (result.success) {
            succeeded.push(stage.id);
          } else {
            failed.push(stage.id);
            if (opts.stopOnFirstFailure) {
              abortController.abort();
            }
          }
          
          opts.onStageComplete?.(stage.id, result);
          opts.onProgress?.(succeeded.length + failed.length, stages.length);
        } finally {
          semaphore.release();
        }
      })();

      executionPromises.push(promise);
    }

    await Promise.all(executionPromises);
    
    this.activeAbortController = null;

    return {
      results,
      failed,
      succeeded,
      duration: Date.now() - startTime,
    };
  }

  async executeGroups<TInput, TOutput>(
    groups: ParallelStageGroup[],
    contextFactory: (stage: Stage) => StageContext<TInput>,
    options: Partial<ParallelExecutorOptions> = {}
  ): Promise<Map<string, ParallelExecutionResult<TOutput>>> {
    const groupResults = new Map<string, ParallelExecutionResult<TOutput>>();

    for (const group of groups) {
      const groupOpts = {
        ...options,
        maxConcurrency: group.maxConcurrency ?? options.maxConcurrency,
      };

      const result = await this.executeParallel(
        group.stages as Stage<TInput, TOutput>[],
        contextFactory as (stage: Stage<TInput, TOutput>) => StageContext<TInput>,
        groupOpts
      );

      groupResults.set(group.groupId, result);

      if (result.failed.length > 0 && options.stopOnFirstFailure) {
        break;
      }
    }

    return groupResults;
  }

  private async executeWithTimeout<TInput, TOutput>(
    stage: Stage<TInput, TOutput>,
    ctx: StageContext<TInput>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<StageResult<TOutput>> {
    return new Promise<StageResult<TOutput>>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: `Stage ${stage.id} timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      const handleAbort = () => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: 'Execution aborted',
        });
      };

      signal.addEventListener('abort', handleAbort, { once: true });

      stage.execute({ ...ctx, signal })
        .then((result) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', handleAbort);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', handleAbort);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorDetails: error,
          });
        });
    });
  }

  abort(): void {
    this.activeAbortController?.abort();
  }

  isAborted(): boolean {
    return this.activeAbortController?.signal.aborted ?? false;
  }
}

class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

export class ChapterBatchGenerator {
  private executor: ParallelExecutor;

  constructor() {
    this.executor = new ParallelExecutor();
  }

  async generateChapterBatch(
    chapterIds: string[],
    novelId: string,
    userId: string,
    chapterPipeline: Pipeline,
    config: PipelineConfig,
    options: {
      maxConcurrency?: number;
      onChapterStart?: (chapterId: string) => void;
      onChapterComplete?: (chapterId: string, success: boolean) => void;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<Map<string, StageResult>> {
    const chapterStages: Stage[] = chapterIds.map((chapterId) => ({
      id: `chapter-${chapterId}`,
      name: `Generate Chapter ${chapterId}`,
      type: 'chapter' as const,
      execute: async (ctx: StageContext): Promise<StageResult> => {
        const results: StageResult[] = [];
        
        for (const stage of chapterPipeline.stages) {
          const stageCtx: StageContext = {
            ...ctx,
            pipelineContext: {
              ...ctx.pipelineContext,
              ...results.reduce((acc, r) => ({ ...acc, ...r.contextUpdate }), {}),
            },
          };
          
          const result = await stage.execute(stageCtx);
          results.push(result);
          
          if (!result.success) {
            return result;
          }
        }
        
        const lastResult = results[results.length - 1];
        return {
          success: true,
          output: lastResult?.output,
          contextUpdate: results.reduce((acc, r) => ({ ...acc, ...r.contextUpdate }), {}),
        };
      },
    }));

    const contextFactory = (stage: Stage): StageContext => {
      const chapterId = stage.id.replace('chapter-', '');
      return {
        executionId: generateId(),
        novelId,
        userId,
        chapterId,
        input: { chapterId },
        pipelineContext: {},
        config: config.stageConfigs?.[stage.id] ?? {},
        logger: createNoOpLogger(),
        progress: createNoOpProgress(),
      };
    };

    const result = await this.executor.executeParallel(
      chapterStages,
      contextFactory,
      {
        maxConcurrency: options.maxConcurrency ?? 3,
        stopOnFirstFailure: false,
        onStageStart: (stageId) => {
          const chapterId = stageId.replace('chapter-', '');
          options.onChapterStart?.(chapterId);
        },
        onStageComplete: (stageId, stageResult) => {
          const chapterId = stageId.replace('chapter-', '');
          options.onChapterComplete?.(chapterId, stageResult.success);
        },
        onProgress: options.onProgress,
      }
    );

    return result.results;
  }

  abort(): void {
    this.executor.abort();
  }
}

export class BranchGenerator {
  private executor: ParallelExecutor;

  constructor() {
    this.executor = new ParallelExecutor();
  }

  async generateBranches(
    branchCount: number,
    novelId: string,
    userId: string,
    chapterId: string,
    generateStage: Stage,
    baseContext: Record<string, unknown>,
    options: {
      maxConcurrency?: number;
      onBranchComplete?: (branchIndex: number, success: boolean) => void;
    } = {}
  ): Promise<StageResult[]> {
    const branchStages: Stage[] = Array.from({ length: branchCount }, (_, i) => ({
      id: `branch-${i}`,
      name: `Generate Branch ${i + 1}`,
      type: 'chapter' as const,
      execute: async (ctx: StageContext): Promise<StageResult> => {
        const branchCtx: StageContext = {
          ...ctx,
          pipelineContext: {
            ...ctx.pipelineContext,
            branchIndex: i,
            branchSeed: Math.random(),
          },
        };
        return generateStage.execute(branchCtx);
      },
    }));

    const contextFactory = (stage: Stage): StageContext => ({
      executionId: generateId(),
      novelId,
      userId,
      chapterId,
      input: baseContext,
      pipelineContext: baseContext,
      config: {},
      logger: createNoOpLogger(),
      progress: createNoOpProgress(),
    });

    const result = await this.executor.executeParallel(
      branchStages,
      contextFactory,
      {
        maxConcurrency: options.maxConcurrency ?? branchCount,
        stopOnFirstFailure: false,
        onStageComplete: (stageId, stageResult) => {
          const branchIndex = parseInt(stageId.replace('branch-', ''), 10);
          options.onBranchComplete?.(branchIndex, stageResult.success);
        },
      }
    );

    return Array.from(result.results.values());
  }

  abort(): void {
    this.executor.abort();
  }
}

function createNoOpLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createNoOpProgress() {
  return {
    report: () => {},
    step: () => {},
  };
}
