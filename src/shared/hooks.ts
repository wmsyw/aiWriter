export type HookStatus = 'planted' | 'referenced' | 'resolved' | 'abandoned';
export type HookType = 'foreshadowing' | 'chekhov_gun' | 'mystery' | 'promise' | 'setup';
export type HookImportance = 'critical' | 'major' | 'minor';

export interface NarrativeHookRecord {
  id: string;
  type: HookType;
  description: string;
  status: HookStatus;
  importance: HookImportance;
  plantedInChapter: number;
  referencedInChapters: number[];
  resolvedInChapter?: number;
  notes?: string;
  relatedCharacters: string[];
}

export interface OverdueHookWarningRecord {
  hookId: string;
  description: string;
  plantedChapter: number;
  chaptersOverdue: number;
  importance: HookImportance;
  suggestedAction: string;
}

export interface HookFilterOptions {
  activeTab: HookStatus | 'all';
  searchQuery: string;
  overdueMap?: Map<string, OverdueHookWarningRecord>;
}

const IMPORTANCE_WEIGHT: Record<HookImportance, number> = {
  critical: 300,
  major: 200,
  minor: 100,
};

const STATUS_WEIGHT: Record<HookStatus, number> = {
  planted: 40,
  referenced: 35,
  resolved: 10,
  abandoned: 0,
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isHookActive(status: HookStatus): boolean {
  return status === 'planted' || status === 'referenced';
}

export function buildHookSearchText(hook: NarrativeHookRecord): string {
  return [
    hook.description,
    hook.notes ?? '',
    hook.type,
    hook.importance,
    ...(hook.relatedCharacters ?? []),
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(' ');
}

export function buildOverdueHookMap(
  warnings: readonly OverdueHookWarningRecord[]
): Map<string, OverdueHookWarningRecord> {
  const map = new Map<string, OverdueHookWarningRecord>();
  for (const warning of warnings) {
    if (!warning?.hookId) continue;
    if (!map.has(warning.hookId)) {
      map.set(warning.hookId, warning);
    }
  }
  return map;
}

export function getHooksCurrentChapter(hooks: readonly NarrativeHookRecord[]): number {
  const maxChapter = hooks.reduce((acc, hook) => {
    const resolved = hook.resolvedInChapter ?? 0;
    const references = Array.isArray(hook.referencedInChapters)
      ? Math.max(0, ...hook.referencedInChapters)
      : 0;
    return Math.max(acc, hook.plantedInChapter || 0, resolved, references);
  }, 0);

  return Math.max(1, maxChapter);
}

function getHookPriorityScore(
  hook: NarrativeHookRecord,
  overdueMap?: Map<string, OverdueHookWarningRecord>
): number {
  const overdue = overdueMap?.get(hook.id);
  const overdueWeight = overdue ? 1000 + overdue.chaptersOverdue * 25 : 0;
  const activeWeight = isHookActive(hook.status) ? 60 : 0;
  const importanceWeight = IMPORTANCE_WEIGHT[hook.importance] ?? 0;
  const statusWeight = STATUS_WEIGHT[hook.status] ?? 0;
  const ageWeight = Math.max(0, 200 - hook.plantedInChapter);

  return overdueWeight + activeWeight + importanceWeight + statusWeight + ageWeight;
}

export function filterAndSortHooks<T extends NarrativeHookRecord>(
  hooks: readonly T[],
  options: HookFilterOptions
): T[] {
  const query = normalizeText(options.searchQuery);
  const overdueMap = options.overdueMap;

  return hooks
    .filter((hook) => {
      const matchesTab = options.activeTab === 'all' || hook.status === options.activeTab;
      if (!matchesTab) return false;
      if (!query) return true;
      return buildHookSearchText(hook).includes(query);
    })
    .sort((a, b) => {
      const scoreDiff =
        getHookPriorityScore(b, overdueMap) - getHookPriorityScore(a, overdueMap);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.plantedInChapter || 0) - (b.plantedInChapter || 0);
    });
}
