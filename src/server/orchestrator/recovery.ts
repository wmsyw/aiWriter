import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import type {
  PipelineState,
  Checkpoint,
  StageExecution,
  ExecutionStatus,
  PipelineType,
} from './types';
import { PipelineStateMachine } from './state-machine';

export class CheckpointManager {
  async saveCheckpoint(
    executionId: string,
    stageId: string,
    stageIndex: number,
    state: PipelineState,
    partialOutput?: unknown,
    recoveryHint?: string
  ): Promise<void> {
    const stateMachine = new PipelineStateMachine(state);
    const stateJson = stateMachine.toJSON();

    await prisma.pipelineCheckpoint.upsert({
      where: {
        executionId_stageId: { executionId, stageId },
      },
      update: {
        stageIndex,
        state: stateJson as Prisma.InputJsonValue,
        partialOutput: partialOutput as Prisma.InputJsonValue ?? Prisma.JsonNull,
        recoveryHint,
        createdAt: new Date(),
      },
      create: {
        executionId,
        stageId,
        stageIndex,
        state: stateJson as Prisma.InputJsonValue,
        partialOutput: partialOutput as Prisma.InputJsonValue ?? Prisma.JsonNull,
        recoveryHint,
      },
    });
  }

  async getCheckpoint(executionId: string): Promise<Checkpoint | null> {
    const checkpoint = await prisma.pipelineCheckpoint.findFirst({
      where: { executionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!checkpoint) return null;

    return {
      executionId: checkpoint.executionId,
      stageId: checkpoint.stageId,
      stageIndex: checkpoint.stageIndex,
      timestamp: checkpoint.createdAt,
      state: this.parseState(checkpoint.state),
      partialOutput: checkpoint.partialOutput ?? undefined,
      recoveryHint: checkpoint.recoveryHint ?? undefined,
    };
  }

  async getCheckpointAtStage(
    executionId: string,
    stageId: string
  ): Promise<Checkpoint | null> {
    const checkpoint = await prisma.pipelineCheckpoint.findUnique({
      where: {
        executionId_stageId: { executionId, stageId },
      },
    });

    if (!checkpoint) return null;

    return {
      executionId: checkpoint.executionId,
      stageId: checkpoint.stageId,
      stageIndex: checkpoint.stageIndex,
      timestamp: checkpoint.createdAt,
      state: this.parseState(checkpoint.state),
      partialOutput: checkpoint.partialOutput ?? undefined,
      recoveryHint: checkpoint.recoveryHint ?? undefined,
    };
  }

  async deleteCheckpoints(executionId: string): Promise<void> {
    await prisma.pipelineCheckpoint.deleteMany({
      where: { executionId },
    });
  }

  async listCheckpoints(executionId: string): Promise<Checkpoint[]> {
    const checkpoints = await prisma.pipelineCheckpoint.findMany({
      where: { executionId },
      orderBy: { stageIndex: 'asc' },
    });

    return checkpoints.map((cp) => ({
      executionId: cp.executionId,
      stageId: cp.stageId,
      stageIndex: cp.stageIndex,
      timestamp: cp.createdAt,
      state: this.parseState(cp.state),
      partialOutput: cp.partialOutput ?? undefined,
      recoveryHint: cp.recoveryHint ?? undefined,
    }));
  }

  private parseState(stateJson: Prisma.JsonValue): Omit<PipelineState, 'checkpoint'> {
    const json = stateJson as Record<string, unknown>;
    return {
      executionId: json.executionId as string,
      pipelineType: json.pipelineType as PipelineType,
      novelId: json.novelId as string,
      userId: json.userId as string,
      chapterId: (json.chapterId as string) || undefined,
      currentStageId: json.currentStageId as string,
      stageIndex: json.stageIndex as number,
      status: json.status as ExecutionStatus,
      context: json.context as Record<string, unknown>,
      history: json.history as StageExecution[],
      config: json.config as PipelineState['config'],
      startedAt: new Date(json.startedAt as string),
      completedAt: json.completedAt ? new Date(json.completedAt as string) : undefined,
      durationMs: (json.durationMs as number) || undefined,
      error: (json.error as string) || undefined,
    };
  }
}

export class RecoveryManager {
  private checkpointManager: CheckpointManager;

  constructor(checkpointManager?: CheckpointManager) {
    this.checkpointManager = checkpointManager ?? new CheckpointManager();
  }

  async canRecover(executionId: string): Promise<boolean> {
    const execution = await prisma.pipelineExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) return false;
    if (execution.status !== 'failed' && execution.status !== 'paused') {
      return false;
    }

    const checkpoint = await this.checkpointManager.getCheckpoint(executionId);
    return checkpoint !== null;
  }

  async getRecoveryInfo(executionId: string): Promise<{
    canRecover: boolean;
    checkpoint?: Checkpoint;
    failedStage?: string;
    error?: string;
  }> {
    const execution = await prisma.pipelineExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      return { canRecover: false };
    }

    const checkpoint = await this.checkpointManager.getCheckpoint(executionId);

    return {
      canRecover: checkpoint !== null && 
        (execution.status === 'failed' || execution.status === 'paused'),
      checkpoint: checkpoint ?? undefined,
      failedStage: execution.currentStageId,
      error: execution.error ?? undefined,
    };
  }

