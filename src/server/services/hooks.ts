import { prisma } from '../db';
import type { NarrativeHook, PlantHookInput, HooksReport, ExtractedHooks, OverdueHookWarning } from '../../schemas/hooks';
import { HookStatus, HookImportance, DEFAULT_WORKFLOW_CONFIG } from '../../constants/workflow';

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
      reminderThreshold: DEFAULT_WORKFLOW_CONFIG.hooks.reminderThreshold,
    },
  });
  
  return hook as unknown as NarrativeHook;
}

export async function referenceHook(
  hookId: string,
  chapterNumber: number,
  context?: string
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
    const reminderThreshold = threshold || hook.reminderThreshold || DEFAULT_WORKFLOW_CONFIG.hooks.reminderThreshold;
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
    return (importanceOrder[a.importance] - importanceOrder[b.importance]) || (b.chaptersOverdue - a.chaptersOverdue);
  });
}

function generateSuggestedAction(hook: NarrativeHook, chaptersElapsed: number): string {
  if (hook.importance === 'critical') {
    return `Critical hook unresolved for ${chaptersElapsed} chapters. Must be resolved soon or story coherence may suffer.`;
  }
  if (hook.importance === 'major') {
    return `Consider resolving this hook in the next few chapters, or reference it to maintain reader engagement.`;
  }
  return `Minor hook can be resolved at a natural point or abandoned if no longer relevant.`;
}

export async function findHooksByDescription(
  novelId: string,
  description: string
): Promise<NarrativeHook[]> {
  const hooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      description: { contains: description, mode: 'insensitive' },
    },
  });
  
  return hooks as unknown as NarrativeHook[];
}

export async function getHooksReport(novelId: string): Promise<HooksReport> {
  const allHooks = await prisma.narrativeHook.findMany({ where: { novelId } });
  
  const planted = allHooks.filter(h => h.status === 'planted').length;
  const referenced = allHooks.filter(h => h.status === 'referenced').length;
  const resolved = allHooks.filter(h => h.status === 'resolved').length;
  const abandoned = allHooks.filter(h => h.status === 'abandoned').length;
  
  const resolvedHooks = allHooks.filter(h => h.status === 'resolved' && h.resolvedInChapter);
  const avgResolutionChapters = resolvedHooks.length > 0
    ? resolvedHooks.reduce((sum, h) => sum + ((h.resolvedInChapter || 0) - h.plantedInChapter), 0) / resolvedHooks.length
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
  
  const latestChapter = Math.max(...allHooks.map(h => h.plantedInChapter), 0);
  const overdueHooks = await getOverdueHooks(novelId, latestChapter);
  const overdueHooksData = await Promise.all(
    overdueHooks.map(w => getHook(w.hookId))
  );
  
  return {
    totalPlanted: planted + referenced,
    totalResolved: resolved,
    totalUnresolved: planted + referenced,
    totalAbandoned: abandoned,
    resolutionRate: allHooks.length > 0 ? resolved / (allHooks.length - abandoned) : 0,
    averageResolutionChapters: avgResolutionChapters,
    overdueHooks: overdueHooksData.filter((h): h is NarrativeHook => h !== null),
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
  const results = { planted: [] as string[], referenced: [] as string[], resolved: [] as string[] };
  
  for (const hookData of extracted.planted) {
    const hook = await plantHook(novelId, {
      type: hookData.type,
      description: hookData.description,
      plantedInChapter: chapterNumber,
      plantedContext: hookData.context,
      importance: hookData.importance,
      relatedCharacters: hookData.relatedCharacters,
      relatedOrganizations: [],
    });
    results.planted.push(hook.id);
  }
  
  for (const ref of extracted.referenced) {
    const matches = await findHooksByDescription(novelId, ref.hookDescription);
    for (const match of matches) {
      if (match.status !== 'resolved') {
        await referenceHook(match.id, chapterNumber, ref.referenceContext);
        results.referenced.push(match.id);
      }
    }
  }
  
  for (const res of extracted.resolved) {
    const matches = await findHooksByDescription(novelId, res.hookDescription);
    for (const match of matches) {
      if (match.status !== 'resolved') {
        await resolveHook(match.id, chapterNumber, res.resolutionContext);
        results.resolved.push(match.id);
      }
    }
  }
  
  return results;
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
  
  const lines: string[] = ['## Unresolved Narrative Hooks'];
  
  const overdueIds = new Set(overdueWarnings.map(w => w.hookId));
  
  for (const hook of unresolvedHooks) {
    const isOverdue = overdueIds.has(hook.id);
    const prefix = isOverdue ? '[OVERDUE] ' : '';
    const importance = hook.importance === 'critical' ? '[CRITICAL] ' : hook.importance === 'major' ? '[MAJOR] ' : '';
    
    lines.push(`- ${prefix}${importance}${hook.description} (Ch.${hook.plantedInChapter})`);
  }
  
  if (overdueWarnings.length > 0) {
    lines.push('');
    lines.push('### Overdue Hook Warnings');
    for (const warning of overdueWarnings.slice(0, 5)) {
      lines.push(`- ${warning.description}: ${warning.suggestedAction}`);
    }
  }
  
  return lines.join('\n');
}
