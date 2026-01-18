import type {
  Pipeline,
  PipelineType,
  PipelineInput,
  PipelineOutput,
  PipelineEvent,
  PipelineConfig,
  Stage,
  StageContext,
  StageResult,
  StageExecution,
  StageLogger,
  ProgressReporter,
  OrchestratorOptions,
  IOrchestrator,
  DEFAULT_PIPELINE_CONFIG,
} from './types';
import { PipelineStateMachine } from './state-machine';
import {
  CheckpointManager,
  RecoveryManager,
  ExecutionPersistence,
} from './recovery';
import { getLockManager, type DistributedLock } from './locking';
import { prisma } from '../db';

type PipelineRegistry = Map<PipelineType, Pipeline>;

const pipelineRegistry: PipelineRegistry = new Map();

export function registerPipeline(pipeline: Pipeline): void {
  pipelineRegistry.set(pipeline.id, pipeline);
}

export function getPipeline(type: PipelineType): Pipeline | undefined {
  return pipelineRegistry.get(type);
}

function createStageLogger(
  executionId: string,
  stageId: string,
  stageName: string
): StageLogger {
  const prefix = `[Pipeline:${executionId}][Stage:${stageName}]`;
  return {
    debug: (message, data) => console.debug(`${prefix} ${message}`, data ?? ''),
    info: (message, data) => console.info(`${prefix} ${message}`, data ?? ''),
    warn: (message, data) => console.warn(`${prefix} ${message}`, data ?? ''),
    error: (message, error, data) => console.error(`${prefix} ${message}`, error ?? '', data ?? ''),
  };
}

function createProgressReporter(
  onEvent?: (event: PipelineEvent) => void,
  executionId?: string,
  pipelineType?: PipelineType,
  stageId?: string
): ProgressReporter {
  return {
    report: (percent, message) => {
      if (onEvent && executionId && pipelineType && stageId) {
        onEvent({
          type: 'stage:progress',
          executionId,
          pipelineType,
          timestamp: new Date(),
          data: { stageId, percent, message },
        });
      }
    },
    step: (current, total, message) => {
      const percent = Math.round((current / total) * 100);
      if (onEvent && executionId && pipelineType && stageId) {
        onEvent({
          type: 'stage:progress',
          executionId,
          pipelineType,
          timestamp: new Date(),
          data: { stageId, percent, message, currentStep: current, totalSteps: total },
        });
      }
    },
    token: (token) => {
      if (onEvent && executionId && pipelineType && stageId) {
        onEvent({
          type: 'token:generated',
          executionId,
          pipelineType,
          timestamp: new Date(),
          data: { stageId, token, totalTokens: 0 },
        });
      }
    },
  };
}

function isRetryableError(errorMessage: string): boolean {
  const retryablePatterns = [
    'rate_limit',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'overloaded',
    'server_error',
    '503',
    '502',
    '429',
    'temporarily unavailable',
  ];
  const lowerMsg = errorMessage.toLowerCase();
  return retryablePatterns.some(pattern => lowerMsg.includes(pattern.toLowerCase()));
}

