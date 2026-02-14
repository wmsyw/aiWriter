export interface ContinuityChapterInput {
  order: number;
  title?: string | null;
  content?: string | null;
}

export interface ContinuitySummaryInput {
  chapterNumber: number;
  oneLine?: string | null;
  keyEvents?: unknown;
  characterDevelopments?: unknown;
  hooksPlanted?: unknown;
  hooksReferenced?: unknown;
  hooksResolved?: unknown;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function extractEndingSnippet(
  content: string,
  maxLength = 220
): string {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const tail = normalized.slice(-maxLength);
  const sentenceBreak = tail.search(/[。！？.!?]/);
  if (sentenceBreak >= 0 && sentenceBreak < tail.length - 12) {
    return tail.slice(sentenceBreak + 1).trim();
  }

  return tail.trim();
}

export function buildRecentChapterAnchors(
  chapters: ContinuityChapterInput[],
  limit = 6
): string {
  const selected = [...chapters]
    .sort((a, b) => a.order - b.order)
    .slice(-limit);

  if (selected.length === 0) {
    return '';
  }

  const lines = ['### 近章承接锚点'];
  for (const chapter of selected) {
    const title = (chapter.title || '').trim() || `第${chapter.order}章`;
    const ending = extractEndingSnippet(chapter.content || '');
    if (ending) {
      lines.push(`- 第${chapter.order}章《${title}》结尾状态：${ending}`);
    } else {
      lines.push(`- 第${chapter.order}章《${title}》：需承接上一章冲突与人物状态。`);
    }
  }

  return lines.join('\n');
}

export function buildSummaryContinuityHighlights(
  summaries: ContinuitySummaryInput[],
  limit = 12
): string {
  const selected = [...summaries]
    .sort((a, b) => b.chapterNumber - a.chapterNumber)
    .slice(0, limit);

  if (selected.length === 0) {
    return '';
  }

  const keyEventLines: string[] = [];
  const characterLines: string[] = [];
  const unresolvedHooks = new Set<string>();

  for (const summary of selected) {
    const chapterNo = summary.chapterNumber;
    const keyEvents = toStringList(summary.keyEvents).slice(0, 2);
    const developments = toStringList(summary.characterDevelopments).slice(0, 2);

    if (keyEvents.length > 0) {
      keyEventLines.push(`- 第${chapterNo}章：${keyEvents.join('；')}`);
    } else if (summary.oneLine && summary.oneLine.trim()) {
      keyEventLines.push(`- 第${chapterNo}章：${summary.oneLine.trim()}`);
    }

    if (developments.length > 0) {
      characterLines.push(`- 第${chapterNo}章：${developments.join('；')}`);
    }

    for (const hook of toStringList(summary.hooksPlanted)) {
      unresolvedHooks.add(hook);
    }
    for (const hook of toStringList(summary.hooksReferenced)) {
      unresolvedHooks.add(hook);
    }
    for (const hook of toStringList(summary.hooksResolved)) {
      unresolvedHooks.delete(hook);
    }
  }

  const lines = ['### 历史连续性要点'];
  if (keyEventLines.length > 0) {
    lines.push('关键事件链：');
    lines.push(...keyEventLines.slice(0, 6).reverse());
  }

  if (characterLines.length > 0) {
    lines.push('角色状态变化：');
    lines.push(...characterLines.slice(0, 6).reverse());
  }

  if (unresolvedHooks.size > 0) {
    lines.push(
      `未回收线索：${Array.from(unresolvedHooks).slice(0, 8).join('；')}`
    );
  }

  return lines.join('\n');
}

export function buildContinuityRules(): string {
  return [
    '## 连续性硬约束（必须遵守）',
    '1. 时间线必须紧接上一章结尾，不得无解释跳时空或跳地点。',
    '2. 角色认知、关系、伤势、装备与能力需延续前文，若变化必须给出因果。',
    '3. 已埋设但未回收的线索要么推进、要么明确延后计划，不得凭空遗忘。',
    '4. 本章冲突与目标应承接前文主线，不引入与既有设定冲突的新规则。',
    '5. 若与历史章节信息冲突，优先以前文事实为准并在文内做合理修正。',
  ].join('\n');
}

export function buildChapterContinuityContext(
  chapters: ContinuityChapterInput[],
  summaries: ContinuitySummaryInput[]
): string {
  const sections = [
    buildRecentChapterAnchors(chapters),
    buildSummaryContinuityHighlights(summaries),
  ].filter(Boolean);

  if (sections.length === 0) {
    return '';
  }

  return ['## 多章节连续性上下文', ...sections].join('\n\n');
}

