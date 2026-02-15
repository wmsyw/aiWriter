import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { 
  PendingEntity, 
  CreatePendingEntityInput, 
  ReviewPendingEntityInput,
  PendingEntitiesSummary,
  EntityMatchSuggestion,
  ExtractedCharacter,
  ExtractedOrganization,
} from '../../schemas/pending-entity';
import { findPotentialMatches } from '../../schemas/pending-entity';
import { createMaterial, listMaterials } from './materials';

export async function createPendingEntity(input: CreatePendingEntityInput): Promise<PendingEntity> {
  const entity = await prisma.pendingEntity.create({
    data: {
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
      entityType: input.entityType,
      name: input.name,
      extractedData: input.extractedData as Prisma.InputJsonValue,
      status: 'pending',
    },
  });
  
  return entity as unknown as PendingEntity;
}

export async function getPendingEntity(id: string): Promise<PendingEntity | null> {
  const entity = await prisma.pendingEntity.findUnique({ where: { id } });
  return entity as unknown as PendingEntity | null;
}

export async function getPendingEntitiesForNovel(
  novelId: string,
  status?: string
): Promise<PendingEntity[]> {
  const where: Record<string, unknown> = { novelId };
  if (status) where.status = status;
  
  const entities = await prisma.pendingEntity.findMany({
    where,
    orderBy: [{ chapterNumber: 'asc' }, { createdAt: 'asc' }],
  });
  
  return entities as unknown as PendingEntity[];
}

export async function getPendingEntitiesForChapter(
  chapterId: string
): Promise<PendingEntity[]> {
  const entities = await prisma.pendingEntity.findMany({
    where: { chapterId },
    orderBy: { createdAt: 'asc' },
  });
  
  return entities as unknown as PendingEntity[];
}

export async function reviewPendingEntity(
  input: ReviewPendingEntityInput
): Promise<PendingEntity> {
  const entity = await prisma.pendingEntity.findUnique({ where: { id: input.id } });
  if (!entity) throw new Error('Pending entity not found');
  
  const updateData: Record<string, unknown> = {
    reviewNotes: input.reviewNotes || null,
    reviewedAt: new Date(),
  };
  
  switch (input.action) {
    case 'approve':
      updateData.status = 'approved';
      break;
    case 'reject':
      updateData.status = 'rejected';
      break;
    case 'merge':
      if (!input.mergeWithMaterialId) {
        throw new Error('mergeWithMaterialId is required for merge action');
      }
      updateData.status = 'merged';
      updateData.mergedWithId = input.mergeWithMaterialId;
      break;
    default:
      throw new Error(`Unknown action: ${input.action}`);
  }
  
  const updated = await prisma.pendingEntity.update({
    where: { id: input.id },
    data: updateData,
  });
  
  return updated as unknown as PendingEntity;
}

export async function approveAndCreateMaterial(
  entityId: string,
  userId: string,
  overrideData?: Record<string, unknown>
): Promise<{ pendingEntity: PendingEntity; materialId: string }> {
  const entity = await prisma.pendingEntity.findUnique({ where: { id: entityId } });
  if (!entity) throw new Error('Pending entity not found');
  
  const materialType = entity.entityType === 'character' ? 'character' : 'custom';
  const existingMaterial = await prisma.material.findFirst({
    where: {
      novelId: entity.novelId,
      userId,
      type: materialType,
      name: entity.name,
    },
  });
  
  if (existingMaterial) {
    const updated = await prisma.pendingEntity.update({
      where: { id: entityId },
      data: {
        status: 'merged',
        mergedWithId: existingMaterial.id,
        reviewedAt: new Date(),
      },
    });
    
    return {
      pendingEntity: updated as unknown as PendingEntity,
      materialId: existingMaterial.id,
    };
  }
  
  const extractedData = (overrideData || entity.extractedData) as Record<string, unknown>;
  
  const material = await createMaterial({
    novelId: entity.novelId,
    userId,
    type: materialType,
    name: entity.name,
    data: {
      name: entity.name,
      description: extractedData.description as string | undefined,
      traits: extractedData.personality ? [extractedData.personality as string] : undefined,
      backstory: extractedData.identity as string | undefined,
      ...extractedData,
    },
  });
  
  const updated = await prisma.pendingEntity.update({
    where: { id: entityId },
    data: {
      status: 'approved',
      reviewedAt: new Date(),
    },
  });
  
  return {
    pendingEntity: updated as unknown as PendingEntity,
    materialId: material.id,
  };
}

