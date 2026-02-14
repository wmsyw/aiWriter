import {
  extractEndingSnippet,
  type ContinuityChapterInput,
  type ContinuitySummaryInput,
} from './chapter-continuity';

type IssueSeverity = 'critical' | 'major' | 'minor';
type IssueType = 'opening_anchor' | 'event_chain' | 'hook_progress' | 'timeline';

export interface ContinuityIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
}

export interface ContinuityAssessmentOptions {
  passScore?: number;
  rejectScore?: number;
  openingWindowChars?: number;
  maxAnchorSignals?: number;
  maxEventSignals?: number;
  maxHookSignals?: number;
}

export interface ContinuityAssessment {
  score: number;
  verdict: 'pass' | 'revise' | 'reject';
  issues: ContinuityIssue[];
  metrics: {
    openingCoverage: number;
    eventCoverage: number;
    hookCoverage: number;
    timelineCue: boolean;
    signalTotals: {
      anchors: number;
      events: number;
      hooks: number;
    };
  };
  matchedSignals: {
    anchors: string[];
    events: string[];
    hooks: string[];
  };
}

interface MatchResult {
  total: number;
  matched: string[];
  coverage: number;
}

const DEFAULT_PASS_SCORE = 6.2;
const DEFAULT_REJECT_SCORE = 4.9;
const DEFAULT_OPENING_WINDOW_CHARS = 420;
const DEFAULT_MAX_ANCHOR_SIGNALS = 8;
const DEFAULT_MAX_EVENT_SIGNALS = 10;
const DEFAULT_MAX_HOOK_SIGNALS = 8;

function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, '');
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function splitIntoSignals(text: string, maxSignals: number): string[] {
  if (!text.trim()) return [];

  const rawSegments = text
    .split(/[。！？!?；;\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4);

  const signals: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawSegments) {
    const cleaned = raw
      .replace(/[，,:：、"“”'‘’（）()《》【】]/g, '')
      .trim();
    if (cleaned.length < 4) continue;

    const candidates =
      cleaned.length <= 24
        ? [cleaned]
        : [cleaned.slice(0, 16), cleaned.slice(-16)];

    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      signals.push(candidate);
      if (signals.length >= maxSignals) {
        return signals;
      }
    }
  }

  return signals;
}

function buildSignalChunks(signal: string): string[] {
  const normalized = normalizeForMatch(signal);
  if (normalized.length <= 6) return [normalized];

  const chunkLength = normalized.length >= 12 ? 6 : 4;
  const chunks: string[] = [];

  for (let idx = 0; idx + chunkLength <= normalized.length; idx += chunkLength) {
    const chunk = normalized.slice(idx, idx + chunkLength);
    if (chunk.length >= 4) {
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    chunks.push(normalized.slice(0, Math.min(6, normalized.length)));
  }

  return Array.from(new Set(chunks));
}

function buildBigrams(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (normalized.length < 2) return [];

  const grams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const gram = normalized.slice(index, index + 2);
    if (gram.trim().length === 2) {
      grams.push(gram);
    }
  }

  return Array.from(new Set(grams));
}

function hasSufficientBigramOverlap(
  normalizedContent: string,
  normalizedSignal: string
): boolean {
  const grams = buildBigrams(normalizedSignal);
  if (grams.length < 3) return false;

  let matched = 0;
  for (const gram of grams) {
    if (normalizedContent.includes(gram)) {
      matched += 1;
    }
  }

  const coverage = matched / grams.length;
  if (coverage >= 0.55 && matched >= 3) {
    return true;
  }

  if (normalizedSignal.length >= 8 && coverage >= 0.42 && matched >= 4) {
    return true;
  }

  return false;
}

function isSignalMatched(normalizedContent: string, signal: string): boolean {
  const normalizedSignal = normalizeForMatch(signal);
  if (!normalizedSignal || normalizedSignal.length < 4) return false;

  if (normalizedContent.includes(normalizedSignal)) {
    return true;
  }

  const chunks = buildSignalChunks(normalizedSignal);
  if (chunks.length <= 1) {
    return hasSufficientBigramOverlap(normalizedContent, normalizedSignal);
  }

  let matchedChunkCount = 0;
  for (const chunk of chunks) {
    if (normalizedContent.includes(chunk)) {
      matchedChunkCount += 1;
    }
  }

  if (matchedChunkCount >= Math.max(2, Math.ceil(chunks.length / 2))) {
    return true;
  }

  return hasSufficientBigramOverlap(normalizedContent, normalizedSignal);
}

function matchSignals(content: string, signals: string[]): MatchResult {
  const normalizedContent = normalizeForMatch(content);
  if (signals.length === 0) {
    return { total: 0, matched: [], coverage: 1 };
  }

  const matched: string[] = [];
  for (const signal of signals) {
    if (isSignalMatched(normalizedContent, signal)) {
      matched.push(signal);
    }
  }

  return {
    total: signals.length,
    matched,
    coverage: matched.length / signals.length,
  };
}

function collectUnresolvedHooks(summaries: ContinuitySummaryInput[]): string[] {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return [];
  }

  const unresolved = new Set<string>();
  const ordered = [...summaries].sort((a, b) => b.chapterNumber - a.chapterNumber);
  for (const summary of ordered) {
    for (const hook of toStringList(summary.hooksPlanted)) {
      unresolved.add(hook);
    }
    for (const hook of toStringList(summary.hooksReferenced)) {
      unresolved.add(hook);
    }
    for (const hook of toStringList(summary.hooksResolved)) {
      unresolved.delete(hook);
    }
  }

  return Array.from(unresolved);
}

