import type {
  PipelineState,
  PipelineType,
  ExecutionStatus,
  StageExecution,
  Checkpoint,
  PipelineConfig,
  StageResult,
  PipelineEvent,
} from './types';
import { CheckpointManager, ExecutionPersistence } from './recovery';
import { Orchestrator } from './engine';
import { getObservabilityDashboard } from './observability';

export interface RecoveryStrategy {
  shouldRecover(state: PipelineState, error: Error): boolean;
  getRecoveryAction(state: PipelineState, error: Error): RecoveryAction;
}

export type RecoveryAction =
  | { type: 'retry'; stageId: string; modifiedInput?: unknown }
  | { type: 'skip'; stageId: string }
  | { type: 'rollback'; toStageIndex: number }
  | { type: 'abort'; reason: string }
  | { type: 'heal'; healingSteps: HealingStep[] };

export interface HealingStep {
  action: 'clear-cache' | 'refresh-context' | 'reduce-load' | 'wait';
  params?: Record<string, unknown>;
}

export interface SelfHealingConfig {
  enabled: boolean;
  maxHealingAttempts: number;
  healingCooldownMs: number;
  strategies: RecoveryStrategy[];
}

const DEFAULT_HEALING_CONFIG: SelfHealingConfig = {
  enabled: true,
  maxHealingAttempts: 3,
  healingCooldownMs: 5000,
  strategies: [],
};

const RETRYABLE_ERROR_PATTERNS = [
  /rate.?limit/i,
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /503/i,
  /502/i,
  /overloaded/i,
  /capacity/i,
];

const TRANSIENT_ERROR_PATTERNS = [
  /network/i,
  /connection/i,
  /socket/i,
  /EPIPE/i,
];

export class ErrorClassifier {
  static isRetryable(error: Error): boolean {
    const message = error.message || '';
    return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(message));
  }

  static isTransient(error: Error): boolean {
    const message = error.message || '';
    return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(message));
  }

  static isRateLimitError(error: Error): boolean {
    return /rate.?limit/i.test(error.message || '');
  }

  static isTimeoutError(error: Error): boolean {
    return /timeout/i.test(error.message || '') || error.name === 'AbortError';
  }

  static isContentFilterError(error: Error): boolean {
    return /content.?filter|safety|blocked|moderation/i.test(error.message || '');
  }

  static getErrorCategory(error: Error): 'retryable' | 'transient' | 'permanent' | 'content' {
    if (this.isContentFilterError(error)) return 'content';
    if (this.isRetryable(error)) return 'retryable';
    if (this.isTransient(error)) return 'transient';
    return 'permanent';
  }
}

export class DefaultRecoveryStrategy implements RecoveryStrategy {
  private maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  shouldRecover(state: PipelineState, error: Error): boolean {
    const currentStage = state.history.find(h => h.stageId === state.currentStageId);
    if (!currentStage) return false;

    if (currentStage.retryCount >= this.maxRetries) return false;

    const category = ErrorClassifier.getErrorCategory(error);
    return category === 'retryable' || category === 'transient';
  }

  getRecoveryAction(state: PipelineState, error: Error): RecoveryAction {
    const category = ErrorClassifier.getErrorCategory(error);

    switch (category) {
      case 'retryable':
        return { type: 'retry', stageId: state.currentStageId };
      
      case 'transient':
        return {
          type: 'heal',
          healingSteps: [
            { action: 'wait', params: { durationMs: 2000 } },
            { action: 'refresh-context' },
          ],
        };
      
      case 'content':
        return {
          type: 'retry',
          stageId: state.currentStageId,
          modifiedInput: { reduceContentSensitivity: true },
        };
      
      case 'permanent':
      default:
        return { type: 'abort', reason: error.message };
    }
  }
}

export class RateLimitRecoveryStrategy implements RecoveryStrategy {
  shouldRecover(state: PipelineState, error: Error): boolean {
    return ErrorClassifier.isRateLimitError(error);
  }

