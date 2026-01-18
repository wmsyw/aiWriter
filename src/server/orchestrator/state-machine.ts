import type { Prisma } from '@prisma/client';
import type {
  PipelineType,
  ExecutionStatus,
  StageStatus,
  PipelineState,
  PipelineConfig,
  Checkpoint,
  StageExecution,
  DEFAULT_PIPELINE_CONFIG,
} from './types';

export type StateTransition = {
  from: ExecutionStatus;
  to: ExecutionStatus;
  event: StateEvent;
};

export type StateEvent =
  | 'START'
  | 'STAGE_COMPLETE'
  | 'STAGE_FAIL'
  | 'PAUSE'
  | 'RESUME'
  | 'CANCEL'
  | 'COMPLETE'
  | 'RECOVER';

const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'pending', to: 'running', event: 'START' },
  { from: 'running', to: 'running', event: 'STAGE_COMPLETE' },
  { from: 'running', to: 'failed', event: 'STAGE_FAIL' },
  { from: 'running', to: 'paused', event: 'PAUSE' },
  { from: 'running', to: 'completed', event: 'COMPLETE' },
  { from: 'running', to: 'cancelled', event: 'CANCEL' },
  { from: 'paused', to: 'running', event: 'RESUME' },
  { from: 'paused', to: 'cancelled', event: 'CANCEL' },
  { from: 'failed', to: 'running', event: 'RECOVER' },
];

export function isValidTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
  event: StateEvent
): boolean {
  return VALID_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.event === event
  );
}

export function getValidEvents(status: ExecutionStatus): StateEvent[] {
  return VALID_TRANSITIONS
    .filter((t) => t.from === status)
    .map((t) => t.event);
}

export function getNextStatus(
  current: ExecutionStatus,
  event: StateEvent
): ExecutionStatus | null {
  const transition = VALID_TRANSITIONS.find(
    (t) => t.from === current && t.event === event
  );
  return transition?.to ?? null;
}

export class PipelineStateMachine {
  private state: PipelineState;
  private listeners: Set<(state: PipelineState) => void> = new Set();

  constructor(initialState: PipelineState) {
    this.state = { ...initialState };
  }

  static create(params: {
    executionId: string;
    pipelineType: PipelineType;
    novelId: string;
    userId: string;
    chapterId?: string;
    config?: Partial<PipelineConfig>;
    initialStageId: string;
  }): PipelineStateMachine {
    const defaultConfig: PipelineConfig = {
      maxRetries: 3,
      retryDelayMs: 1000,
      exponentialBackoff: true,
      timeoutMs: 10 * 60 * 1000,
      enableCheckpoints: true,
      enableParallel: false,
    };

    const state: PipelineState = {
      executionId: params.executionId,
      pipelineType: params.pipelineType,
      novelId: params.novelId,
      userId: params.userId,
      chapterId: params.chapterId,
      currentStageId: params.initialStageId,
      stageIndex: 0,
      status: 'pending',
      context: {},
      history: [],
      config: { ...defaultConfig, ...params.config },
      startedAt: new Date(),
    };

    return new PipelineStateMachine(state);
  }

  getState(): PipelineState {
    return { ...this.state };
  }

  getStatus(): ExecutionStatus {
    return this.state.status;
  }

  getCurrentStage(): { id: string; index: number } {
    return {
      id: this.state.currentStageId,
      index: this.state.stageIndex,
    };
  }

  transition(event: StateEvent): boolean {
    const nextStatus = getNextStatus(this.state.status, event);
    if (!nextStatus) {
      return false;
    }

    this.state = {
      ...this.state,
      status: nextStatus,
    };

    this.notifyListeners();
    return true;
  }

  start(): boolean {
    return this.transition('START');
  }

  pause(): boolean {
    return this.transition('PAUSE');
  }

  resume(): boolean {
    return this.transition('RESUME');
  }

  cancel(): boolean {
    if (this.transition('CANCEL')) {
      this.state = {
        ...this.state,
        completedAt: new Date(),
        durationMs: Date.now() - this.state.startedAt.getTime(),
      };
      this.notifyListeners();
      return true;
    }
    return false;
  }

  complete(): boolean {
    if (this.transition('COMPLETE')) {
      this.state = {
        ...this.state,
        completedAt: new Date(),
        durationMs: Date.now() - this.state.startedAt.getTime(),
      };
      this.notifyListeners();
      return true;
    }
    return false;
  }

  fail(error: string): boolean {
    if (this.transition('STAGE_FAIL')) {
      this.state = {
        ...this.state,
        error,
        completedAt: new Date(),
        durationMs: Date.now() - this.state.startedAt.getTime(),
      };
      this.notifyListeners();
      return true;
    }
    return false;
  }

