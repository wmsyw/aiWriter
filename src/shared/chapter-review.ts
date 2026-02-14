export interface ChapterReviewState {
  hasReview: boolean;
  feedback: unknown;
  pendingReview: boolean;
  lastReviewAt: string | null;
  approvedAt: string | null;
}

export interface ReviewSuggestionOption {
  aspect?: string;
  priority?: string;
  issue?: string;
  suggestion?: string;
  current?: string;
  location?: string;
  severity?: string;
}

export interface NormalizedReviewDimension {
  key: string;
  label: string;
  score: number;
  comment?: string;
}

export interface NormalizedReviewSuggestion extends ReviewSuggestionOption {
  aspect: string;
  priority: 'high' | 'medium' | 'low' | 'normal';
  issue: string;
  suggestion: string;
}

export interface NormalizedReviewData {
  avgScore: number;
  grade: string;
  summary: string;
  dimensions: NormalizedReviewDimension[];
  highlights: string[];
  suggestions: NormalizedReviewSuggestion[];
  revisionPriority: string[];
  critique: {
    weakest_aspect?: string;
    strongest_aspect?: string;
    priority_fix?: string;
    [key: string]: string | undefined;
  };
  revisionDirection?: string;
  toneAdjustment?: string;
  pacingSuggestion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toScore10(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return null;
  const normalized = parsed >= 0 && parsed <= 1 ? parsed * 10 : parsed;
  return Math.min(10, Math.max(0, normalized));
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toNullableString(item))
    .filter((item): item is string => item !== null);
}

function normalizeDimensionKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function formatDimensionLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDimensionLabel(
  key: string,
  labelMap: Record<string, string>
): string {
  const normalizedKey = normalizeDimensionKey(key);
  return (
    labelMap[key] ||
    labelMap[normalizedKey] ||
    labelMap[normalizedKey.replace(/\s+/g, '_')] ||
    formatDimensionLabel(key)
  );
}

function normalizePriority(value: unknown): 'high' | 'medium' | 'low' | 'normal' {
  const normalized = normalizeText(value);
  if (
    normalized === 'critical' ||
    normalized === 'major' ||
    normalized === 'high' ||
    normalized === 'p0' ||
    normalized === 'p1'
  ) {
    return 'high';
  }
  if (normalized === 'medium' || normalized === 'normal' || normalized === 'p2') {
    return 'medium';
  }
  if (normalized === 'low' || normalized === 'minor' || normalized === 'p3') {
    return 'low';
  }
  return 'normal';
}

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeCritique(value: unknown): NormalizedReviewData['critique'] {
  if (!isRecord(value)) return {};
  const next: NormalizedReviewData['critique'] = {};

  for (const [key, raw] of Object.entries(value)) {
    const text = toNullableString(raw);
    if (text) {
      next[key] = text;
    }
  }

  return next;
}

function collectRawDimensions(data: Record<string, unknown>): Record<string, unknown> {
  const sources = [data.dimensions, data.dimension_scores, data.categories];

  for (const source of sources) {
    if (isRecord(source) && Object.keys(source).length > 0) {
      return source;
    }
  }

  return {};
}

function collectHighlights(data: Record<string, unknown>): string[] {
  const highlights: string[] = [];

  highlights.push(...toStringList(data.highlights));
  highlights.push(...toStringList(data.strengths));

  const dimensions = isRecord(data.dimensions) ? data.dimensions : null;
  if (dimensions) {
    for (const value of Object.values(dimensions)) {
      if (!isRecord(value)) continue;
      highlights.push(...toStringList(value.strengths));
    }
  }

  const critique = normalizeCritique(data.critique);
  if (critique.strongest_aspect) {
    highlights.push(`最佳表现：${critique.strongest_aspect}`);
  }

  return uniqStrings(highlights).slice(0, 8);
}