async function executeStageWithRetry<TInput, TOutput>(
  stage: Stage<TInput, TOutput>,
  ctx: StageContext<TInput>,
  config: PipelineConfig
): Promise<StageResult<TOutput>> {
  const maxRetries = stage.retryConfig?.maxRetries ?? config.maxRetries;
  const baseDelay = stage.retryConfig?.delayMs ?? config.retryDelayMs;
  const useBackoff = stage.retryConfig?.exponentialBackoff ?? config.exponentialBackoff;

  let lastError: Error | undefined;
  let lastResult: StageResult<TOutput> | undefined;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      if (stage.preCheck) {
        const preCheckResult = await stage.preCheck(ctx);
        if (!preCheckResult.canProceed) {
          return {
            success: false,
            error: preCheckResult.reason ?? 'Pre-check failed',
          };
        }
      }

      const result = await stage.execute(ctx);

      if (!result.success) {
        lastResult = result;
        lastError = new Error(result.error || 'Stage execution failed');
        
        const shouldRetry = isRetryableError(result.error || '');
        if (!shouldRetry) {
          ctx.logger.warn('Stage failed with non-retryable error', { error: result.error });
          return result;
        }
        
        retryCount++;
        if (retryCount <= maxRetries) {
          const delay = useBackoff ? baseDelay * Math.pow(2, retryCount - 1) : baseDelay;
          ctx.logger.warn(`Stage failed, retrying (${retryCount}/${maxRetries})`, {
            error: result.error,
            delayMs: delay,
          });
          await sleep(delay);
          continue;
        }
        return result;
      }

      if (result.success && stage.validate && result.output) {
        const validationResult = await stage.validate(ctx, result.output);
        if (!validationResult.valid) {
          return {
            success: false,
            error: `Validation failed: ${validationResult.errors?.join(', ')}`,
          };
        }
      }

      if (result.success && stage.postProcess) {
        return await stage.postProcess(ctx, result);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (stage.onError) {
        const handlerResult = await stage.onError(ctx, lastError, retryCount);
        if (!handlerResult.retry) {
          if (handlerResult.skip) {
            return { success: true, output: undefined };
          }
          return {
            success: false,
            error: handlerResult.customError ?? lastError.message,
          };
        }
        if (handlerResult.retryDelayMs) {
          await sleep(handlerResult.retryDelayMs);
        }
      }

      retryCount++;
      if (retryCount <= maxRetries) {
        const delay = useBackoff ? baseDelay * Math.pow(2, retryCount - 1) : baseDelay;
        ctx.logger.warn(`Stage threw exception, retrying (${retryCount}/${maxRetries})`, {
          error: lastError.message,
          delayMs: delay,
        });
        await sleep(delay);
      }
    }
  }

  return lastResult ?? {
    success: false,
    error: lastError?.message ?? 'Unknown error',
    errorDetails: lastError,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Orchestrator implements IOrchestrator {
  private checkpointManager: CheckpointManager;
  private recoveryManager: RecoveryManager;
  private executionPersistence: ExecutionPersistence;
  private activeExecutions: Map<string, AbortController> = new Map();
  private lockManager = getLockManager();

  constructor() {
    this.checkpointManager = new CheckpointManager();
    this.recoveryManager = new RecoveryManager(this.checkpointManager);
    this.executionPersistence = new ExecutionPersistence();
  }

  async execute(
    pipelineType: PipelineType,
    input: PipelineInput,
    options?: OrchestratorOptions
  ): Promise<PipelineOutput> {
    const pipeline = getPipeline(pipelineType);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineType}`);
    }

    const config: PipelineConfig = {
      ...pipeline.defaultConfig,
      ...input.config,
    };

    const targetResource = input.chapterId
      ? `chapter:${input.chapterId}`
      : `novel:${input.novelId}`;
    const lockResourceId = `pipeline:${pipelineType}:${targetResource}`;
    let lock: DistributedLock | null = null;
    
    try {
      lock = await this.lockManager.acquireLock(lockResourceId, {
        ttlMs: 10 * 60 * 1000,
        maxRetries: 0,
      });
      
      if (!lock) {
        throw new Error(`Pipeline ${pipelineType} is already running for this resource`);
      }

      let executionId: string;
      
      if (input.executionId) {
        executionId = input.executionId;
        await this.executionPersistence.updateExecution(executionId, {
          status: 'running',
          currentStageId: pipeline.stages[0].id,
          stageIndex: 0,
        });
      } else {
        executionId = await this.executionPersistence.createExecution({
          novelId: input.novelId,
          userId: input.userId,
          chapterId: input.chapterId,
          pipelineType,
          initialStageId: pipeline.stages[0].id,
          config: config as unknown as import('@prisma/client').Prisma.InputJsonValue,
        });
      }

      const stateMachine = PipelineStateMachine.create({
        executionId,
        pipelineType,
        novelId: input.novelId,
        userId: input.userId,
        chapterId: input.chapterId,
        config,
        initialStageId: pipeline.stages[0].id,
      });

      const abortController = new AbortController();
      this.activeExecutions.set(executionId, abortController);

      try {
        this.emitEvent(options?.onEvent, {
          type: 'pipeline:started',
          executionId,
          pipelineType,
          timestamp: new Date(),
          data: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            config,
            totalStages: pipeline.stages.length,
          },
        });

        stateMachine.start();
        await this.executionPersistence.updateExecution(executionId, { status: 'running' });

        let pipelineContext: Record<string, unknown> = input.input ?? {};

        for (let i = 0; i < pipeline.stages.length; i++) {
          if (abortController.signal.aborted) {
            stateMachine.cancel();
            await this.executionPersistence.updateExecution(executionId, {
              status: 'cancelled',
              completedAt: new Date(),
            });
            break;
          }

          if (lock) {
            try {
              await this.lockManager.extendLock(lockResourceId, 10 * 60 * 1000);
            } catch (lockError) {
              const errorMsg = lockError instanceof Error ? lockError.message : 'Unknown lock error';
              console.error(`[Pipeline:${executionId}] Lock extension failed: ${errorMsg}`);
              
              stateMachine.fail('Lock lost - aborting execution');
              await this.executionPersistence.updateExecution(executionId, {
                status: 'failed',
                error: 'Lock lost during execution - another process may have taken over',
                completedAt: new Date(),
              });
              
              this.emitEvent(options?.onEvent, {
                type: 'pipeline:failed',
                executionId,
                pipelineType,
                timestamp: new Date(),
                data: {
                  error: 'Lock lost during execution',
                  failedStageId: pipeline.stages[i]?.id ?? 'unknown',
                  failedStageIndex: i,
                  recoverable: true,
                },
              });
              
              return {
                executionId,
                status: 'failed',
                error: 'Lock lost during execution',
                state: stateMachine.getState(),
              };
            }
          }

          const stage = pipeline.stages[i];
          stateMachine.advanceToStage(stage.id, i);

          this.emitEvent(options?.onEvent, {
            type: 'stage:started',
            executionId,
            pipelineType,
            timestamp: new Date(),
            data: {
              stageId: stage.id,
              stageName: stage.name,
              stageIndex: i,
              totalStages: pipeline.stages.length,
            },
          });

          const stageStartTime = Date.now();
          const stageExecution: StageExecution = {
            stageId: stage.id,
            stageName: stage.name,
            status: 'running',
            retryCount: 0,
            startedAt: new Date(),
          };

          stateMachine.recordStageExecution(stageExecution);
          await this.executionPersistence.recordStageExecution(executionId, stageExecution);

          const stageContext: StageContext = {
            executionId,
            novelId: input.novelId,
            userId: input.userId,
            chapterId: input.chapterId,
            input: pipelineContext,
            pipelineContext,
            config: config.stageConfigs?.[stage.id] ?? {},
            signal: abortController.signal,
            logger: createStageLogger(executionId, stage.id, stage.name),
            progress: createProgressReporter(options?.onEvent, executionId, pipelineType, stage.id),
          };

          const result = await executeStageWithRetry(stage, stageContext, config);
          const stageDuration = Date.now() - stageStartTime;

          const updatedStageExecution: Partial<StageExecution> = {
            status: result.success ? 'completed' : 'failed',
            output: result.output,
            error: result.error,
            completedAt: new Date(),
            durationMs: stageDuration,
            metrics: result.metrics,
          };

          stateMachine.updateStageExecution(stage.id, updatedStageExecution);
          await this.executionPersistence.updateStageExecution(executionId, stage.id, updatedStageExecution);

          if (result.success) {
            if (result.contextUpdate) {
              pipelineContext = { ...pipelineContext, ...result.contextUpdate };
              stateMachine.updateContext(result.contextUpdate);
            }

            this.emitEvent(options?.onEvent, {
              type: 'stage:completed',
              executionId,
              pipelineType,
              timestamp: new Date(),
              data: {
                stageId: stage.id,
                stageName: stage.name,
                durationMs: stageDuration,
                metrics: result.metrics,
              },
            });

            if (config.enableCheckpoints) {
              await this.checkpointManager.saveCheckpoint(
                executionId,
                stage.id,
                i,
                stateMachine.getState(),
                result.output
              );
              this.emitEvent(options?.onEvent, {
                type: 'checkpoint:saved',
                executionId,
                pipelineType,
                timestamp: new Date(),
                data: { stageId: stage.id, stageIndex: i },
              });
            }

            if (result.skipRemaining) {
              break;
            }
          } else {
            this.emitEvent(options?.onEvent, {
              type: 'stage:failed',
              executionId,
              pipelineType,
              timestamp: new Date(),
              data: {
                stageId: stage.id,
                stageName: stage.name,
                error: result.error ?? 'Unknown error',
                retryCount: 0,
                willRetry: false,
              },
            });

            stateMachine.fail(result.error ?? 'Unknown error');
            await this.executionPersistence.updateExecution(executionId, {
              status: 'failed',
              error: result.error,
              completedAt: new Date(),
              durationMs: Date.now() - stateMachine.getState().startedAt.getTime(),
            });

            this.emitEvent(options?.onEvent, {
              type: 'pipeline:failed',
              executionId,
              pipelineType,
              timestamp: new Date(),
              data: {
                error: result.error ?? 'Unknown error',
                failedStageId: stage.id,
                failedStageIndex: i,
                recoverable: config.enableCheckpoints,
              },
            });

            return {
              executionId,
              status: 'failed',
              error: result.error,
              state: stateMachine.getState(),
            };
          }
        }

        const finalState = stateMachine.getState();
        if (finalState.status === 'running') {
          stateMachine.complete();
          await this.executionPersistence.updateExecution(executionId, {
            status: 'completed',
            completedAt: new Date(),
            durationMs: Date.now() - finalState.startedAt.getTime(),
          });

          this.emitEvent(options?.onEvent, {
            type: 'pipeline:completed',
            executionId,
            pipelineType,
            timestamp: new Date(),
            data: {
              durationMs: Date.now() - finalState.startedAt.getTime(),
              stagesCompleted: pipeline.stages.length,
              output: pipelineContext,
            },
          });
        }

        return {
          executionId,
          status: stateMachine.getStatus(),
          output: pipelineContext,
          state: stateMachine.getState(),
        };
      } finally {
        this.activeExecutions.delete(executionId);
      }
    } finally {
      if (lock) {
        await this.lockManager.releaseLock(lockResourceId);
      }
    }
  }

  async *executeWithStream(
    pipelineType: PipelineType,
    input: PipelineInput,
    options?: OrchestratorOptions
  ): AsyncGenerator<PipelineEvent, PipelineOutput, undefined> {
    const events: PipelineEvent[] = [];
    let resolveNext: ((value: PipelineEvent) => void) | null = null;

    const onEvent = (event: PipelineEvent) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        events.push(event);
      }
    };

    const executePromise = this.execute(pipelineType, input, {
      ...options,
      onEvent: (event) => {
        onEvent(event);
        options?.onEvent?.(event);
      },
    });

    const getNextEvent = (): Promise<PipelineEvent | null> => {
      if (events.length > 0) {
        return Promise.resolve(events.shift()!);
      }
      return new Promise((resolve) => {
        resolveNext = resolve;
        executePromise.then(() => {
          if (resolveNext) {
            resolveNext = null;
            resolve(null);
          }
        });
      });
    };

    let event: PipelineEvent | null;
    while ((event = await getNextEvent()) !== null) {
      yield event;
    }

    return await executePromise;
  }

  async pause(executionId: string): Promise<void> {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
    }
    await this.executionPersistence.updateExecution(executionId, { status: 'paused' });
  }

  async resume(executionId: string): Promise<PipelineOutput> {
    const state = await this.recoveryManager.prepareRecovery(executionId);
    if (!state) {
      throw new Error('Cannot recover: no checkpoint found');
    }

    const pipeline = getPipeline(state.pipelineType);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${state.pipelineType}`);
    }

    return this.execute(state.pipelineType, {
      novelId: state.novelId,
      userId: state.userId,
      chapterId: state.chapterId,
      config: state.config,
      input: state.context,
    });
  }

  async cancel(executionId: string): Promise<void> {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
    }
    await this.executionPersistence.updateExecution(executionId, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  async getState(executionId: string): Promise<import('./types').PipelineState | null> {
    return this.executionPersistence.getExecution(executionId);
  }

  async listExecutions(
    novelId: string, 
    options?: { limit?: number; cursor?: string }
  ): Promise<{ executions: import('./types').PipelineState[]; nextCursor: string | null }> {
    return this.executionPersistence.listExecutions(novelId, options);
  }

  async recover(checkpointId: string): Promise<PipelineOutput> {
    return this.resume(checkpointId);
  }

  private emitEvent(onEvent: ((event: PipelineEvent) => void) | undefined, event: PipelineEvent): void {
    if (onEvent) {
      try {
        onEvent(event);
      } catch {
        // Ignore event handler errors
      }
    }
  }
}

export const orchestrator = new Orchestrator();
