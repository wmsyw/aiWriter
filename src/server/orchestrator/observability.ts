import type {
  PipelineType,
  ExecutionStatus,
  StageStatus,
  StageMetrics,
  PipelineEvent,
} from './types';
import { prisma } from '@/src/server/db';
import type { Prisma } from '@prisma/client';

export interface PipelineMetricsData {
  executionId: string;
  pipelineType: PipelineType;
  novelId: string;
  userId?: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs: number;
  stageMetrics: StageMetricsSummary[];
  tokenUsage: TokenUsageSummary;
  errorCount: number;
  retryCount: number;
}

export interface StageMetricsSummary {
  stageId: string;
  stageName: string;
  status: StageStatus;
  durationMs: number;
  retryCount: number;
  tokensUsed?: number;
  error?: string;
}

export interface TokenUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface AggregatedMetrics {
  pipelineType: PipelineType;
  timeWindow: { start: Date; end: Date };
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  totalTokensUsed: number;
  totalEstimatedCost: number;
  errorBreakdown: Map<string, number>;
  stagePerformance: Map<string, StagePerformanceStats>;
}

export interface StagePerformanceStats {
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  p95DurationMs: number;
  averageTokensUsed: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  timestamp: Date;
  checks: HealthCheck[];
  overallScore: number;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  value?: number;
  threshold?: number;
}