  async prepareRecovery(executionId: string): Promise<PipelineState | null> {
    const checkpoint = await this.checkpointManager.getCheckpoint(executionId);
    if (!checkpoint) return null;

    return {
      ...checkpoint.state,
      checkpoint,
      status: 'pending',
      error: undefined,
      completedAt: undefined,
      durationMs: undefined,
    };
  }

  async listRecoverableExecutions(
    novelId: string
  ): Promise<Array<{ executionId: string; pipelineType: string; error?: string; stageId: string }>> {
    const executions = await prisma.pipelineExecution.findMany({
      where: {
        novelId,
        status: { in: ['failed', 'paused'] },
      },
      include: {
        checkpoints: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return executions
      .filter((e) => e.checkpoints.length > 0)
      .map((e) => ({
        executionId: e.id,
        pipelineType: e.pipelineType,
        error: e.error ?? undefined,
        stageId: e.currentStageId,
      }));
  }
}

export class ExecutionPersistence {
  async createExecution(params: {
    novelId: string;
    userId: string;
    chapterId?: string;
    pipelineType: PipelineType;
    initialStageId: string;
    config?: Prisma.InputJsonValue;
  }): Promise<string> {
    const execution = await prisma.pipelineExecution.create({
      data: {
        novelId: params.novelId,
        userId: params.userId,
        chapterId: params.chapterId,
        pipelineType: params.pipelineType,
        currentStageId: params.initialStageId,
        stageIndex: 0,
        status: 'pending',
        config: params.config ?? Prisma.JsonNull,
      },
    });

    return execution.id;
  }

  async updateExecution(
    executionId: string,
    updates: {
      status?: ExecutionStatus;
      currentStageId?: string;
      stageIndex?: number;
      context?: Prisma.InputJsonValue;
      error?: string;
      completedAt?: Date;
      durationMs?: number;
    }
  ): Promise<void> {
    await prisma.pipelineExecution.update({
      where: { id: executionId },
      data: updates,
    });
  }

  async getExecution(executionId: string): Promise<PipelineState | null> {
    const execution = await prisma.pipelineExecution.findUnique({
      where: { id: executionId },
      include: {
        stageExecutions: {
          orderBy: { startedAt: 'asc' },
        },
        checkpoints: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!execution) return null;

    const history: StageExecution[] = execution.stageExecutions.map((se) => ({
      stageId: se.stageId,
      stageName: se.stageName,
      status: se.status as StageExecution['status'],
      input: se.input ?? undefined,
      output: se.output ?? undefined,
      error: se.error ?? undefined,
      retryCount: se.retryCount,
      startedAt: se.startedAt,
      completedAt: se.completedAt ?? undefined,
      durationMs: se.durationMs ?? undefined,
      metrics: se.metrics as unknown as StageExecution['metrics'],
    }));

    return {
      executionId: execution.id,
      pipelineType: execution.pipelineType as PipelineType,
      novelId: execution.novelId,
      userId: execution.userId,
      chapterId: execution.chapterId ?? undefined,
      currentStageId: execution.currentStageId,
      stageIndex: execution.stageIndex,
      status: execution.status as ExecutionStatus,
      context: (execution.context as Record<string, unknown>) ?? {},
      history,
      config: execution.config as unknown as PipelineState['config'],
      startedAt: execution.startedAt,
      completedAt: execution.completedAt ?? undefined,
      durationMs: execution.durationMs ?? undefined,
      error: execution.error ?? undefined,
    };
  }

  async recordStageExecution(
    executionId: string,
    stage: StageExecution
  ): Promise<void> {
    await prisma.pipelineStageExecution.create({
      data: {
        executionId,
        stageId: stage.stageId,
        stageName: stage.stageName,
        status: stage.status,
        input: stage.input as Prisma.InputJsonValue ?? Prisma.JsonNull,
        output: stage.output as Prisma.InputJsonValue ?? Prisma.JsonNull,
        error: stage.error,
        retryCount: stage.retryCount,
        metrics: (stage.metrics as unknown) as Prisma.InputJsonValue ?? Prisma.JsonNull,
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
        durationMs: stage.durationMs,
      },
    });
  }

  async updateStageExecution(
    executionId: string,
    stageId: string,
    updates: Partial<StageExecution>
  ): Promise<void> {
    await prisma.pipelineStageExecution.updateMany({
      where: { executionId, stageId },
      data: {
        status: updates.status,
        output: updates.output as Prisma.InputJsonValue,
        error: updates.error,
        retryCount: updates.retryCount,
        metrics: (updates.metrics as unknown) as Prisma.InputJsonValue,
        completedAt: updates.completedAt,
        durationMs: updates.durationMs,
      },
    });
  }

  async listExecutions(
    novelId: string,
    options?: {
      status?: ExecutionStatus[];
      pipelineType?: PipelineType;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ executions: PipelineState[]; nextCursor: string | null }> {
    const limit = options?.limit ?? 50;
    
    const executions = await prisma.pipelineExecution.findMany({
      where: {
        novelId,
        ...(options?.status && { status: { in: options.status } }),
        ...(options?.pipelineType && { pipelineType: options.pipelineType }),
        ...(options?.cursor && { id: { lt: options.cursor } }),
      },
      include: {
        stageExecutions: {
          orderBy: { startedAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = executions.length > limit;
    const resultExecutions = hasMore ? executions.slice(0, limit) : executions;
    const nextCursor = hasMore ? resultExecutions[resultExecutions.length - 1].id : null;

    return {
      executions: resultExecutions.map((execution) => ({
        executionId: execution.id,
        pipelineType: execution.pipelineType as PipelineType,
        novelId: execution.novelId,
        userId: execution.userId,
        chapterId: execution.chapterId ?? undefined,
        currentStageId: execution.currentStageId,
        stageIndex: execution.stageIndex,
        status: execution.status as ExecutionStatus,
        context: (execution.context as Record<string, unknown>) ?? {},
        history: execution.stageExecutions.map((se) => ({
          stageId: se.stageId,
          stageName: se.stageName,
          status: se.status as StageExecution['status'],
          input: se.input ?? undefined,
          output: se.output ?? undefined,
          error: se.error ?? undefined,
          retryCount: se.retryCount,
          startedAt: se.startedAt,
          completedAt: se.completedAt ?? undefined,
          durationMs: se.durationMs ?? undefined,
        metrics: (se.metrics as unknown) as StageExecution['metrics'],
        })),
        config: execution.config as unknown as PipelineState['config'],
        startedAt: execution.startedAt,
        completedAt: execution.completedAt ?? undefined,
        durationMs: execution.durationMs ?? undefined,
        error: execution.error ?? undefined,
      })),
      nextCursor,
    };
  }

  async deleteExecution(executionId: string): Promise<void> {
    await prisma.pipelineExecution.delete({
      where: { id: executionId },
    });
  }
}

export const checkpointManager = new CheckpointManager();
export const recoveryManager = new RecoveryManager(checkpointManager);
export const executionPersistence = new ExecutionPersistence();
