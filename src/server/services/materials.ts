import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';

export type MaterialType = 'character' | 'location' | 'plotPoint' | 'worldbuilding' | 'custom';
export type MaterialGenre = '男频' | '女频' | '通用';

const RelationshipSchema = z.object({
  targetId: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export const MaterialDataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  traits: z.array(z.string()).optional(),
  relationships: z.array(RelationshipSchema).optional(),
  backstory: z.string().optional(),
  geography: z.string().optional(),
  culture: z.string().optional(),
  significance: z.string().optional(),
  chapter: z.number().optional(),
  importance: z.enum(['major', 'minor', 'foreshadowing']).optional(),
  resolved: z.boolean().optional(),
  category: z.string().optional(),
  rules: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type MaterialData = z.infer<typeof MaterialDataSchema>;

function parseMaterialData(data: Prisma.JsonValue | null): MaterialData {
  if (!data || typeof data !== 'object') {
    return { name: '' };
  }
  const result = MaterialDataSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const rawData = data as Record<string, unknown>;
  return {
    ...rawData,
    name: typeof rawData.name === 'string' ? rawData.name : '',
  } as MaterialData;
}

export interface Material {
  id: string;
  novelId: string;
  userId: string;
  type: MaterialType;
  name: string;
  genre: MaterialGenre;
  searchGroup?: string | null;
  sourceUrl?: string | null;
  data: MaterialData;
  createdAt: Date;
  updatedAt: Date;
}

type PrismaMaterial = Awaited<ReturnType<typeof prisma.material.findFirst>>;

function toMaterial(m: NonNullable<PrismaMaterial>): Material {
  return {
    id: m.id,
    novelId: m.novelId,
    userId: m.userId,
    type: m.type as MaterialType,
    name: m.name,
    genre: m.genre as MaterialGenre,
    searchGroup: m.searchGroup,
    sourceUrl: m.sourceUrl,
    data: parseMaterialData(m.data),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export interface CreateMaterialInput {
  novelId: string;
  userId: string;
  type: MaterialType;
  name: string;
  genre?: MaterialGenre;
  searchGroup?: string | null;
  sourceUrl?: string | null;
  data: MaterialData;
}

export interface UpdateMaterialInput {
  name?: string;
  genre?: MaterialGenre;
  searchGroup?: string | null;
  sourceUrl?: string | null;
  data?: MaterialData;
}

export async function createMaterial(input: CreateMaterialInput): Promise<Material> {
  const material = await prisma.material.create({
    data: {
      novelId: input.novelId,
      userId: input.userId,
      type: input.type,
      name: input.name,
      genre: input.genre || '通用',
      searchGroup: input.searchGroup || null,
      sourceUrl: input.sourceUrl || null,
      data: input.data as Prisma.InputJsonValue,
    },
  });
  return toMaterial(material);
}

export async function getMaterial(id: string, userId: string): Promise<Material | null> {
  const material = await prisma.material.findFirst({ 
    where: { 
      id,
      novel: { userId }
    } 
  });
  return material ? toMaterial(material) : null;
}

export async function listMaterials(
  novelId: string,
  userId: string,
  options?: { type?: MaterialType; genre?: MaterialGenre; search?: string }
): Promise<Material[]> {
  const where: Prisma.MaterialWhereInput = { 
    novelId,
    novel: { userId }
  };
  if (options?.type) where.type = options.type;
  if (options?.genre) where.genre = options.genre;
  if (options?.search) where.name = { contains: options.search, mode: 'insensitive' };
  
  const materials = await prisma.material.findMany({
    where,
    orderBy: [{ genre: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  });
  return materials.map(toMaterial);
}

export async function updateMaterial(id: string, userId: string, input: UpdateMaterialInput): Promise<Material> {
  // First verify ownership
  const existing = await getMaterial(id, userId);
  if (!existing) {
    throw new Error('Material not found or access denied');
  }
  
  const updateData: Prisma.MaterialUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.genre !== undefined) updateData.genre = input.genre;
  if (input.searchGroup !== undefined) updateData.searchGroup = input.searchGroup;
  if (input.sourceUrl !== undefined) updateData.sourceUrl = input.sourceUrl;
  if (input.data !== undefined) updateData.data = input.data as Prisma.InputJsonValue;
  
  const updated = await prisma.material.update({ where: { id }, data: updateData });
  return toMaterial(updated);
}

export async function deleteMaterial(id: string, userId: string): Promise<void> {
  // First verify ownership
  const existing = await getMaterial(id, userId);
  if (!existing) {
    throw new Error('Material not found or access denied');
  }
  
  await prisma.material.delete({ where: { id } });
}

export async function getMaterialsByType(novelId: string, userId: string, type: MaterialType): Promise<Material[]> {
  const materials = await prisma.material.findMany({
    where: { 
      novelId, 
      type,
      novel: { userId }
    },
    orderBy: { name: 'asc' },
  });
  return materials.map(toMaterial);
}

export async function getCharacterGraph(novelId: string, userId: string): Promise<Array<Material & { relatedTo: Material[] }>> {
  const rawCharacters = await prisma.material.findMany({
    where: { 
      novelId, 
      type: 'character',
      novel: { userId }
    },
  });
  const characters = rawCharacters.map(toMaterial);
  
  const characterMap = new Map(characters.map(c => [c.id, c]));
  
  return characters.map(char => {
    const relationships = char.data.relationships || [];
    const relatedTo = relationships
      .map(r => characterMap.get(r.targetId))
      .filter((c): c is Material => c !== undefined);
    return { ...char, relatedTo };
  });
}

export async function buildMaterialContext(
  novelId: string, 
  userId: string, 
  types?: MaterialType[],
  options?: { limit?: number; prioritizeRecent?: boolean }
): Promise<string> {
  const limit = options?.limit || 50;
  
  const rawMaterials = await prisma.material.findMany({
    where: { 
      novelId, 
      novel: { userId },
      ...(types ? { type: { in: types } } : {}) 
    },
    orderBy: options?.prioritizeRecent 
      ? [{ lastActiveChapter: 'desc' }, { codexPriority: 'desc' }, { name: 'asc' }]
      : [{ codexPriority: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    take: limit,
  });
  const materials = rawMaterials.map(toMaterial);
  
  const sections: string[] = [];
  let currentType = '';
  
  for (const material of materials) {
    if (material.type !== currentType) {
      currentType = material.type;
      sections.push(`\n## ${currentType.charAt(0).toUpperCase() + currentType.slice(1)}s\n`);
    }
    
    const data = material.data;
    let entry = `### ${material.name}\n`;
    if (data.description) entry += `${data.description}\n`;
    if (data.attributes && typeof data.attributes === 'object') {
      const attributes = Object.entries(data.attributes)
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .map(([key, value]) => `${key}: ${value}`);
      if (attributes.length > 0) entry += `Attributes: ${attributes.join('；')}\n`;
    }
    if (data.traits && data.traits.length > 0) entry += `Traits: ${data.traits.join(', ')}\n`;
    if (data.backstory) entry += `Backstory: ${data.backstory}\n`;
    if (data.importance) entry += `Importance: ${data.importance}\n`;
    sections.push(entry);
  }
  
  return sections.join('\n');
}

export async function importMaterials(
  novelId: string,
  userId: string,
  materials: Array<{ type: MaterialType; name: string; data: MaterialData }>
): Promise<number> {
  // Verify novel ownership before importing
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    select: { id: true }
  });
  if (!novel) {
    throw new Error('Novel not found or access denied');
  }
  
  const created = await prisma.material.createMany({
    data: materials.map(m => ({
      novelId,
      userId,
      type: m.type,
      name: m.name,
      data: m.data as Prisma.InputJsonValue,
    })),
  });
  return created.count;
}

export async function exportMaterials(novelId: string, userId: string): Promise<Array<{ type: MaterialType; name: string; data: MaterialData }>> {
  const rawMaterials = await prisma.material.findMany({
    where: { 
      novelId,
      novel: { userId }
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  const materials = rawMaterials.map(toMaterial);
  
  return materials.map(m => ({ type: m.type, name: m.name, data: m.data }));
}

export interface MaterialWithNovel extends Material {
  novel: { id: string; title: string };
}

export async function listAllMaterials(
  userId: string,
  options?: { type?: MaterialType; genre?: MaterialGenre; search?: string }
): Promise<MaterialWithNovel[]> {
  const where: Record<string, unknown> = { userId };
  if (options?.type) where.type = options.type;
  if (options?.genre) where.genre = options.genre;
  if (options?.search) where.name = { contains: options.search, mode: 'insensitive' };
  
  const result = await prisma.material.findMany({
    where,
    include: {
      novel: {
        select: { id: true, title: true },
      },
    },
    orderBy: [{ genre: 'asc' }, { novelId: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  });
  
  return result.map(m => ({
    ...toMaterial(m),
    novel: m.novel,
  }));
}