  getRecoveryAction(_state: PipelineState, error: Error): RecoveryAction {
    const waitMatch = error.message.match(/retry.?after[:\s]*(\d+)/i);
    const waitMs = waitMatch ? parseInt(waitMatch[1], 10) * 1000 : 60000;

    return {
      type: 'heal',
      healingSteps: [
        { action: 'wait', params: { durationMs: Math.min(waitMs, 120000) } },
        { action: 'reduce-load' },
      ],
    };
  }
}

export class ContextOverflowRecoveryStrategy implements RecoveryStrategy {
  shouldRecover(_state: PipelineState, error: Error): boolean {
    return /context.?length|token.?limit|too.?long/i.test(error.message || '');
  }

  getRecoveryAction(state: PipelineState, _error: Error): RecoveryAction {
    return {
      type: 'retry',
      stageId: state.currentStageId,
      modifiedInput: { truncateContext: true, maxContextTokens: 4000 },
    };
  }
}

export class SelfHealingManager {
  private config: SelfHealingConfig;
  private healingAttempts: Map<string, number> = new Map();
  private lastHealingTime: Map<string, number> = new Map();
  private checkpointManager: CheckpointManager;
  private persistence: ExecutionPersistence;

  constructor(config: Partial<SelfHealingConfig> = {}) {
    this.config = { ...DEFAULT_HEALING_CONFIG, ...config };
    this.checkpointManager = new CheckpointManager();
    this.persistence = new ExecutionPersistence();

    if (this.config.strategies.length === 0) {
      this.config.strategies = [
        new RateLimitRecoveryStrategy(),
        new ContextOverflowRecoveryStrategy(),
        new DefaultRecoveryStrategy(),
      ];
    }
  }

  async attemptRecovery(
    executionId: string,
    error: Error
  ): Promise<{ recovered: boolean; action?: RecoveryAction }> {
    const state = await this.persistence.getExecution(executionId);
    if (!state) {
      return { recovered: false };
    }

    const attempts = this.healingAttempts.get(executionId) ?? 0;
    if (attempts >= this.config.maxHealingAttempts) {
      return { recovered: false };
    }

    const lastHealing = this.lastHealingTime.get(executionId) ?? 0;
    const cooldownRemaining = this.config.healingCooldownMs - (Date.now() - lastHealing);
    if (cooldownRemaining > 0) {
      await this.wait(cooldownRemaining);
    }

    for (const strategy of this.config.strategies) {
      if (strategy.shouldRecover(state, error)) {
        const action = strategy.getRecoveryAction(state, error);
        
        this.healingAttempts.set(executionId, attempts + 1);
        this.lastHealingTime.set(executionId, Date.now());

        const success = await this.executeRecoveryAction(executionId, state, action);
        return { recovered: success, action };
      }
    }

    return { recovered: false };
  }

  private async executeRecoveryAction(
    executionId: string,
    state: PipelineState,
    action: RecoveryAction
  ): Promise<boolean> {
    switch (action.type) {
      case 'retry':
        return true;

      case 'skip':
        return true;

      case 'rollback':
        return await this.rollbackToStage(executionId, action.toStageIndex);

      case 'heal':
        for (const step of action.healingSteps) {
          await this.executeHealingStep(step);
        }
        return true;

      case 'abort':
        return false;

      default:
        return false;
    }
  }

  private async executeHealingStep(step: HealingStep): Promise<void> {
    switch (step.action) {
      case 'wait':
        const duration = (step.params?.durationMs as number) ?? 5000;
        await this.wait(duration);
        break;

      case 'clear-cache':
        break;

      case 'refresh-context':
        break;

      case 'reduce-load':
        await this.wait(1000);
        break;
    }
  }

  private async rollbackToStage(executionId: string, stageIndex: number): Promise<boolean> {
    const checkpoint = await this.checkpointManager.getCheckpoint(executionId);
    if (!checkpoint || checkpoint.stageIndex > stageIndex) {
      return false;
    }
    return true;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  resetAttempts(executionId: string): void {
    this.healingAttempts.delete(executionId);
    this.lastHealingTime.delete(executionId);
  }
}

export class PipelineHealthMonitor {
  private failureHistory: Map<string, { count: number; lastFailure: Date }> = new Map();
  private readonly failureThreshold = 3;
  private readonly failureWindowMs = 5 * 60 * 1000;