const TOKEN_COSTS: Record<string, { prompt: number; completion: number }> = {
  'gpt-4': { prompt: 0.03, completion: 0.06 },
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'gpt-4o': { prompt: 0.005, completion: 0.015 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'claude-3-opus': { prompt: 0.015, completion: 0.075 },
  'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
  'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
  'gemini-pro': { prompt: 0.00025, completion: 0.0005 },
  'gemini-1.5-pro': { prompt: 0.00125, completion: 0.005 },
  'gemini-1.5-flash': { prompt: 0.000075, completion: 0.0003 },
};

export class PersistentMetricsCollector {
  private pendingMetrics: Map<string, PipelineMetricsData> = new Map();
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs = 5000;

  constructor() {
    this.startAutoFlush();
  }

  private startAutoFlush(): void {
    if (typeof window === 'undefined' && !this.flushInterval) {
      this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
    }
  }

  async recordEvent(event: PipelineEvent): Promise<void> {
    await this.persistEvent(event);
    this.processEvent(event);
  }

  private async persistEvent(event: PipelineEvent): Promise<void> {
    try {
      await (prisma as any).pipelineEventLog?.create({
        data: {
          executionId: event.executionId,
          pipelineType: event.pipelineType,
          eventType: event.type,
          data: event.data as unknown as Prisma.InputJsonValue,
          timestamp: event.timestamp,
        },
      });
    } catch {
    }
  }

  private processEvent(event: PipelineEvent): void {
    const { executionId, pipelineType } = event;

    switch (event.type) {
      case 'pipeline:started': {
        const data = event.data as { novelId: string; config?: { userId?: string } };
        this.pendingMetrics.set(executionId, {
          executionId,
          pipelineType,
          novelId: data.novelId,
          status: 'running',
          startedAt: event.timestamp,
          totalDurationMs: 0,
          stageMetrics: [],
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
          errorCount: 0,
          retryCount: 0,
        });
        break;
      }

      case 'stage:completed': {
        const metrics = this.pendingMetrics.get(executionId);
        if (!metrics) break;

        const data = event.data as { stageId: string; stageName: string; durationMs: number; metrics?: StageMetrics };
        
        metrics.stageMetrics.push({
          stageId: data.stageId,
          stageName: data.stageName,
          status: 'completed',
          durationMs: data.durationMs,
          retryCount: 0,
          tokensUsed: data.metrics?.tokensUsed?.total,
        });

        if (data.metrics?.tokensUsed) {
          metrics.tokenUsage.promptTokens += data.metrics.tokensUsed.prompt;
          metrics.tokenUsage.completionTokens += data.metrics.tokensUsed.completion;
          metrics.tokenUsage.totalTokens += data.metrics.tokensUsed.total;
        }
        break;
      }

      case 'stage:failed': {
        const metrics = this.pendingMetrics.get(executionId);
        if (!metrics) break;

        const data = event.data as { stageId: string; stageName: string; error: string; retryCount: number };
        
        metrics.stageMetrics.push({
          stageId: data.stageId,
          stageName: data.stageName,
          status: 'failed',
          durationMs: 0,
          retryCount: data.retryCount,
          error: data.error,
        });

        metrics.errorCount++;
        metrics.retryCount += data.retryCount;
        break;
      }

      case 'pipeline:completed': {
        const metrics = this.pendingMetrics.get(executionId);
        if (!metrics) break;

        const data = event.data as { durationMs: number };
        metrics.status = 'completed';
        metrics.completedAt = event.timestamp;
        metrics.totalDurationMs = data.durationMs;
        metrics.tokenUsage.estimatedCost = this.estimateCost(metrics.tokenUsage);
        
        this.persistMetrics(metrics).then(() => {
          this.pendingMetrics.delete(executionId);
        });
        break;
      }

      case 'pipeline:failed': {
        const metrics = this.pendingMetrics.get(executionId);
        if (!metrics) break;

        metrics.status = 'failed';
        metrics.completedAt = event.timestamp;
        metrics.totalDurationMs = event.timestamp.getTime() - metrics.startedAt.getTime();
        
        this.persistMetrics(metrics).then(() => {
          this.pendingMetrics.delete(executionId);
        });
        break;
      }
    }
  }

  private estimateCost(usage: TokenUsageSummary, model = 'gpt-4o'): number {
    const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['gpt-4o'];
    return (
      (usage.promptTokens / 1000) * costs.prompt +
      (usage.completionTokens / 1000) * costs.completion
    );
  }

  private async persistMetrics(metrics: PipelineMetricsData): Promise<void> {
    try {
      await (prisma as any).pipelineMetrics?.upsert({
        where: { executionId: metrics.executionId },
        create: {
          executionId: metrics.executionId,
          pipelineType: metrics.pipelineType,
          novelId: metrics.novelId,
          userId: metrics.userId ?? '',
          status: metrics.status,
          startedAt: metrics.startedAt,
          completedAt: metrics.completedAt,
          totalDurationMs: metrics.totalDurationMs,
          promptTokens: metrics.tokenUsage.promptTokens,
          completionTokens: metrics.tokenUsage.completionTokens,
          totalTokens: metrics.tokenUsage.totalTokens,
          estimatedCost: metrics.tokenUsage.estimatedCost,
          errorCount: metrics.errorCount,
          retryCount: metrics.retryCount,
          stageMetrics: metrics.stageMetrics as unknown as Prisma.InputJsonValue,
        },
        update: {
          status: metrics.status,
          completedAt: metrics.completedAt,
          totalDurationMs: metrics.totalDurationMs,
          promptTokens: metrics.tokenUsage.promptTokens,
          completionTokens: metrics.tokenUsage.completionTokens,
          totalTokens: metrics.tokenUsage.totalTokens,
          estimatedCost: metrics.tokenUsage.estimatedCost,
          errorCount: metrics.errorCount,
          retryCount: metrics.retryCount,
          stageMetrics: metrics.stageMetrics as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
    }
  }

  async flush(): Promise<void> {
    for (const metrics of this.pendingMetrics.values()) {
      await this.persistMetrics(metrics);
    }
  }

  async getMetrics(executionId: string): Promise<PipelineMetricsData | null> {
    const pending = this.pendingMetrics.get(executionId);
    if (pending) return pending;

    try {
      const record = await (prisma as any).pipelineMetrics?.findUnique({
        where: { executionId },
      });
      if (!record) return null;

      return {
        executionId: record.executionId,
        pipelineType: record.pipelineType as PipelineType,
        novelId: record.novelId,
        userId: record.userId,
        status: record.status as ExecutionStatus,
        startedAt: record.startedAt,
        completedAt: record.completedAt ?? undefined,
        totalDurationMs: record.totalDurationMs ?? 0,
        stageMetrics: (record.stageMetrics as StageMetricsSummary[]) ?? [],
        tokenUsage: {
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          totalTokens: record.totalTokens,
          estimatedCost: record.estimatedCost,
        },
        errorCount: record.errorCount,
        retryCount: record.retryCount,
      };
    } catch {
      return null;
    }
  }

  async getRecentEvents(limit = 100): Promise<PipelineEvent[]> {
    try {
      const records = await (prisma as any).pipelineEventLog?.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return (records ?? []).map((r: any) => ({
        type: r.eventType,
        executionId: r.executionId,
        pipelineType: r.pipelineType,
        timestamp: r.timestamp,
        data: r.data,
      }));
    } catch {
      return [];
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export class PersistentMetricsAggregator {
  async aggregate(
    pipelineType: PipelineType,
    timeWindow: { start: Date; end: Date }
  ): Promise<AggregatedMetrics> {
    const records = await (prisma as any).pipelineMetrics?.findMany({
      where: {
        pipelineType,
        startedAt: { gte: timeWindow.start, lte: timeWindow.end },
      },
    }) ?? [];

    const successCount = records.filter((r: any) => r.status === 'completed').length;
    const failureCount = records.filter((r: any) => r.status === 'failed').length;
    const durations = records.map((r: any) => r.totalDurationMs ?? 0).sort((a: number, b: number) => a - b);
    
    const errorBreakdown = new Map<string, number>();
    const stagePerformance = new Map<string, StagePerformanceStats>();

    for (const record of records) {
      const stages = (record.stageMetrics as StageMetricsSummary[]) ?? [];
      for (const stage of stages) {
        if (stage.error) {
          const errorKey = this.categorizeError(stage.error);
          errorBreakdown.set(errorKey, (errorBreakdown.get(errorKey) ?? 0) + 1);
        }

        const stats = stagePerformance.get(stage.stageId) ?? {
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          averageDurationMs: 0,
          p95DurationMs: 0,
          averageTokensUsed: 0,
        };

        stats.executionCount++;
        if (stage.status === 'completed') {
          stats.successCount++;
        } else if (stage.status === 'failed') {
          stats.failureCount++;
        }

        stagePerformance.set(stage.stageId, stats);
      }
    }

    return {
      pipelineType,
      timeWindow,
      totalExecutions: records.length,
      successCount,
      failureCount,
      successRate: records.length > 0 ? successCount / records.length : 0,
      averageDurationMs: this.average(durations),
      p50DurationMs: this.percentile(durations, 50),
      p95DurationMs: this.percentile(durations, 95),
      p99DurationMs: this.percentile(durations, 99),
      totalTokensUsed: records.reduce((sum: number, r: any) => sum + (r.totalTokens ?? 0), 0),
      totalEstimatedCost: records.reduce((sum: number, r: any) => sum + (r.estimatedCost ?? 0), 0),
      errorBreakdown,
      stagePerformance,
    };
  }

  private categorizeError(error: string): string {
    if (/rate.?limit/i.test(error)) return 'rate_limit';
    if (/timeout/i.test(error)) return 'timeout';
    if (/network|connection/i.test(error)) return 'network';
    if (/content.?filter|safety/i.test(error)) return 'content_filter';
    if (/token.?limit|context.?length/i.test(error)) return 'context_overflow';
    return 'other';
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(index, arr.length - 1))];
  }
}

export class PersistentHealthChecker {
  private aggregator: PersistentMetricsAggregator;
  private collector: PersistentMetricsCollector;

  private readonly thresholds = {
    successRate: 0.9,
    p95DurationMs: 120000,
    errorRate: 0.1,
    recentFailures: 3,
  };

  constructor(collector: PersistentMetricsCollector) {
    this.collector = collector;
    this.aggregator = new PersistentMetricsAggregator();
  }

  async check(pipelineType: PipelineType): Promise<HealthCheckResult> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const metrics = await this.aggregator.aggregate(pipelineType, { start: oneHourAgo, end: now });
    const checks: HealthCheck[] = [];

    checks.push(this.checkSuccessRate(metrics));
    checks.push(this.checkLatency(metrics));
    checks.push(this.checkErrorRate(metrics));
    checks.push(await this.checkRecentFailures(pipelineType));

    const passCount = checks.filter(c => c.status === 'pass').length;
    const failCount = checks.filter(c => c.status === 'fail').length;
    const overallScore = (passCount * 100 + (checks.length - passCount - failCount) * 50) / checks.length;

    return {
      healthy: failCount === 0,
      timestamp: now,
      checks,
      overallScore,
    };
  }

  private checkSuccessRate(metrics: AggregatedMetrics): HealthCheck {
    const rate = metrics.successRate;
    const threshold = this.thresholds.successRate;

    if (metrics.totalExecutions < 5) {
      return {
        name: 'success_rate',
        status: 'pass',
        message: 'Insufficient data for success rate check',
        value: rate,
        threshold,
      };
    }

    return {
      name: 'success_rate',
      status: rate >= threshold ? 'pass' : rate >= threshold * 0.8 ? 'warn' : 'fail',
      message: `Success rate: ${(rate * 100).toFixed(1)}%`,
      value: rate,
      threshold,
    };
  }

  private checkLatency(metrics: AggregatedMetrics): HealthCheck {
    const p95 = metrics.p95DurationMs;
    const threshold = this.thresholds.p95DurationMs;

    if (metrics.totalExecutions < 5) {
      return {
        name: 'latency_p95',
        status: 'pass',
        message: 'Insufficient data for latency check',
        value: p95,
        threshold,
      };
    }

    return {
      name: 'latency_p95',
      status: p95 <= threshold ? 'pass' : p95 <= threshold * 1.5 ? 'warn' : 'fail',
      message: `P95 latency: ${(p95 / 1000).toFixed(1)}s`,
      value: p95,
      threshold,
    };
  }

  private checkErrorRate(metrics: AggregatedMetrics): HealthCheck {
    const errorRate = metrics.totalExecutions > 0 
      ? metrics.failureCount / metrics.totalExecutions 
      : 0;
    const threshold = this.thresholds.errorRate;

    return {
      name: 'error_rate',
      status: errorRate <= threshold ? 'pass' : errorRate <= threshold * 1.5 ? 'warn' : 'fail',
      message: `Error rate: ${(errorRate * 100).toFixed(1)}%`,
      value: errorRate,
      threshold,
    };
  }

  private async checkRecentFailures(pipelineType: PipelineType): Promise<HealthCheck> {
    const recentEvents = await this.collector.getRecentEvents(50);
    const recentFailures = recentEvents.filter(
      e => e.type === 'pipeline:failed' && e.pipelineType === pipelineType
    ).length;
    const threshold = this.thresholds.recentFailures;

    return {
      name: 'recent_failures',
      status: recentFailures <= threshold ? 'pass' : recentFailures <= threshold * 2 ? 'warn' : 'fail',
      message: `Recent failures: ${recentFailures}`,
      value: recentFailures,
      threshold,
    };
  }
}

export class PersistentObservabilityDashboard {
  private collector: PersistentMetricsCollector;
  private aggregator: PersistentMetricsAggregator;
  private healthChecker: PersistentHealthChecker;

  constructor() {
    this.collector = new PersistentMetricsCollector();
    this.aggregator = new PersistentMetricsAggregator();
    this.healthChecker = new PersistentHealthChecker(this.collector);
  }

  async recordEvent(event: PipelineEvent): Promise<void> {
    await this.collector.recordEvent(event);
  }

  async getExecutionMetrics(executionId: string): Promise<PipelineMetricsData | null> {
    return this.collector.getMetrics(executionId);
  }

  async getAggregatedMetrics(
    pipelineType: PipelineType,
    timeWindowMinutes = 60
  ): Promise<AggregatedMetrics> {
    const now = new Date();
    const start = new Date(now.getTime() - timeWindowMinutes * 60 * 1000);
    return this.aggregator.aggregate(pipelineType, { start, end: now });
  }

  async getHealthStatus(pipelineType: PipelineType): Promise<HealthCheckResult> {
    return this.healthChecker.check(pipelineType);
  }

  async getAllPipelinesHealth(): Promise<Map<PipelineType, HealthCheckResult>> {
    const pipelineTypes: PipelineType[] = ['novel-setup', 'outline', 'chapter', 'review', 'finalize'];
    const results = new Map<PipelineType, HealthCheckResult>();

    for (const type of pipelineTypes) {
      results.set(type, await this.healthChecker.check(type));
    }

    return results;
  }

  async getRecentActivity(limit = 20): Promise<PipelineEvent[]> {
    return this.collector.getRecentEvents(Math.min(limit, 100));
  }

  destroy(): void {
    this.collector.destroy();
  }
}

let dashboardInstance: PersistentObservabilityDashboard | null = null;

export function getObservabilityDashboard(): PersistentObservabilityDashboard {
  if (!dashboardInstance) {
    dashboardInstance = new PersistentObservabilityDashboard();
  }
  return dashboardInstance;
}