function collectAnchorSignals(
  chapters: ContinuityChapterInput[],
  maxSignals: number
): string[] {
  const sorted = [...chapters]
    .sort((a, b) => a.order - b.order)
    .slice(-2);

  const signals: string[] = [];
  for (const chapter of sorted) {
    const ending = extractEndingSnippet(chapter.content || '', 240);
    signals.push(...splitIntoSignals(ending, maxSignals));
    if (signals.length >= maxSignals) break;
  }

  return Array.from(new Set(signals)).slice(0, maxSignals);
}

function collectEventSignals(
  summaries: ContinuitySummaryInput[],
  maxSignals: number
): string[] {
  const sorted = [...summaries]
    .sort((a, b) => b.chapterNumber - a.chapterNumber)
    .slice(0, 8);

  const signals: string[] = [];
  for (const summary of sorted) {
    const keyEvents = toStringList(summary.keyEvents).slice(0, 2);
    for (const event of keyEvents) {
      signals.push(...splitIntoSignals(event, maxSignals));
      if (signals.length >= maxSignals) break;
    }
    if (signals.length >= maxSignals) break;

    if (summary.oneLine && summary.oneLine.trim()) {
      signals.push(...splitIntoSignals(summary.oneLine, maxSignals));
    }
    if (signals.length >= maxSignals) break;
  }

  return Array.from(new Set(signals)).slice(0, maxSignals);
}

function collectHookSignals(
  summaries: ContinuitySummaryInput[],
  maxSignals: number
): string[] {
  const unresolved = collectUnresolvedHooks(summaries);
  const signals: string[] = [];
  for (const hook of unresolved.slice(0, maxSignals)) {
    signals.push(...splitIntoSignals(hook, maxSignals));
    if (signals.length >= maxSignals) break;
  }
  return Array.from(new Set(signals)).slice(0, maxSignals);
}

function hasTimelineCue(openingText: string): boolean {
  const compact = normalizeSentence(openingText);
  return /(次日|翌日|当晚|随后|与此同时|同一时间|片刻后|回到|继续|仍然|刚刚|不久后)/.test(
    compact
  );
}