function toSuggestion(value: unknown): NormalizedReviewSuggestion | null {
  if (typeof value === 'string') {
    const issue = value.trim();
    if (!issue) return null;
    return {
      aspect: '改进建议',
      priority: 'normal',
      issue,
      suggestion: '',
    };
  }

  if (!isRecord(value)) return null;

  const aspect =
    toNullableString(value.aspect) ||
    toNullableString(value.type) ||
    toNullableString(value.dimension) ||
    '改进建议';

  const issue =
    toNullableString(value.issue) ||
    toNullableString(value.problem) ||
    toNullableString(value.description) ||
    toNullableString(value.location) ||
    '';

  const suggestion =
    toNullableString(value.suggestion) ||
    toNullableString(value.fix) ||
    toNullableString(value.recommendation) ||
    toNullableString(value.fix_suggestion) ||
    toNullableString(value.action) ||
    '';

  const current =
    toNullableString(value.current) ||
    toNullableString(value.original) ||
    toNullableString(value.location) ||
    undefined;

  if (!issue && !suggestion) return null;

  return {
    aspect,
    priority: normalizePriority(value.priority ?? value.severity),
    issue,
    suggestion,
    current,
    location: toNullableString(value.location) || undefined,
    severity: toNullableString(value.severity) || undefined,
  };
}

