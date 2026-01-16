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
  pendingEntityId: string
): Promise<EntityMatchSuggestion[]> {
  const entity = await prisma.pendingEntity.findUnique({ where: { id: pendingEntityId } });
  if (!entity) throw new Error('Pending entity not found');
  
  const materialType = entity.entityType === 'character' ? 'character' : undefined;
  const existingMaterials = await listMaterials(novelId, { type: materialType });
  
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

export async function checkBlockingPendingEntities(
  novelId: string,
  chapterNumber: number
): Promise<{ blocked: boolean; pendingEntities: PendingEntity[] }> {
  const entities = await prisma.pendingEntity.findMany({
    where: {
      novelId,
      chapterNumber: { lt: chapterNumber },
      status: 'pending',
    },
    orderBy: { chapterNumber: 'asc' },
  });
  
  return {
    blocked: entities.length > 0,
    pendingEntities: entities as unknown as PendingEntity[],
  };
}

export async function batchProcessExtractedEntities(
  novelId: string,
  chapterId: string,
  chapterNumber: number,
  characters: ExtractedCharacter[],
  organizations: ExtractedOrganization[]
): Promise<{ characterIds: string[]; organizationIds: string[] }> {
  const characterIds: string[] = [];
  const organizationIds: string[] = [];
  
  for (const char of characters) {
    const entity = await createPendingEntity({
      novelId,
      chapterId,
      chapterNumber,
      entityType: 'character',
      name: char.name,
      extractedData: char as Record<string, unknown>,
    });
    characterIds.push(entity.id);
  }
  
  for (const org of organizations) {
    const entity = await createPendingEntity({
      novelId,
      chapterId,
      chapterNumber,
      entityType: 'organization',
      name: org.name,
      extractedData: org as Record<string, unknown>,
    });
    organizationIds.push(entity.id);
  }
  
  return { characterIds, organizationIds };
}

export async function formatPendingEntitiesForContext(
  novelId: string,
  chapterNumber: number
): Promise<string> {
  const { blocked, pendingEntities } = await checkBlockingPendingEntities(novelId, chapterNumber);
  
  if (!blocked) {
    return '';
  }
  
  const lines: string[] = [
    '## Pending Entity Confirmations',
    '',
    'The following entities from previous chapters require human confirmation before proceeding:',
    '',
  ];
  
  const byChapter: Record<number, PendingEntity[]> = {};
  for (const entity of pendingEntities) {
    if (!byChapter[entity.chapterNumber]) {
      byChapter[entity.chapterNumber] = [];
    }
    byChapter[entity.chapterNumber].push(entity);
  }
  
  for (const [chapter, entities] of Object.entries(byChapter)) {
    lines.push(`### Chapter ${chapter}`);
    for (const entity of entities) {
      const typeLabel = entity.entityType === 'character' ? '角色' : '组织';
      lines.push(`- [${typeLabel}] ${entity.name}`);
    }
    lines.push('');
  }
  
  lines.push('**Note**: Next chapter generation is blocked until these entities are confirmed.');
  
  return lines.join('\n');
}