export async function getPendingEntitiesSummary(novelId: string): Promise<PendingEntitiesSummary> {
  const entities = await prisma.pendingEntity.findMany({
    where: { novelId, status: 'pending' },
  });
  
  const byType = { character: 0, organization: 0 };
  const byChapter: Record<string, number> = {};
  const blockedChaptersSet = new Set<number>();
  
  for (const entity of entities) {
    if (entity.entityType === 'character') {
      byType.character++;
    } else {
      byType.organization++;
    }
    
    const chapterKey = entity.chapterNumber.toString();
    byChapter[chapterKey] = (byChapter[chapterKey] || 0) + 1;
    blockedChaptersSet.add(entity.chapterNumber);
  }
  
  return {
    pendingCount: entities.length,
    byType,
    byChapter,
    blockedChapters: Array.from(blockedChaptersSet).sort((a, b) => a - b),
  };
}

export async function findMatchSuggestions(
  novelId: string,
  userId: string,
  pendingEntityId: string
): Promise<EntityMatchSuggestion[]> {
  const entity = await prisma.pendingEntity.findUnique({ where: { id: pendingEntityId } });
  if (!entity) throw new Error('Pending entity not found');
  
  const materialType = entity.entityType === 'character' ? 'character' : undefined;
  const existingMaterials = await listMaterials(novelId, userId, { type: materialType });
  
  const existingNames = existingMaterials.map(m => m.name);
  const matches = findPotentialMatches(entity.name, existingNames);
  
  return matches.map(match => {
    const material = existingMaterials.find(m => m.name === match.name);
    if (!material) return null;
    
    return {
      pendingEntityId: entity.id,
      pendingEntityName: entity.name,
      matchedMaterialId: material.id,
      matchedMaterialName: material.name,
      matchScore: match.score,
      matchReason: generateMatchReason(match.score),
    };
  }).filter((s): s is EntityMatchSuggestion => s !== null);
}