function collectSuggestions(data: Record<string, unknown>): NormalizedReviewSuggestion[] {
  const sources = [
    data.suggestions,
    data.revision_suggestions,
    data.improvements,
    data.issues,
    data.improvement_suggestions,
    data.poison_points,
  ];

  const list: NormalizedReviewSuggestion[] = [];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      const suggestion = toSuggestion(raw);
      if (suggestion) {
        list.push(suggestion);
      }
    }
  }

  const seen = new Set<string>();
  const deduped = list.filter((item) => {
    const key = `${normalizeText(item.aspect)}|${normalizeText(item.issue)}|${normalizeText(item.suggestion)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const priorityOrder: Record<NormalizedReviewSuggestion['priority'], number> = {
    high: 0,
    medium: 1,
    low: 2,
    normal: 3,
  };

  return deduped.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.aspect.localeCompare(b.aspect, 'zh-Hans-CN');
  });
}

function resolveGrade(score: number): string {
  if (score >= 9) return '卓越';
  if (score >= 8) return '优秀';
  if (score >= 7) return '良好';
  if (score >= 6) return '及格';
  return '需改进';
}

export function parseChapterReviewState(payload: unknown): ChapterReviewState {
  if (!isRecord(payload)) {
    return {
      hasReview: false,
      feedback: null,
      pendingReview: false,
      lastReviewAt: null,
      approvedAt: null,
    };
  }

  const hasReview = payload.hasReview === true;
  const feedback = 'feedback' in payload ? payload.feedback : null;

  return {
    hasReview: hasReview && feedback !== null,
    feedback: hasReview ? feedback : null,
    pendingReview: payload.pendingReview === true,
    lastReviewAt: toNullableString(payload.lastReviewAt),
    approvedAt: toNullableString(payload.approvedAt),
  };
}

export function normalizeChapterReviewData(
  payload: unknown,
  labelMap: Record<string, string>
): NormalizedReviewData {
  if (!isRecord(payload)) {
    return {
      avgScore: 0,
      grade: '未评估',
      summary: '',
      dimensions: [],
      highlights: [],
      suggestions: [],
      revisionPriority: [],
      critique: {},
    };
  }

  const rawDimensions = collectRawDimensions(payload);
  const dimensions = Object.entries(rawDimensions).reduce<NormalizedReviewDimension[]>(
    (acc, [key, value]) => {
      const score = isRecord(value) ? toScore10(value.score) : toScore10(value);
      if (score === null) return acc;

      acc.push({
        key,
        label: resolveDimensionLabel(key, labelMap),
        score: Math.round(score * 10) / 10,
        comment:
          (isRecord(value) &&
            (toNullableString(value.comment) ||
              toNullableString(value.feedback) ||
              toNullableString(value.notes))) ||
          undefined,
      });
      return acc;
    },
    []
  );

  const scoreCandidates = [
    payload.overallScore,
    payload.overall_score,
    payload.score,
    payload.totalScore,
    payload.total_score,
  ];
  const fallbackScore = scoreCandidates
    .map((candidate) => toScore10(candidate))
    .find((score): score is number => score !== null);

  const avgScore = dimensions.length
    ? Math.round(
        (dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length) *
          10
      ) / 10
    : Math.round((fallbackScore ?? 0) * 10) / 10;

  const critique = normalizeCritique(payload.critique);
  const highlights = collectHighlights(payload);
  const suggestions = collectSuggestions(payload);
  const revisionPriority = uniqStrings(toStringList(payload.revision_priority));

  const summary =
    toNullableString(payload.comment) ||
    toNullableString(payload.summary) ||
    toNullableString(payload.overall_comment) ||
    toNullableString(payload.detailed_feedback) ||
    '';

  return {
    avgScore,
    grade: resolveGrade(avgScore),
    summary,
    dimensions,
    highlights,
    suggestions,
    revisionPriority,
    critique,
    revisionDirection:
      toNullableString(payload.revision_direction) ||
      toNullableString(payload.improvement_focus) ||
      undefined,
    toneAdjustment: toNullableString(payload.tone_adjustment) || undefined,
    pacingSuggestion: toNullableString(payload.pacing_suggestion) || undefined,
  };
}

export function buildReviewSuggestionKey(
  suggestion: ReviewSuggestionOption,
  index: number
): string {
  const aspect = normalizeText(suggestion.aspect).slice(0, 32);
  const issue = normalizeText(suggestion.issue).slice(0, 48);
  const action = normalizeText(suggestion.suggestion).slice(0, 48);
  return `${index}:${aspect}:${issue}:${action}`;
}

export function buildDefaultSuggestionSelection(
  suggestions: readonly ReviewSuggestionOption[]
): string[] {
  return suggestions
    .map((suggestion, index) => ({
      key: buildReviewSuggestionKey(suggestion, index),
      hasSuggestion:
        typeof suggestion.suggestion === 'string' && suggestion.suggestion.trim().length > 0,
    }))
    .filter((item) => item.hasSuggestion)
    .map((item) => item.key);
}

export function buildHighPrioritySuggestionSelection(
  suggestions: readonly ReviewSuggestionOption[]
): string[] {
  return suggestions
    .map((suggestion, index) => ({
      key: buildReviewSuggestionKey(suggestion, index),
      priority: normalizePriority(suggestion.priority),
      hasSuggestion:
        typeof suggestion.suggestion === 'string' && suggestion.suggestion.trim().length > 0,
    }))
    .filter((item) => item.hasSuggestion && item.priority === 'high')
    .map((item) => item.key);
}

export function pickSelectedSuggestions<T extends ReviewSuggestionOption>(
  suggestions: readonly T[],
  selectedKeys: readonly string[]
): T[] {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return [];
  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) return [];

  const selectedSet = new Set(selectedKeys);
  return suggestions.filter((suggestion, index) =>
    selectedSet.has(buildReviewSuggestionKey(suggestion, index))
  );
}

export function isReviewStale(
  chapterUpdatedAt: string | null | undefined,
  lastReviewAt: string | null | undefined
): boolean {
  if (!chapterUpdatedAt || !lastReviewAt) return false;
  const chapterMs = new Date(chapterUpdatedAt).getTime();
  const reviewMs = new Date(lastReviewAt).getTime();
  if (!Number.isFinite(chapterMs) || !Number.isFinite(reviewMs)) return false;
  return chapterMs > reviewMs;
}

export function formatReviewTimestamp(
  timestamp: string | null | undefined
): string {
  if (!timestamp) return '—';
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}
