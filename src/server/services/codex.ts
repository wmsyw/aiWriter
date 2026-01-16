import { prisma } from '../db';
import { detectEntityMentions, getRecentActionsForEntity } from './mention-detection';

export interface CodexEntry {
  id: string;
  name: string;
  type: string;
  description: string;
  aliases: string[];
  traits?: string[];
  relationships?: Array<{ targetName: string; type: string }>;
  recentActions: string[];
  lastActiveChapter: number | null;
  appearanceCount: number;
  priority: number;
  relevanceScore: number;
}

export interface CodexRetrievalResult {
  entries: CodexEntry[];
  formattedContext: string;
  totalEntries: number;
  retrievedCount: number;
}

export interface CodexRetrievalOptions {
  maxEntries?: number;
  includeRecentActions?: boolean;
  recentActionsLimit?: number;
  prioritizeByMentions?: boolean;
  contentForMentionDetection?: string;
  currentChapter?: number;
  typeFilter?: string[];
}

export async function getCodexEntries(
  novelId: string,
  options: CodexRetrievalOptions = {}
): Promise<CodexRetrievalResult> {
  const {
    maxEntries = 15,
    includeRecentActions = true,
    recentActionsLimit = 3,
    prioritizeByMentions = true,
    contentForMentionDetection,
    currentChapter = 999,
    typeFilter,
  } = options;

  const whereClause: Record<string, unknown> = { novelId };
  if (typeFilter && typeFilter.length > 0) {
    whereClause.type = { in: typeFilter };
  }

  const materials = await prisma.material.findMany({
    where: whereClause,
    orderBy: [
      { codexPriority: 'desc' },
      { appearanceCount: 'desc' },
      { lastActiveChapter: 'desc' },
    ],
  });

  let entries: CodexEntry[] = [];

  for (const material of materials) {
    const data = (material.data || {}) as Record<string, unknown>;
    const codexMeta = (material.codexMetadata || {}) as Record<string, unknown>;

    const relationships: Array<{ targetName: string; type: string }> = [];
    if (data.relationships && Array.isArray(data.relationships)) {
      for (const rel of data.relationships.slice(0, 5) as Array<{ targetId?: string; type?: string }>) {
        if (rel.targetId) {
          const target = await prisma.material.findUnique({
            where: { id: rel.targetId },
            select: { name: true },
          });
          if (target) {
            relationships.push({ targetName: target.name, type: rel.type || '关系' });
          }
        }
      }
    }

    const recentActions: string[] = [];
    if (includeRecentActions) {
      const actions = await getRecentActionsForEntity(
        novelId,
        material.name,
        currentChapter,
        recentActionsLimit
      );
      recentActions.push(...actions);
    }

    entries.push({
      id: material.id,
      name: material.name,
      type: material.type,
      description: (data.description as string) || '',
      aliases: (material.aliases as string[]) || [],
      traits: data.traits as string[] | undefined,
      relationships,
      recentActions,
      lastActiveChapter: material.lastActiveChapter,
      appearanceCount: material.appearanceCount || 0,
      priority: material.codexPriority || 50,
      relevanceScore: 0,
    });
  }

  if (prioritizeByMentions && contentForMentionDetection) {
    const mentions = await detectEntityMentions(novelId, contentForMentionDetection);
    const mentionMap = new Map(mentions.map(m => [m.entityId, m.mentionCount]));

    for (const entry of entries) {
      const mentionCount = mentionMap.get(entry.id) || 0;
      entry.relevanceScore = mentionCount * 10 + entry.priority + (entry.appearanceCount / 10);
    }

    entries.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  const totalEntries = entries.length;
  entries = entries.slice(0, maxEntries);

  const formattedContext = formatCodexContext(entries);

  return {
    entries,
    formattedContext,
    totalEntries,
    retrievedCount: entries.length,
  };
}

function formatCodexContext(entries: CodexEntry[]): string {
  if (entries.length === 0) return '';

  const lines: string[] = ['## Story Bible (Codex)'];

  const byType: Record<string, CodexEntry[]> = {};
  for (const entry of entries) {
    if (!byType[entry.type]) byType[entry.type] = [];
    byType[entry.type].push(entry);
  }

  const typeLabels: Record<string, string> = {
    character: '角色',
    worldbuilding: '世界观',
    plotPoint: '情节点',
    custom: '其他',
  };

  for (const [type, typeEntries] of Object.entries(byType)) {
    const label = typeLabels[type] || type;
    lines.push(`\n### ${label}`);

    for (const entry of typeEntries) {
      lines.push(`\n**${entry.name}**${entry.aliases.length > 0 ? ` (又称: ${entry.aliases.join(', ')})` : ''}`);
      
      if (entry.description) {
        lines.push(entry.description);
      }

      if (entry.traits && entry.traits.length > 0) {
        lines.push(`特征: ${entry.traits.join('、')}`);
      }

      if (entry.relationships.length > 0) {
        const relStr = entry.relationships.map(r => `${r.targetName}(${r.type})`).join('、');
        lines.push(`关系: ${relStr}`);
      }

      if (entry.recentActions.length > 0) {
        lines.push('近期动态:');
        for (const action of entry.recentActions) {
          lines.push(`  - ${action}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export async function updateCodexAppearance(
  novelId: string,
  entityNames: string[],
  chapterNumber: number
): Promise<void> {
  for (const name of entityNames) {
    await prisma.material.updateMany({
      where: { novelId, name },
      data: {
        lastActiveChapter: chapterNumber,
        appearanceCount: { increment: 1 },
      },
    });
  }
}

export async function addEntityAlias(
  materialId: string,
  alias: string
): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { aliases: true },
  });

  if (!material) return;

  const aliases = (material.aliases as string[]) || [];
  if (!aliases.includes(alias)) {
    await prisma.material.update({
      where: { id: materialId },
      data: { aliases: [...aliases, alias] },
    });
  }
}

export async function setCodexPriority(
  materialId: string,
  priority: number
): Promise<void> {
  await prisma.material.update({
    where: { id: materialId },
    data: { codexPriority: Math.max(0, Math.min(100, priority)) },
  });
}

export async function getCodexStats(novelId: string): Promise<{
  totalEntries: number;
  byType: Record<string, number>;
  recentlyActive: number;
  averageAppearances: number;
}> {
  const materials = await prisma.material.findMany({
    where: { novelId },
    select: { type: true, appearanceCount: true, lastActiveChapter: true },
  });

  const byType: Record<string, number> = {};
  let totalAppearances = 0;
  let recentlyActive = 0;

  for (const m of materials) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    totalAppearances += m.appearanceCount || 0;
    if (m.lastActiveChapter && m.lastActiveChapter >= (materials.length - 5)) {
      recentlyActive++;
    }
  }

  return {
    totalEntries: materials.length,
    byType,
    recentlyActive,
    averageAppearances: materials.length > 0 ? totalAppearances / materials.length : 0,
  };
}
