/**
 * AI Novel Generation Pipeline Orchestrator - Core Types
 * 
 * This module defines the core types for the pipeline orchestration system.
 * The orchestrator manages the entire novel generation workflow through
 * a series of pipelines and stages.
 */

import type { Prisma } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════
// Pipeline Types
// ═══════════════════════════════════════════════════════════════

export type PipelineType = 
  | 'novel-setup'      // 小说初始化流水线
  | 'outline'          // 大纲生成流水线
  | 'chapter'          // 章节生成流水线
  | 'review'           // 章节审查流水线
  | 'finalize';        // 章节完成流水线

export type StageType = 
  | 'setup'      // 初始化阶段
  | 'outline'    // 大纲生成阶段
  | 'chapter'    // 章节生成阶段
  | 'review'     // 审查阶段
  | 'finalize';  // 完成阶段

export type ExecutionStatus = 
  | 'pending'    // 等待执行
  | 'running'    // 正在执行
  | 'paused'     // 已暂停
  | 'completed'  // 已完成
  | 'failed'     // 执行失败
  | 'cancelled'; // 已取消

export type StageStatus = 
  | 'pending'    // 等待执行
  | 'running'    // 正在执行
  | 'completed'  // 已完成
  | 'failed'     // 执行失败
  | 'skipped';   // 已跳过

// ═══════════════════════════════════════════════════════════════
// Pipeline Configuration
// ═══════════════════════════════════════════════════════════════

export interface PipelineConfig {
  /** Maximum retry attempts for failed stages */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Whether to use exponential backoff for retries */
  exponentialBackoff: boolean;
  /** Maximum total execution time in milliseconds */
  timeoutMs: number;
  /** Whether to save checkpoints after each stage */
  enableCheckpoints: boolean;
  /** Whether to run in parallel where possible */
  enableParallel: boolean;
  /** Custom configuration per stage */
  stageConfigs?: Record<string, StageConfig>;
}

export interface StageConfig {
  /** Override max retries for this stage */
  maxRetries?: number;
  /** Override timeout for this stage */
  timeoutMs?: number;
  /** Whether this stage can be skipped */
  skippable?: boolean;
  /** Dependencies on other stages */
  dependsOn?: string[];
  /** Custom parameters for the stage */
  params?: Record<string, unknown>;
}

export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  exponentialBackoff: boolean;
  retryableErrors?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Stage Definition
// ═══════════════════════════════════════════════════════════════

export interface StageContext<TInput = unknown, TOutput = unknown> {
  /** Pipeline execution ID */
  executionId: string;
  /** Novel ID */
  novelId: string;
  /** User ID */
  userId: string;
  /** Chapter ID (if applicable) */
  chapterId?: string;
  /** Input data for this stage */
  input: TInput;
  /** Accumulated context from previous stages */
  pipelineContext: Record<string, unknown>;
  /** Stage-specific configuration */
  config: StageConfig;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Logger instance */
  logger: StageLogger;
  /** Progress reporter */
  progress: ProgressReporter;
}

export interface StageResult<TOutput = unknown> {
  /** Whether the stage succeeded */
  success: boolean;
  /** Output data from the stage */
  output?: TOutput;
  /** Error message if failed */
  error?: string;
  /** Error details */
  errorDetails?: unknown;
  /** Whether to skip remaining stages */
  skipRemaining?: boolean;
  /** Data to add to pipeline context */
  contextUpdate?: Record<string, unknown>;
  /** Metrics for this stage */
  metrics?: StageMetrics;
}

export interface StageMetrics {
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Tokens used (if LLM call) */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Estimated cost */
  estimatedCost?: number;
  /** Custom metrics */
  custom?: Record<string, number>;
}

export interface StageLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

export interface ProgressReporter {
  /** Report progress (0-100) */
  report(percent: number, message?: string): void;
  /** Report a sub-step */
  step(current: number, total: number, message?: string): void;
  /** Report streaming token */
  token?(token: string): void;
}

// ═══════════════════════════════════════════════════════════════
// Stage Function Types
// ═══════════════════════════════════════════════════════════════

export type PreCheckFn<TInput = unknown> = (
  ctx: StageContext<TInput>
) => Promise<PreCheckResult>;

export interface PreCheckResult {
  canProceed: boolean;
  reason?: string;
  warnings?: string[];
  suggestedFixes?: string[];
}

export type ExecuteFn<TInput = unknown, TOutput = unknown> = (
  ctx: StageContext<TInput>
) => Promise<StageResult<TOutput>>;

export type PostProcessFn<TOutput = unknown> = (
  ctx: StageContext,
  result: StageResult<TOutput>
) => Promise<StageResult<TOutput>>;

export type ValidateFn<TOutput = unknown> = (
  ctx: StageContext,
  output: TOutput
) => Promise<ValidationResult>;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export type ErrorHandler = (
  ctx: StageContext,
  error: Error,
  retryCount: number
) => Promise<ErrorHandlerResult>;

