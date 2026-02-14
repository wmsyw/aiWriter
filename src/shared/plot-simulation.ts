function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => item !== null);
}

function toRatio(value: unknown, fallback = 0.5): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  const ratio = parsed > 1 ? parsed / 100 : parsed;
  if (!Number.isFinite(ratio)) return fallback;
  return Math.min(1, Math.max(0, ratio));
}

export interface PlotSimulationControls {
  steps: number;
  iterations: number;
  branchCount: number;
  focusHooks: boolean;
}

export interface PlotBranchView {
  id: string;
  path: string[];
  description: string;
  probability: number;
  engagement: number;
  consistency: number;
  novelty: number;
  tensionArc: number;
  overallScore: number;
  risks: string[];
  opportunities: string[];
}

export interface HookOpportunityView {
  hookId: string;
  hookDescription: string;
  suggestedResolution: string;
}

export interface PlotSimulationView {
  branches: PlotBranchView[];
  deadEndWarnings: string[];
  hookOpportunities: HookOpportunityView[];
  bestPathId: string | null;
}

export function getDefaultPlotSimulationControls(): PlotSimulationControls {
  return {
    steps: 5,
    iterations: 120,
    branchCount: 4,
    focusHooks: true,
  };
}

export function normalizePlotSimulationControls(
  raw: Partial<PlotSimulationControls> | null | undefined
): PlotSimulationControls {
  const defaults = getDefaultPlotSimulationControls();

  const steps = toFiniteNumber(raw?.steps);
  const iterations = toFiniteNumber(raw?.iterations);
  const branchCount = toFiniteNumber(raw?.branchCount);

  return {
    steps: Math.min(10, Math.max(1, Math.round(steps ?? defaults.steps))),
    iterations: Math.min(500, Math.max(20, Math.round(iterations ?? defaults.iterations))),
    branchCount: Math.min(5, Math.max(2, Math.round(branchCount ?? defaults.branchCount))),
    focusHooks: raw?.focusHooks !== false,
  };
}

export function buildPlotSimulationRequest(
  currentChapter: number,
  controls: Partial<PlotSimulationControls> | null | undefined
): {
  action: 'simulate';
  currentChapter: number;
  steps: number;
  iterations: number;
  branchCount: number;
  focusHooks: boolean;
} {
  const normalized = normalizePlotSimulationControls(controls);
  const chapter = Math.max(1, Math.round(currentChapter || 1));

  return {
    action: 'simulate',
    currentChapter: chapter,
    steps: normalized.steps,
    iterations: normalized.iterations,
    branchCount: normalized.branchCount,
    focusHooks: normalized.focusHooks,
  };
}

function normalizeBranch(
  value: unknown,
  index: number,
  total: number
): PlotBranchView | null {
  if (!isRecord(value)) return null;

  const description = toNonEmptyString(value.description) ?? `剧情分支 ${index + 1}`;
  const path = toStringList(value.path);
  const probability = toRatio(value.probability, total > 0 ? 1 / total : 0.25);

  return {
    id: toNonEmptyString(value.id) ?? `branch-${index + 1}`,
    path,
    description,
    probability,
    engagement: toRatio(value.engagement),
    consistency: toRatio(value.consistency),
    novelty: toRatio(value.novelty),
    tensionArc: toRatio(value.tensionArc),
    overallScore: toRatio(value.overallScore),
    risks: toStringList(value.risks),
    opportunities: toStringList(value.opportunities),
  };
}

function normalizeBranchList(value: unknown): PlotBranchView[] {
  if (!Array.isArray(value) || value.length === 0) return [];

  const normalized = value
    .map((item, index) => normalizeBranch(item, index, value.length))
    .filter((item): item is PlotBranchView => item !== null);

  const deduped = new Map<string, PlotBranchView>();
  for (const branch of normalized) {
    if (!deduped.has(branch.id)) {
      deduped.set(branch.id, branch);
    }
  }

  return Array.from(deduped.values());
}

function normalizeHookOpportunity(value: unknown, index: number): HookOpportunityView | null {
  if (!isRecord(value)) return null;

  const hookId = toNonEmptyString(value.hookId) ?? `hook-${index + 1}`;
  const hookDescription = toNonEmptyString(value.hookDescription);
  const suggestedResolution = toNonEmptyString(value.suggestedResolution);

  if (!hookDescription && !suggestedResolution) return null;

  return {
    hookId,
    hookDescription: hookDescription ?? `未命名伏笔 ${index + 1}`,
    suggestedResolution: suggestedResolution ?? '建议在后续章节尽快处理',
  };
}

function normalizeHookOpportunityList(value: unknown): HookOpportunityView[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeHookOpportunity(item, index))
    .filter((item): item is HookOpportunityView => item !== null);
}

export function normalizePlotSimulationPayload(payload: unknown): PlotSimulationView {
  const record = isRecord(payload) ? payload : {};

  const bestPath = normalizeBranch(record.bestPath, 0, 1);
  const alternatives = normalizeBranchList(record.alternativePaths);
  const branchList = normalizeBranchList(record.branches);

  const merged = bestPath ? [bestPath, ...alternatives] : [...alternatives, ...branchList];
  const deduped = new Map<string, PlotBranchView>();
  for (const branch of merged) {
    if (!deduped.has(branch.id)) {
      deduped.set(branch.id, branch);
    }
  }
  const branches = Array.from(deduped.values()).sort((a, b) => b.overallScore - a.overallScore);

  return {
    branches,
    deadEndWarnings: toStringList(record.deadEndWarnings),
    hookOpportunities: normalizeHookOpportunityList(record.hookOpportunities),
    bestPathId: bestPath?.id ?? branches[0]?.id ?? null,
  };
}
