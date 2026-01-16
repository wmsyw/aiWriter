import { prisma } from '../db';

export interface EntityMention {
  entityId: string;
  entityName: string;
  entityType: 'character' | 'worldbuilding' | 'plotPoint' | 'custom';
  mentionCount: number;
  positions: number[];
}

export interface MentionContext {
  entityId: string;
  entityName: string;
  entityType: string;
  description: string;
  recentActions: string[];
  relationships: string[];
}

export interface MentionBasedContextResult {
  mentionedEntities: EntityMention[];
  contextSections: MentionContext[];
  formattedContext: string;
}

export async function detectEntityMentions(
  novelId: string,
  content: string
): Promise<EntityMention[]> {
  const materials = await prisma.material.findMany({
    where: { novelId },
    select: { id: true, name: true, type: true },
  });

  const mentions: EntityMention[] = [];

  for (const material of materials) {
    const escapedName = escapeRegex(material.name);
    const regex = new RegExp(escapedName, 'g');
    const matches: RegExpMatchArray[] = [];
    let match: RegExpExecArray | null;

    const tempRegex = new RegExp(escapedName, 'g');
    while ((match = tempRegex.exec(content)) !== null) {
      matches.push(match);
    }

    if (matches.length > 0) {
      mentions.push({
        entityId: material.id,
        entityName: material.name,
        entityType: material.type as EntityMention['entityType'],
        mentionCount: matches.length,
        positions: matches.map(m => m.index ?? 0),
      });
    }
  }

  mentions.sort((a, b) => b.mentionCount - a.mentionCount);

  return mentions;
}

export async function getRecentActionsForEntity(
  novelId: string,
  entityName: string,
  currentChapter: number,
  limit: number = 3
): Promise<string[]> {
  const summaries = await prisma.chapterSummary.findMany({
    where: {
      novelId,
      chapterNumber: { lt: currentChapter },
    },
    orderBy: { chapterNumber: 'desc' },
    take: 10,
  });

  const actions: string[] = [];
  
  for (const summary of summaries) {
    const keyEvents = (summary.keyEvents as string[]) || [];
    const charDevelopments = (summary.characterDevelopments as string[]) || [];
    
    for (const event of [...keyEvents, ...charDevelopments]) {
      if (event.includes(entityName)) {
        actions.push(`Ch.${summary.chapterNumber}: ${event}`);
        if (actions.length >= limit) break;
      }
    }
    if (actions.length >= limit) break;
  }

  return actions;
}

export async function buildMentionBasedContext(
  novelId: string,
  content: string,
  currentChapter: number,
  maxEntities: number = 10
): Promise<MentionBasedContextResult> {
  const mentions = await detectEntityMentions(novelId, content);
  const topMentions = mentions.slice(0, maxEntities);

  const contextSections: MentionContext[] = [];

  for (const mention of topMentions) {
    const material = await prisma.material.findUnique({
      where: { id: mention.entityId },
    });

    if (!material) continue;

    const data = (material.data || {}) as Record<string, unknown>;
    const recentActions = await getRecentActionsForEntity(
      novelId,
      mention.entityName,
      currentChapter,
      3
    );

    const relationships: string[] = [];
    if (data.relationships && Array.isArray(data.relationships)) {
      for (const rel of data.relationships.slice(0, 3) as Array<{ targetId?: string; type?: string }>) {
        if (rel.targetId) {
          const target = await prisma.material.findUnique({
            where: { id: rel.targetId },
            select: { name: true },
          });
          if (target) {
            relationships.push(`${rel.type || '关系'}: ${target.name}`);
          }
        }
      }
    }

    contextSections.push({
      entityId: mention.entityId,
      entityName: mention.entityName,
      entityType: mention.entityType,
      description: (data.description as string) || '',
      recentActions,
      relationships,
    });
  }

  const formattedContext = formatMentionContext(contextSections);

  return {
    mentionedEntities: topMentions,
    contextSections,
    formattedContext,
  };
}

function formatMentionContext(sections: MentionContext[]): string {
  if (sections.length === 0) return '';

  const lines: string[] = ['## 本章提及的实体'];

  for (const section of sections) {
    const typeLabel = getTypeLabel(section.entityType);
    lines.push(`\n### [${typeLabel}] ${section.entityName}`);
    
    if (section.description) {
      lines.push(`描述: ${section.description}`);
    }

    if (section.recentActions.length > 0) {
      lines.push('近期动态:');
      for (const action of section.recentActions) {
        lines.push(`  - ${action}`);
      }
    }

    if (section.relationships.length > 0) {
      lines.push('关系: ' + section.relationships.join('、'));
    }
  }

  return lines.join('\n');
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    character: '角色',
    worldbuilding: '世界观',
    plotPoint: '情节点',
    custom: '其他',
  };
  return labels[type] || type;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function scanOutlineForMentions(
  novelId: string,
  outline: string
): Promise<string[]> {
  const mentions = await detectEntityMentions(novelId, outline);
  return mentions.map(m => m.entityName);
}
