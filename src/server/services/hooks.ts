import { prisma } from '../db';
import type {
  NarrativeHook,
  PlantHookInput,
  HooksReport,
  ExtractedHooks,
  OverdueHookWarning,
} from '../../schemas/hooks';
import { DEFAULT_WORKFLOW_CONFIG } from '../../constants/workflow';

type HookLifecycleAction = 'reference' | 'resolve' | 'abandon' | 'delete';

export interface UpdateHookMetadataInput {
  type?: NarrativeHook['type'];
  description?: string;
  plantedInChapter?: number;
  plantedContext?: string | null;
  importance?: NarrativeHook['importance'];
  expectedResolutionBy?: number | null;
  reminderThreshold?: number;
  relatedCharacters?: string[];
  relatedOrganizations?: string[];
  notes?: string | null;
}

export interface BatchHookActionInput {
  action: HookLifecycleAction;
  chapterNumber?: number;
  context?: string;
  reason?: string;
}

const MATCH_SPLIT_REGEX = /[\s,，。.!！?？:：;；、'"“”‘’\-_/\\()[\]{}<>《》【】]+/g;

function normalizeHookText(value: string): string {
  return value.toLowerCase().replace(MATCH_SPLIT_REGEX, '').trim();
}

function tokenizeHookText(value: string): string[] {
  return value
    .toLowerCase()
    .split(MATCH_SPLIT_REGEX)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreHookDescriptionMatch(hookDescription: string, queryDescription: string): number {
  const hookNormalized = normalizeHookText(hookDescription);
  const queryNormalized = normalizeHookText(queryDescription);
  if (!hookNormalized || !queryNormalized) return 0;

  if (hookNormalized === queryNormalized) {
    return 1000;
  }

  let score = 0;

  if (hookNormalized.includes(queryNormalized) || queryNormalized.includes(hookNormalized)) {
    score += 700;
  }

  const hookTokens = tokenizeHookText(hookDescription);
  const queryTokens = tokenizeHookText(queryDescription);
  if (hookTokens.length > 0 && queryTokens.length > 0) {
    const hookSet = new Set(hookTokens);
    const querySet = new Set(queryTokens);
    let overlap = 0;

    for (const token of querySet) {
      if (hookSet.has(token)) overlap += 1;
    }

    const union = new Set([...hookSet, ...querySet]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    score += Math.round(jaccard * 400);
  }

  if (hookNormalized.startsWith(queryNormalized) || queryNormalized.startsWith(hookNormalized)) {
    score += 120;
  }

  return score;
}

export async function plantHook(novelId: string, input: PlantHookInput): Promise<NarrativeHook> {
  const hook = await prisma.narrativeHook.create({
    data: {
      novelId,
      type: input.type,
      description: input.description,
      plantedInChapter: input.plantedInChapter,
      plantedContext: input.plantedContext || null,
      importance: input.importance || 'minor',
      expectedResolutionBy: input.expectedResolutionBy || null,
      relatedCharacters: input.relatedCharacters || [],
      relatedOrganizations: input.relatedOrganizations || [],
      notes: input.notes || null,
      status: 'planted',
      reminderThreshold:
        input.reminderThreshold || DEFAULT_WORKFLOW_CONFIG.hooks.reminderThreshold,
    },
  });

  return hook as unknown as NarrativeHook;
}

export async function updateHookMetadata(
  hookId: string,
  input: UpdateHookMetadataInput
): Promise<NarrativeHook> {
  const data: {
    type?: string;
    description?: string;
    plantedInChapter?: number;
    plantedContext?: string | null;
    importance?: string;
    expectedResolutionBy?: number | null;
    reminderThreshold?: number;
    relatedCharacters?: string[];
    relatedOrganizations?: string[];
    notes?: string | null;
  } = {};

  if (input.type !== undefined) data.type = input.type;
  if (input.description !== undefined) data.description = input.description;
  if (input.plantedInChapter !== undefined) data.plantedInChapter = input.plantedInChapter;
  if (input.plantedContext !== undefined) data.plantedContext = input.plantedContext;
  if (input.importance !== undefined) data.importance = input.importance;
  if (input.expectedResolutionBy !== undefined) data.expectedResolutionBy = input.expectedResolutionBy;
  if (input.reminderThreshold !== undefined) data.reminderThreshold = input.reminderThreshold;
  if (input.relatedCharacters !== undefined) data.relatedCharacters = input.relatedCharacters;
  if (input.relatedOrganizations !== undefined) data.relatedOrganizations = input.relatedOrganizations;
  if (input.notes !== undefined) data.notes = input.notes;

  const hook = await prisma.narrativeHook.update({
    where: { id: hookId },
    data,
  });

  return hook as unknown as NarrativeHook;
}

export async function referenceHook(
  hookId: string,
  chapterNumber: number,
  _context?: string
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "NarrativeHook"
    SET
      "referencedInChapters" = CASE
        WHEN NOT (${chapterNumber} = ANY("referencedInChapters"))
        THEN array_append("referencedInChapters", ${chapterNumber})
        ELSE "referencedInChapters"
      END,
      "status" = 'referenced'
    WHERE id = ${hookId}
  `;
}

export async function resolveHook(
  hookId: string,
  chapterNumber: number,
  context?: string
): Promise<void> {
  await prisma.narrativeHook.update({
    where: { id: hookId },
    data: {
      resolvedInChapter: chapterNumber,
      resolutionContext: context || null,
      status: 'resolved',
    },
  });
}

export async function abandonHook(hookId: string, reason?: string): Promise<void> {
  await prisma.narrativeHook.update({
    where: { id: hookId },
    data: {
      status: 'abandoned',
      notes: reason || null,
    },
  });
}

export async function batchApplyHookAction(
  novelId: string,
  hookIds: string[],
  input: BatchHookActionInput
): Promise<{ updatedCount: number; updatedHooks: NarrativeHook[] }> {
  const uniqueIds = [...new Set(hookIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return { updatedCount: 0, updatedHooks: [] };
  }

  const hooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  const targetIds = hooks.map((hook) => hook.id);
  if (targetIds.length === 0) {
    return { updatedCount: 0, updatedHooks: [] };
  }

  if (input.action === 'delete') {
    const result = await prisma.narrativeHook.deleteMany({
      where: {
        novelId,
        id: { in: targetIds },
      },
    });
    return { updatedCount: result.count, updatedHooks: [] };
  }

  await Promise.all(
    targetIds.map(async (hookId) => {
      if (input.action === 'reference') {
        if (!input.chapterNumber) {
          throw new Error('chapterNumber is required for reference action');
        }
        await referenceHook(hookId, input.chapterNumber, input.context);
        return;
      }

      if (input.action === 'resolve') {
        if (!input.chapterNumber) {
          throw new Error('chapterNumber is required for resolve action');
        }
        await resolveHook(hookId, input.chapterNumber, input.context);
        return;
      }

      await abandonHook(hookId, input.reason);
    })
  );

  const updatedHooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      id: { in: targetIds },
    },
  });

  return {
    updatedCount: updatedHooks.length,
    updatedHooks: updatedHooks as unknown as NarrativeHook[],
  };
}

export async function getHook(hookId: string): Promise<NarrativeHook | null> {
  const hook = await prisma.narrativeHook.findUnique({ where: { id: hookId } });
  return hook as unknown as NarrativeHook | null;
}

export async function getNovelHooks(novelId: string, status?: string): Promise<NarrativeHook[]> {
  const where: Record<string, unknown> = { novelId };
  if (status) where.status = status;

  const hooks = await prisma.narrativeHook.findMany({
    where,
    orderBy: [{ plantedInChapter: 'asc' }, { importance: 'desc' }],
  });

  return hooks as unknown as NarrativeHook[];
}

export async function getUnresolvedHooks(novelId: string): Promise<NarrativeHook[]> {
  const hooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      status: { in: ['planted', 'referenced'] },
    },
    orderBy: [{ importance: 'desc' }, { plantedInChapter: 'asc' }],
  });

  return hooks as unknown as NarrativeHook[];
}

export async function getOverdueHooks(
  novelId: string,
  currentChapter: number,
  threshold?: number
): Promise<OverdueHookWarning[]> {
  const unresolvedHooks = await getUnresolvedHooks(novelId);
  const overdueWarnings: OverdueHookWarning[] = [];

  for (const hook of unresolvedHooks) {
    const reminderThreshold =
      threshold || hook.reminderThreshold || DEFAULT_WORKFLOW_CONFIG.hooks.reminderThreshold;
    const chaptersElapsed = currentChapter - hook.plantedInChapter;

    if (chaptersElapsed >= reminderThreshold) {
      overdueWarnings.push({
        hookId: hook.id,
        description: hook.description,
        plantedChapter: hook.plantedInChapter,
        chaptersOverdue: chaptersElapsed - reminderThreshold,
        importance: hook.importance as 'critical' | 'major' | 'minor',
        suggestedAction: generateSuggestedAction(hook, chaptersElapsed),
      });
    }
  }

  return overdueWarnings.sort((a, b) => {
    const importanceOrder = { critical: 0, major: 1, minor: 2 };
    return (
      importanceOrder[a.importance] - importanceOrder[b.importance] ||
      b.chaptersOverdue - a.chaptersOverdue
    );
  });
}

function generateSuggestedAction(hook: NarrativeHook, chaptersElapsed: number): string {
  if (hook.importance === 'critical') {
    return `关键钩子已悬置 ${chaptersElapsed} 章，建议在接下来 1-2 章内明确推进或回收。`;
  }
  if (hook.importance === 'major') {
    return '建议在后续章节尽快引用或回收，避免读者遗忘核心悬念。';
  }
  return '可在自然情节点回收，或在确认无用后标记为放弃。';
}

export async function findHooksByDescription(
  novelId: string,
  description: string
): Promise<NarrativeHook[]> {
  const normalizedQuery = normalizeHookText(description);
  if (!normalizedQuery) return [];

  const hooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      status: { in: ['planted', 'referenced', 'resolved'] },
    },
  });

  return hooks
    .map((hook) => ({
      hook,
      score: scoreHookDescriptionMatch(hook.description, description),
    }))
    .filter((item) => item.score >= 220)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.hook.plantedInChapter || 0) - (a.hook.plantedInChapter || 0);
    })
    .map((item) => item.hook as unknown as NarrativeHook);
}

export async function getHooksReport(novelId: string): Promise<HooksReport> {
  const allHooks = await prisma.narrativeHook.findMany({ where: { novelId } });

  const planted = allHooks.filter((h) => h.status === 'planted').length;
  const referenced = allHooks.filter((h) => h.status === 'referenced').length;
  const resolved = allHooks.filter((h) => h.status === 'resolved').length;
  const abandoned = allHooks.filter((h) => h.status === 'abandoned').length;

  const resolvedHooks = allHooks.filter((h) => h.status === 'resolved' && h.resolvedInChapter);
  const avgResolutionChapters =
    resolvedHooks.length > 0
      ? resolvedHooks.reduce((sum, h) => sum + ((h.resolvedInChapter || 0) - h.plantedInChapter), 0) /
        resolvedHooks.length
      : 0;

  const hooksByType: Record<string, number> = {};
  const hooksByImportance: Record<string, number> = {};
  const unresolvedByImportance = { critical: 0, major: 0, minor: 0 };

  for (const hook of allHooks) {
    hooksByType[hook.type] = (hooksByType[hook.type] || 0) + 1;
    hooksByImportance[hook.importance] = (hooksByImportance[hook.importance] || 0) + 1;

    if (hook.status === 'planted' || hook.status === 'referenced') {
      const imp = hook.importance as keyof typeof unresolvedByImportance;
      unresolvedByImportance[imp] = (unresolvedByImportance[imp] || 0) + 1;
    }
  }

  const latestChapter = allHooks.reduce((max, hook) => {
    const referencedMax = Array.isArray(hook.referencedInChapters)
      ? Math.max(0, ...hook.referencedInChapters)
      : 0;
    return Math.max(
      max,
      hook.plantedInChapter || 0,
      hook.resolvedInChapter || 0,
      referencedMax,
      hook.expectedResolutionBy || 0
    );
  }, 1);

  const overdueHooks = await getOverdueHooks(novelId, latestChapter);
  const overdueHooksData = await Promise.all(overdueHooks.map((warning) => getHook(warning.hookId)));
  const effectiveTotal = allHooks.length - abandoned;

  return {
    totalPlanted: planted + referenced,
    totalResolved: resolved,
    totalUnresolved: planted + referenced,
    totalAbandoned: abandoned,
    resolutionRate: effectiveTotal > 0 ? resolved / effectiveTotal : 0,
    averageResolutionChapters: avgResolutionChapters,
    overdueHooks: overdueHooksData.filter((hook): hook is NarrativeHook => hook !== null),
    hooksByType,
    hooksByImportance,
    unresolvedByImportance,
  };
}

export async function processExtractedHooks(
  novelId: string,
  chapterNumber: number,
  extracted: ExtractedHooks
): Promise<{ planted: string[]; referenced: string[]; resolved: string[] }> {
  const plantedSet = new Set<string>();
  const referencedSet = new Set<string>();
  const resolvedSet = new Set<string>();

  for (const hookData of extracted.planted) {
    const normalizedDescription = normalizeHookText(hookData.description);
    if (!normalizedDescription) continue;

    const existingMatches = await findHooksByDescription(novelId, hookData.description);
    const duplicate = existingMatches.find(
      (match) =>
        normalizeHookText(match.description) === normalizedDescription &&
        (match.status === 'planted' || match.status === 'referenced') &&
        Math.abs((match.plantedInChapter || 0) - chapterNumber) <= 2
    );

    if (duplicate) {
      continue;
    }

    const hook = await plantHook(novelId, {
      type: hookData.type,
      description: hookData.description,
      plantedInChapter: chapterNumber,
      plantedContext: hookData.context,
      importance: hookData.importance,
      relatedCharacters: hookData.relatedCharacters,
      relatedOrganizations: [],
    });
    plantedSet.add(hook.id);
  }

  for (const ref of extracted.referenced) {
    const matches = await findHooksByDescription(novelId, ref.hookDescription);
    const bestMatch = matches.find(
      (match) => match.status !== 'resolved' && match.status !== 'abandoned'
    );
    if (!bestMatch) {
      continue;
    }

    await referenceHook(bestMatch.id, chapterNumber, ref.referenceContext);
    referencedSet.add(bestMatch.id);
  }

  for (const res of extracted.resolved) {
    const matches = await findHooksByDescription(novelId, res.hookDescription);
    const bestMatch = matches.find(
      (match) => match.status !== 'resolved' && match.status !== 'abandoned'
    );
    if (!bestMatch) {
      continue;
    }

    await resolveHook(bestMatch.id, chapterNumber, res.resolutionContext);
    resolvedSet.add(bestMatch.id);
  }

  return {
    planted: [...plantedSet],
    referenced: [...referencedSet],
    resolved: [...resolvedSet],
  };
}

export async function formatHooksForContext(
  novelId: string,
  currentChapter: number
): Promise<string> {
  const unresolvedHooks = await getUnresolvedHooks(novelId);
  const overdueWarnings = await getOverdueHooks(novelId, currentChapter);

  if (unresolvedHooks.length === 0) {
    return '';
  }

  const lines: string[] = ['## 未回收叙事钩子'];

  const overdueIds = new Set(overdueWarnings.map((warning) => warning.hookId));

  for (const hook of unresolvedHooks) {
    const isOverdue = overdueIds.has(hook.id);
    const overduePrefix = isOverdue ? '[逾期] ' : '';
    const importance =
      hook.importance === 'critical'
        ? '[关键] '
        : hook.importance === 'major'
          ? '[重要] '
          : '';
    const expected = hook.expectedResolutionBy ? `，预期第${hook.expectedResolutionBy}章回收` : '';

    lines.push(
      `- ${overduePrefix}${importance}${hook.description}（埋设：第${hook.plantedInChapter}章${expected}）`
    );
  }

  if (overdueWarnings.length > 0) {
    lines.push('');
    lines.push('### 逾期风险提醒');
    for (const warning of overdueWarnings.slice(0, 5)) {
      lines.push(`- ${warning.description}：${warning.suggestedAction}`);
    }
  }

  return lines.join('\n');
}