export function assessChapterContinuity(
  candidateContent: string,
  chapters: ContinuityChapterInput[],
  summaries: ContinuitySummaryInput[],
  options: ContinuityAssessmentOptions = {}
): ContinuityAssessment {
  const passScore = options.passScore ?? DEFAULT_PASS_SCORE;
  const rejectScore = options.rejectScore ?? DEFAULT_REJECT_SCORE;
  const openingWindowChars =
    options.openingWindowChars ?? DEFAULT_OPENING_WINDOW_CHARS;
  const maxAnchorSignals = options.maxAnchorSignals ?? DEFAULT_MAX_ANCHOR_SIGNALS;
  const maxEventSignals = options.maxEventSignals ?? DEFAULT_MAX_EVENT_SIGNALS;
  const maxHookSignals = options.maxHookSignals ?? DEFAULT_MAX_HOOK_SIGNALS;

  const normalizedContent = normalizeSentence(candidateContent || '');
  if (!normalizedContent) {
    return {
      score: 0,
      verdict: 'reject',
      issues: [
        {
          type: 'timeline',
          severity: 'critical',
          message: '章节内容为空，无法建立与前文的连续性承接。',
        },
      ],
      metrics: {
        openingCoverage: 0,
        eventCoverage: 0,
        hookCoverage: 0,
        timelineCue: false,
        signalTotals: {
          anchors: 0,
          events: 0,
          hooks: 0,
        },
      },
      matchedSignals: {
        anchors: [],
        events: [],
        hooks: [],
      },
    };
  }

  const anchorSignals = collectAnchorSignals(chapters, maxAnchorSignals);
  const eventSignals = collectEventSignals(summaries, maxEventSignals);
  const hookSignals = collectHookSignals(summaries, maxHookSignals);

  const totalSignals = anchorSignals.length + eventSignals.length + hookSignals.length;
  if (totalSignals === 0) {
    return {
      score: 10,
      verdict: 'pass',
      issues: [],
      metrics: {
        openingCoverage: 1,
        eventCoverage: 1,
        hookCoverage: 1,
        timelineCue: true,
        signalTotals: {
          anchors: 0,
          events: 0,
          hooks: 0,
        },
      },
      matchedSignals: {
        anchors: [],
        events: [],
        hooks: [],
      },
    };
  }

  const openingText = normalizedContent.slice(0, openingWindowChars);
  const openingMatch = matchSignals(openingText, anchorSignals);
  const fullEventMatch = matchSignals(normalizedContent, eventSignals);
  const fullHookMatch = matchSignals(normalizedContent, hookSignals);
  const timelineCue = hasTimelineCue(openingText);

  const openingCoverage =
    openingMatch.total === 0
      ? 1
      : Math.min(
          1,
          openingMatch.coverage * 0.75 + (timelineCue ? 0.25 : 0)
        );
  const eventCoverage =
    fullEventMatch.total === 0 ? 1 : fullEventMatch.coverage;
  const hookCoverage = fullHookMatch.total === 0 ? 1 : fullHookMatch.coverage;

  const weightedCoverage =
    openingCoverage * 0.45 +
    eventCoverage * 0.35 +
    hookCoverage * 0.2;
  const score = Number((4 + weightedCoverage * 6).toFixed(2));

  const issues: ContinuityIssue[] = [];
  if (openingMatch.total >= 2 && openingCoverage < 0.25) {
    issues.push({
      type: 'opening_anchor',
      severity: 'major',
      message: '开篇未有效承接前章结尾状态，章节衔接感偏弱。',
    });
  }

  if (!timelineCue && openingMatch.total > 0 && openingMatch.matched.length === 0) {
    issues.push({
      type: 'timeline',
      severity: 'minor',
      message: '开篇缺少明确时间/场景承接提示，建议补充过渡语句。',
    });
  }

  if (fullEventMatch.total >= 4 && eventCoverage < 0.2) {
    issues.push({
      type: 'event_chain',
      severity: 'major',
      message: '对近章关键事件链呼应不足，主线连续性不够清晰。',
    });
  }

  if (fullHookMatch.total >= 2 && hookCoverage < 0.2) {
    issues.push({
      type: 'hook_progress',
      severity: 'major',
      message: '未回收线索推进不足，存在钩子被遗忘风险。',
    });
  }

  if (
    openingCoverage < 0.2 &&
    eventCoverage < 0.15 &&
    hookCoverage < 0.15
  ) {
    issues.push({
      type: 'timeline',
      severity: 'critical',
      message: '章节与历史上下文关联极弱，疑似出现明显断层。',
    });
  }

  const hasCritical = issues.some((issue) => issue.severity === 'critical');
  const hasMajor = issues.some((issue) => issue.severity === 'major');

  const verdict: ContinuityAssessment['verdict'] =
    hasCritical || score < rejectScore
      ? 'reject'
      : score < passScore || hasMajor
        ? 'revise'
        : 'pass';

  return {
    score,
    verdict,
    issues,
    metrics: {
      openingCoverage: Number(openingCoverage.toFixed(3)),
      eventCoverage: Number(eventCoverage.toFixed(3)),
      hookCoverage: Number(hookCoverage.toFixed(3)),
      timelineCue,
      signalTotals: {
        anchors: anchorSignals.length,
        events: eventSignals.length,
        hooks: hookSignals.length,
      },
    },
    matchedSignals: {
      anchors: openingMatch.matched,
      events: fullEventMatch.matched,
      hooks: fullHookMatch.matched,
    },
  };
}