export interface ErrorHandlerResult {
  /** Whether to retry the stage */
  retry: boolean;
  /** Modified input for retry */
  retryInput?: unknown;
  /** Delay before retry in milliseconds */
  retryDelayMs?: number;
  /** Whether to skip this stage and continue */
  skip?: boolean;
  /** Custom error to report */
  customError?: string;
}

// ═══════════════════════════════════════════════════════════════
// Stage and Pipeline Definitions
// ═══════════════════════════════════════════════════════════════

export interface Stage<TInput = unknown, TOutput = unknown> {
  /** Unique stage identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Stage type category */
  type: StageType;
  /** Description of what this stage does */
  description?: string;
  /** Pre-execution check */
  preCheck?: PreCheckFn<TInput>;
  /** Main execution function */
  execute: ExecuteFn<TInput, TOutput>;
  /** Post-execution processing */
  postProcess?: PostProcessFn<TOutput>;
  /** Output validation */
  validate?: ValidateFn<TOutput>;
  /** Error handler */
  onError?: ErrorHandler;
  /** Retry configuration */
  retryConfig?: RetryConfig;
  /** Whether this stage supports streaming output */
  supportsStreaming?: boolean;
  /** Estimated duration in seconds */
  estimatedDurationSec?: number;
}

export interface Pipeline {
  /** Unique pipeline identifier */
  id: PipelineType;
  /** Human-readable name */
  name: string;
  /** Pipeline description */
  description?: string;
  /** Ordered list of stages */
  stages: Stage[];
  /** Default configuration */
  defaultConfig: PipelineConfig;
  /** Input schema (for validation) */
  inputSchema?: Prisma.JsonValue;
  /** Output schema (for validation) */
  outputSchema?: Prisma.JsonValue;
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Execution State
// ═══════════════════════════════════════════════════════════════

export interface PipelineState {
  /** Execution ID */
  executionId: string;
  /** Pipeline type */
  pipelineType: PipelineType;
  /** Novel ID */
  novelId: string;
  /** User ID */
  userId: string;
  /** Chapter ID (if applicable) */
  chapterId?: string;
  /** Current stage ID */
  currentStageId: string;
  /** Current stage index */
  stageIndex: number;
  /** Overall execution status */
  status: ExecutionStatus;
  /** Accumulated context */
  context: Record<string, unknown>;
  /** Stage execution history */
  history: StageExecution[];
  /** Configuration used */
  config: PipelineConfig;
  /** Checkpoint for recovery */
  checkpoint?: Checkpoint;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt?: Date;
  /** Total duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}

export interface StageExecution {
  /** Stage ID */
  stageId: string;
  /** Stage name */
  stageName: string;
  /** Execution status */
  status: StageStatus;
  /** Input data */
  input?: unknown;
  /** Output data */
  output?: unknown;
  /** Error message */
  error?: string;
  /** Number of retries */
  retryCount: number;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt?: Date;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Metrics */
  metrics?: StageMetrics;
}

export interface Checkpoint {
  /** Execution ID */
  executionId: string;
  /** Stage ID where checkpoint was created */
  stageId: string;
  /** Stage index */
  stageIndex: number;
  /** Checkpoint timestamp */
  timestamp: Date;
  /** Full pipeline state at checkpoint */
  state: Omit<PipelineState, 'checkpoint'>;
  /** Partial output if stage was interrupted */
  partialOutput?: unknown;
  /** Recovery instructions */
  recoveryHint?: string;
}

// ═══════════════════════════════════════════════════════════════
// Events and Streaming
// ═══════════════════════════════════════════════════════════════

export type PipelineEventType = 
  | 'pipeline:started'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'pipeline:paused'
  | 'pipeline:resumed'
  | 'stage:started'
  | 'stage:progress'
  | 'stage:completed'
  | 'stage:failed'
  | 'stage:skipped'
  | 'stage:retrying'
  | 'checkpoint:saved'
  | 'token:generated';

export interface PipelineEvent {
  type: PipelineEventType;
  executionId: string;
  pipelineType: PipelineType;
  timestamp: Date;
  data: PipelineEventData;
}

export type PipelineEventData = 
  | PipelineStartedData
  | PipelineCompletedData
  | PipelineFailedData
  | StageStartedData
  | StageProgressData
  | StageCompletedData
  | StageFailedData
  | TokenGeneratedData
  | CheckpointSavedData;

export interface PipelineStartedData {
  novelId: string;
  chapterId?: string;
  config: PipelineConfig;
  totalStages: number;
}

export interface PipelineCompletedData {
  durationMs: number;
  stagesCompleted: number;
  output?: unknown;
}

export interface PipelineFailedData {
  error: string;
  failedStageId: string;
  failedStageIndex: number;
  recoverable: boolean;
}

export interface StageStartedData {
  stageId: string;
  stageName: string;
  stageIndex: number;
  totalStages: number;
}

export interface StageProgressData {
  stageId: string;
  percent: number;
  message?: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface StageCompletedData {
  stageId: string;
  stageName: string;
  durationMs: number;
  metrics?: StageMetrics;
}

export interface StageFailedData {
  stageId: string;
  stageName: string;
  error: string;
  retryCount: number;
  willRetry: boolean;
}

export interface TokenGeneratedData {
  stageId: string;
  token: string;
  totalTokens: number;
}

export interface CheckpointSavedData {
  stageId: string;
  stageIndex: number;
}

// ═══════════════════════════════════════════════════════════════
// Orchestrator Interface
// ═══════════════════════════════════════════════════════════════

export interface PipelineInput {
  novelId: string;
  userId: string;
  chapterId?: string;
  executionId?: string;
  config?: Partial<PipelineConfig>;
  input?: Record<string, unknown>;
  resumeFromCheckpoint?: string;
}

export interface PipelineOutput {
  executionId: string;
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  state: PipelineState;
}

export interface OrchestratorOptions {
  /** Event handler for pipeline events */
  onEvent?: (event: PipelineEvent) => void;
  /** Whether to enable streaming output */
  enableStreaming?: boolean;
  /** Whether to persist state to database */
  persistState?: boolean;
}

export interface IOrchestrator {
  /** Execute a pipeline */
  execute(
    pipelineType: PipelineType,
    input: PipelineInput,
    options?: OrchestratorOptions
  ): Promise<PipelineOutput>;