function generateMatchReason(score: number): string {
  if (score >= 1.0) {
    return 'Exact name match - likely the same entity';
  }
  if (score >= 0.8) {
    return 'Name contains or is contained - possible alias or variant';
  }
  if (score >= 0.6) {
    return 'Similar name - may be related or misspelling';
  }
  return 'Low similarity match';
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeUniqueStringArray(...values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function mergeMaterialData(
  existingData: Record<string, unknown>,
  incomingData: Record<string, unknown>
): Record<string, unknown> {
  const mergedAttributes = {
    ...toRecord(existingData.attributes),
    ...toRecord(incomingData.attributes),
  };

  const mergedTraits = mergeUniqueStringArray(existingData.traits, incomingData.traits);
  const mergedAliases = mergeUniqueStringArray(existingData.aliases, incomingData.aliases);

  return {
    ...existingData,
    ...incomingData,
    attributes: mergedAttributes,
    ...(mergedTraits.length > 0 ? { traits: mergedTraits } : {}),
    ...(mergedAliases.length > 0 ? { aliases: mergedAliases } : {}),
  };
}

export async function checkBlockingPendingEntities(
  novelId: string,
  chapterNumber: number
): Promise<{ blocked: boolean; pendingEntities: PendingEntity[] }> {
  return {
    blocked: false,
    pendingEntities: [],
  };
}

export async function batchProcessExtractedEntities(
  novelId: string,
  chapterId: string,
  chapterNumber: number,
  characters: ExtractedCharacter[],
  organizations: ExtractedOrganization[],
  userId?: string
): Promise<{
  characterIds: string[];
  organizationIds: string[];
  createdCount: number;
  updatedCount: number;
}> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { userId: true, genre: true },
  });
  if (!novel) {
    throw new Error('Novel not found');
  }

  const ownerId = (typeof userId === 'string' && userId.trim()) ? userId : novel.userId;
  const genre = novel.genre || '通用';

  const normalizedCharacters = new Map<string, ExtractedCharacter>();
  for (const character of characters) {
    const name = normalizeName(character?.name);
    if (!name) continue;
    const previous = normalizedCharacters.get(name);
    normalizedCharacters.set(
      name,
      previous
        ? {
            ...previous,
            ...character,
            name,
            relationshipsHint: [
              ...(Array.isArray(previous.relationshipsHint) ? previous.relationshipsHint : []),
              ...(Array.isArray(character.relationshipsHint) ? character.relationshipsHint : []),
            ],
          }
        : { ...character, name }
    );
  }

  const normalizedOrganizations = new Map<string, ExtractedOrganization>();
  for (const organization of organizations) {
    const name = normalizeName(organization?.name);
    if (!name) continue;
    const previous = normalizedOrganizations.get(name);
    normalizedOrganizations.set(
      name,
      previous
        ? {
            ...previous,
            ...organization,
            name,
            members: mergeUniqueStringArray(previous.members, organization.members),
          }
        : { ...organization, name }
    );
  }

  const characterIds: string[] = [];
  const organizationIds: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const character of normalizedCharacters.values()) {
    const name = normalizeName(character.name);
    if (!name) continue;
    const existing = await prisma.material.findFirst({
      where: {
        novelId,
        userId: ownerId,
        type: 'character',
        name,
      },
    });

    const incomingData: Record<string, unknown> = {
      name,
      description: typeof character.description === 'string' ? character.description : undefined,
      traits: mergeUniqueStringArray(
        typeof character.personality === 'string' ? [character.personality] : []
      ),
      backstory: typeof character.identity === 'string' ? character.identity : undefined,
      attributes: {
        identity: character.identity || '',
        roleType: character.roleType || '',
        firstImpression: character.firstImpression || '',
        chapter: chapterNumber,
        chapterId,
        source: 'entity-auto-sync',
      },
      relationshipsHint: Array.isArray(character.relationshipsHint) ? character.relationshipsHint : [],
    };

    if (existing) {
      const mergedData = mergeMaterialData(toRecord(existing.data), incomingData);
      const updated = await prisma.material.update({
        where: { id: existing.id },
        data: {
          data: mergedData as Prisma.InputJsonValue,
          genre: existing.genre || genre,
          lastActiveChapter: Math.max(existing.lastActiveChapter ?? 0, chapterNumber),
          appearanceCount: { increment: 1 },
        },
      });
      characterIds.push(updated.id);
      updatedCount += 1;
    } else {
      const created = await prisma.material.create({
        data: {
          novelId,
          userId: ownerId,
          type: 'character',
          name,
          genre,
          data: incomingData as Prisma.InputJsonValue,
          lastActiveChapter: chapterNumber,
          appearanceCount: 1,
        },
      });
      characterIds.push(created.id);
      createdCount += 1;
    }
  }

  for (const organization of normalizedOrganizations.values()) {
    const name = normalizeName(organization.name);
    if (!name) continue;
    const existing = await prisma.material.findFirst({
      where: {
        novelId,
        userId: ownerId,
        type: 'worldbuilding',
        name,
      },
    });

    const incomingData: Record<string, unknown> = {
      name,
      description: typeof organization.description === 'string' ? organization.description : undefined,
      attributes: {
        category: 'organization',
        organizationType: organization.type || '',
        members: mergeUniqueStringArray(organization.members).join('、'),
        influence: organization.influence || '',
        roleInChapter: organization.roleInChapter || '',
        chapter: chapterNumber,
        chapterId,
        source: 'entity-auto-sync',
      },
    };

    if (existing) {
      const mergedData = mergeMaterialData(toRecord(existing.data), incomingData);
      const updated = await prisma.material.update({
        where: { id: existing.id },
        data: {
          data: mergedData as Prisma.InputJsonValue,
          genre: existing.genre || genre,
          lastActiveChapter: Math.max(existing.lastActiveChapter ?? 0, chapterNumber),
          appearanceCount: { increment: 1 },
        },
      });
      organizationIds.push(updated.id);
      updatedCount += 1;
    } else {
      const created = await prisma.material.create({
        data: {
          novelId,
          userId: ownerId,
          type: 'worldbuilding',
          name,
          genre,
          data: incomingData as Prisma.InputJsonValue,
          lastActiveChapter: chapterNumber,
          appearanceCount: 1,
        },
      });
      organizationIds.push(created.id);
      createdCount += 1;
    }
  }

  return { characterIds, organizationIds, createdCount, updatedCount };
}

export async function formatPendingEntitiesForContext(
  novelId: string,
  chapterNumber: number
): Promise<string> {
  return '';
}
