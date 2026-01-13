import { prisma } from '../db';

export type MaterialType = 'character' | 'location' | 'plotPoint' | 'worldbuilding' | 'custom';
export type MaterialGenre = '男频' | '女频' | '通用';

export interface MaterialData {
  name: string;
  description?: string;
  traits?: string[];
  relationships?: Array<{ targetId: string; type: string; description?: string }>;
  backstory?: string;
  geography?: string;
  culture?: string;
  significance?: string;
  chapter?: number;
  importance?: 'major' | 'minor' | 'foreshadowing';
  resolved?: boolean;
  category?: string;
  rules?: string[];
  [key: string]: unknown;
}

export interface Material {
  id: string;
  novelId: string;
  userId: string;
  type: MaterialType;
  name: string;
  genre: MaterialGenre;
  data: MaterialData;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaterialInput {
  novelId: string;
  userId: string;
  type: MaterialType;
  name: string;
  genre?: MaterialGenre;
  data: MaterialData;
}

export interface UpdateMaterialInput {
  name?: string;
  genre?: MaterialGenre;
  data?: MaterialData;
}

export async function createMaterial(input: CreateMaterialInput): Promise<Material> {
  return prisma.material.create({
    data: {
      novelId: input.novelId,
      userId: input.userId,
      type: input.type,
      name: input.name,
      genre: input.genre || '通用',
      data: input.data as any,
    },
  }) as unknown as Material;
}

export async function getMaterial(id: string): Promise<Material | null> {
  return prisma.material.findUnique({ where: { id } }) as unknown as Material | null;
}

export async function listMaterials(
  novelId: string,
  options?: { type?: MaterialType; genre?: MaterialGenre; search?: string }
): Promise<Material[]> {
  const where: any = { novelId };
  if (options?.type) where.type = options.type;
  if (options?.genre) where.genre = options.genre;
  if (options?.search) where.name = { contains: options.search, mode: 'insensitive' };
  
  return prisma.material.findMany({
    where,
    orderBy: [{ genre: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  }) as unknown as Material[];
}

export async function updateMaterial(id: string, input: UpdateMaterialInput): Promise<Material> {
  const updateData: any = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.genre !== undefined) updateData.genre = input.genre;
  if (input.data !== undefined) updateData.data = input.data;
  
  return prisma.material.update({ where: { id }, data: updateData }) as unknown as Material;
}

export async function deleteMaterial(id: string): Promise<void> {
  await prisma.material.delete({ where: { id } });
}

export async function getMaterialsByType(novelId: string, type: MaterialType): Promise<Material[]> {
  return prisma.material.findMany({
    where: { novelId, type },
    orderBy: { name: 'asc' },
  }) as unknown as Material[];
}

export async function getCharacterGraph(novelId: string): Promise<Array<Material & { relatedTo: Material[] }>> {
  const characters = await prisma.material.findMany({
    where: { novelId, type: 'character' },
  }) as unknown as Material[];
  
  const characterMap = new Map(characters.map(c => [c.id, c]));
  
  return characters.map(char => {
    const data = char.data as MaterialData;
    const relationships = data.relationships || [];
    const relatedTo = relationships
      .map(r => characterMap.get(r.targetId))
      .filter((c): c is Material => c !== undefined);
    return { ...char, relatedTo };
  });
}

export async function buildMaterialContext(novelId: string, types?: MaterialType[]): Promise<string> {
  const materials = await prisma.material.findMany({
    where: { novelId, ...(types ? { type: { in: types } } : {}) },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  }) as unknown as Material[];
  
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
    if (data.traits && data.traits.length > 0) entry += `Traits: ${data.traits.join(', ')}\n`;
    if (data.backstory) entry += `Backstory: ${data.backstory}\n`;
    sections.push(entry);
  }
  
  return sections.join('\n');
}

export async function importMaterials(
  novelId: string,
  userId: string,
  materials: Array<{ type: MaterialType; name: string; data: MaterialData }>
): Promise<number> {
  const created = await prisma.material.createMany({
    data: materials.map(m => ({
      novelId,
      userId,
      type: m.type,
      name: m.name,
      data: m.data as any,
    })),
  });
  return created.count;
}

export async function exportMaterials(novelId: string): Promise<Array<{ type: MaterialType; name: string; data: MaterialData }>> {
  const materials = await prisma.material.findMany({
    where: { novelId },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  }) as unknown as Material[];
  
  return materials.map(m => ({ type: m.type as MaterialType, name: m.name, data: m.data }));
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
  
  return result as unknown as MaterialWithNovel[];
}