  /** Execute a pipeline with streaming events */
  executeWithStream(
    pipelineType: PipelineType,
    input: PipelineInput,
    options?: OrchestratorOptions
  ): AsyncGenerator<PipelineEvent, PipelineOutput, undefined>;

  /** Pause a running pipeline */
  pause(executionId: string): Promise<void>;

  /** Resume a paused pipeline */
  resume(executionId: string): Promise<PipelineOutput>;

  /** Cancel a running pipeline */
  cancel(executionId: string): Promise<void>;

  /** Get execution state */
  getState(executionId: string): Promise<PipelineState | null>;

  /** List active executions for a novel */
  listExecutions(
    novelId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ executions: PipelineState[]; nextCursor: string | null }>;

  /** Recover from a checkpoint */
  recover(checkpointId: string): Promise<PipelineOutput>;
}

// ═══════════════════════════════════════════════════════════════
// Default Configurations
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  exponentialBackoff: true,
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  enableCheckpoints: true,
  enableParallel: false,
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: 1000,
  exponentialBackoff: true,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'rate_limit_exceeded',
    'server_error',
    'overloaded',
  ],
};

// ═══════════════════════════════════════════════════════════════
// Typed Pipeline Context (for type-safe stage data passing)
// ═══════════════════════════════════════════════════════════════

export interface NovelSeedData {
  synopsis?: string;
  goldenFinger?: string;
  worldSetting?: string;
  worldTimePeriod?: string;
  worldLocation?: string;
  worldAtmosphere?: string;
  worldRules?: string;
}

export interface WorldBuildingData {
  worldSetting: string;
  worldTimePeriod?: string;
  worldLocation?: string;
  worldAtmosphere?: string;
  worldRules?: string;
}

export interface CharacterData {
  name: string;
  role: string;
  description: string;
  traits?: string;
  goals?: string;
}

export interface GoldenFingerData {
  goldenFinger: string;
  name?: string;
  coreAbility?: string;
  growthStages?: string[];
  limitations?: string[];
}

export interface ChapterSummaryData {
  oneLine: string;
  keyEvents: string[];
  characterDevelopments: string[];
  plotAdvancement: string;
  cliffhangers?: string[];
}

export interface TypedPipelineContext {
  seed?: NovelSeedData;
  world?: WorldBuildingData;
  characters?: CharacterData[];
  goldenFinger?: GoldenFingerData;
  
  roughOutline?: unknown;
  detailedOutline?: unknown;
  chapterOutlines?: unknown;
  
  assembledContext?: string;
  contextTokens?: number;
  generatedContent?: string;
  wordCount?: number;
  humanizedContent?: string;
  memorySnapshot?: unknown;
  
  qualityScore?: number;
  qualityDimensions?: Record<string, number>;
  consistencyResult?: {
    isConsistent: boolean;
    issues: string[];
  };
  adherenceScore?: number;
  overallScore?: number;
  scoreBreakdown?: Record<string, number>;
  
  chapterSummary?: ChapterSummaryData;
}

export function getTypedContext<K extends keyof TypedPipelineContext>(
  context: Record<string, unknown>,
  key: K
): TypedPipelineContext[K] | undefined {
  return context[key] as TypedPipelineContext[K] | undefined;
}