  recover(): boolean {
    if (this.transition('RECOVER')) {
      this.state = {
        ...this.state,
        error: undefined,
        completedAt: undefined,
        durationMs: undefined,
      };
      this.notifyListeners();
      return true;
    }
    return false;
  }

  advanceToStage(stageId: string, stageIndex: number): void {
    this.state = {
      ...this.state,
      currentStageId: stageId,
      stageIndex,
    };
    this.notifyListeners();
  }

  recordStageExecution(execution: StageExecution): void {
    this.state = {
      ...this.state,
      history: [...this.state.history, execution],
    };
    this.notifyListeners();
  }

  updateStageExecution(
    stageId: string,
    updates: Partial<StageExecution>
  ): void {
    const history = this.state.history.map((exec) =>
      exec.stageId === stageId ? { ...exec, ...updates } : exec
    );
    this.state = { ...this.state, history };
    this.notifyListeners();
  }

  updateContext(updates: Record<string, unknown>): void {
    this.state = {
      ...this.state,
      context: { ...this.state.context, ...updates },
    };
    this.notifyListeners();
  }

  setCheckpoint(checkpoint: Checkpoint): void {
    this.state = { ...this.state, checkpoint };
    this.notifyListeners();
  }

  clearCheckpoint(): void {
    this.state = { ...this.state, checkpoint: undefined };
    this.notifyListeners();
  }

  subscribe(listener: (state: PipelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const stateCopy = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(stateCopy);
      } catch {
        // Ignore listener errors
      }
    }
  }

  toJSON(): Prisma.JsonValue {
    return {
      executionId: this.state.executionId,
      pipelineType: this.state.pipelineType,
      novelId: this.state.novelId,
      userId: this.state.userId,
      chapterId: this.state.chapterId ?? null,
      currentStageId: this.state.currentStageId,
      stageIndex: this.state.stageIndex,
      status: this.state.status,
      context: this.state.context as Prisma.JsonValue,
      history: this.state.history as unknown as Prisma.JsonValue,
      config: this.state.config as unknown as Prisma.JsonValue,
      checkpoint: (this.state.checkpoint as unknown as Prisma.JsonValue) ?? null,
      startedAt: this.state.startedAt.toISOString(),
      completedAt: this.state.completedAt?.toISOString() ?? null,
      durationMs: this.state.durationMs ?? null,
      error: this.state.error ?? null,
    };
  }

  static fromJSON(data: Prisma.JsonValue): PipelineStateMachine {
    const json = data as Record<string, unknown>;
    const state: PipelineState = {
      executionId: json.executionId as string,
      pipelineType: json.pipelineType as PipelineType,
      novelId: json.novelId as string,
      userId: json.userId as string,
      chapterId: json.chapterId as string | undefined,
      currentStageId: json.currentStageId as string,
      stageIndex: json.stageIndex as number,
      status: json.status as ExecutionStatus,
      context: json.context as Record<string, unknown>,
      history: json.history as StageExecution[],
      config: json.config as PipelineConfig,
      checkpoint: json.checkpoint as Checkpoint | undefined,
      startedAt: new Date(json.startedAt as string),
      completedAt: json.completedAt
        ? new Date(json.completedAt as string)
        : undefined,
      durationMs: json.durationMs as number | undefined,
      error: json.error as string | undefined,
    };
    return new PipelineStateMachine(state);
  }
}

export type StageStateEvent =
  | 'START'
  | 'PROGRESS'
  | 'COMPLETE'
  | 'FAIL'
  | 'SKIP'
  | 'RETRY';

const STAGE_TRANSITIONS: Array<{
  from: StageStatus;
  to: StageStatus;
  event: StageStateEvent;
}> = [
  { from: 'pending', to: 'running', event: 'START' },
  { from: 'running', to: 'completed', event: 'COMPLETE' },
  { from: 'running', to: 'failed', event: 'FAIL' },
  { from: 'pending', to: 'skipped', event: 'SKIP' },
  { from: 'failed', to: 'running', event: 'RETRY' },
];

export function isValidStageTransition(
  from: StageStatus,
  to: StageStatus,
  event: StageStateEvent
): boolean {
  return STAGE_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.event === event
  );
}

export function getNextStageStatus(
  current: StageStatus,
  event: StageStateEvent
): StageStatus | null {
  const transition = STAGE_TRANSITIONS.find(
    (t) => t.from === current && t.event === event
  );
  return transition?.to ?? null;
}
