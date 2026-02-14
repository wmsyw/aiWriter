export interface ContinuityGateConfig {
  enabled: boolean;
  passScore: number;
  rejectScore: number;
  maxRepairAttempts: number;
}

interface ResolveContinuityGateConfigOptions {
  defaultReviewPassThreshold?: number;
  defaultRejectScore?: number;
  defaultMaxRepairAttempts?: number;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = toNumber(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function resolveContinuityGateConfig(
  workflowConfig: unknown,
  options: ResolveContinuityGateConfigOptions = {}
): ContinuityGateConfig {
  const workflow = toObject(workflowConfig);
  const review = toObject(workflow.review);
  const continuityGate = toObject(workflow.continuityGate);

  const defaultReviewPassThreshold = toNumber(
    options.defaultReviewPassThreshold,
    7.4
  );
  const defaultRejectScore = toNumber(options.defaultRejectScore, 4.9);
  const defaultMaxRepairAttempts = toNonNegativeInt(
    options.defaultMaxRepairAttempts,
    1
  );

  const reviewPassThreshold = toNumber(review.passThreshold, defaultReviewPassThreshold);
  const defaultPassScore = clamp(reviewPassThreshold - 0.6, 5.8, 8.2);

  const passScore = clamp(toNumber(continuityGate.passScore, defaultPassScore), 4.5, 9.5);
  const rejectScore = clamp(
    toNumber(continuityGate.rejectScore, defaultRejectScore),
    3.5,
    passScore - 0.4
  );

  return {
    enabled: continuityGate.enabled !== false,
    passScore: Number(passScore.toFixed(2)),
    rejectScore: Number(rejectScore.toFixed(2)),
    maxRepairAttempts: toNonNegativeInt(
      continuityGate.maxRepairAttempts,
      defaultMaxRepairAttempts
    ),
  };
}