  recordSuccess(pipelineType: PipelineType): void {
    this.failureHistory.delete(pipelineType);
  }

  recordFailure(pipelineType: PipelineType): void {
    const existing = this.failureHistory.get(pipelineType);
    const now = new Date();

    if (existing) {
      const windowStart = new Date(now.getTime() - this.failureWindowMs);
      if (existing.lastFailure > windowStart) {
        existing.count++;
        existing.lastFailure = now;
      } else {
        existing.count = 1;
        existing.lastFailure = now;
      }
    } else {
      this.failureHistory.set(pipelineType, { count: 1, lastFailure: now });
    }
  }

  isHealthy(pipelineType: PipelineType): boolean {
    const record = this.failureHistory.get(pipelineType);
    if (!record) return true;

    const windowStart = new Date(Date.now() - this.failureWindowMs);
    if (record.lastFailure < windowStart) {
      this.failureHistory.delete(pipelineType);
      return true;
    }

    return record.count < this.failureThreshold;
  }

  getHealthStatus(): Map<PipelineType, { healthy: boolean; failureCount: number }> {
    const status = new Map<PipelineType, { healthy: boolean; failureCount: number }>();
    
    for (const [pipelineType, record] of this.failureHistory) {
      status.set(pipelineType as PipelineType, {
        healthy: this.isHealthy(pipelineType as PipelineType),
        failureCount: record.count,
      });
    }

    return status;
  }
}

export class AutoRecoveryOrchestrator {
  private orchestrator: Orchestrator;
  private healingManager: SelfHealingManager;
  private healthMonitor: PipelineHealthMonitor;
  private dashboard = getObservabilityDashboard();

  constructor() {
    this.orchestrator = new Orchestrator();
    this.healingManager = new SelfHealingManager();
    this.healthMonitor = new PipelineHealthMonitor();
  }

  async executeWithAutoRecovery(
    pipelineType: PipelineType,
    input: {
      novelId: string;
      userId: string;
      chapterId?: string;
      executionId?: string;
      config?: Partial<PipelineConfig>;
      input?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; output?: unknown; error?: string; recovered: boolean; executionId?: string }> {
    if (!this.healthMonitor.isHealthy(pipelineType)) {
      return {
        success: false,
        error: `Pipeline ${pipelineType} is currently unhealthy. Too many recent failures.`,
        recovered: false,
        executionId: input.executionId,
      };
    }

    const onEvent = (event: PipelineEvent) => {
      this.dashboard.recordEvent(event);
    };

    try {
      const result = await this.orchestrator.execute(pipelineType, input, { onEvent });

      if (result.status === 'completed') {
        this.healthMonitor.recordSuccess(pipelineType);
        this.healingManager.resetAttempts(result.executionId);
        return { success: true, output: result.output, recovered: false, executionId: result.executionId };
      }

      if (result.status === 'failed' && result.error) {
        const error = new Error(result.error);
        const recovery = await this.healingManager.attemptRecovery(
          result.executionId,
          error
        );

        if (recovery.recovered) {
          const retryResult = await this.orchestrator.resume(result.executionId);
          
          if (retryResult.status === 'completed') {
            this.healthMonitor.recordSuccess(pipelineType);
            return { success: true, output: retryResult.output, recovered: true, executionId: result.executionId };
          }
        }

        this.healthMonitor.recordFailure(pipelineType);
        return { success: false, error: result.error, recovered: false, executionId: result.executionId };
      }

      return { success: false, error: 'Unknown execution status', recovered: false, executionId: result.executionId };
    } catch (error) {
      this.healthMonitor.recordFailure(pipelineType);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        recovered: false,
      };
    }
  }

  getHealthStatus(): Map<PipelineType, { healthy: boolean; failureCount: number }> {
    return this.healthMonitor.getHealthStatus();
  }
}
