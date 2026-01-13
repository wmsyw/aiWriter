import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import * as materials from '@/src/server/services/materials';

const VALID_MATERIAL_TYPES = ['character', 'location', 'plotPoint', 'worldbuilding', 'custom'] as const;

const createMaterialSchema = z.object({
  type: z.enum(VALID_MATERIAL_TYPES),
  name: z.string().min(1).max(200),
  data: z.record(z.string(), z.unknown()),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const url = new URL(req.url);
  const typeParam = url.searchParams.get('type');
  
  if (typeParam && !VALID_MATERIAL_TYPES.includes(typeParam as typeof VALID_MATERIAL_TYPES[number])) {
    return NextResponse.json({ 
      error: `无效的素材类型。有效类型: ${VALID_MATERIAL_TYPES.join(', ')}` 
    }, { status: 400 });
  }
  
  const type = typeParam as materials.MaterialType | null;
  const search = url.searchParams.get('search') || undefined;

  const list = await materials.listMaterials(novelId, { type: type || undefined, search });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ novelId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const body = await req.json();
  const parsed = createMaterialSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const material = await materials.createMaterial({
    novelId,
    userId: session.userId,
    type: parsed.data.type,
    name: parsed.data.name,
    data: parsed.data.data as materials.MaterialData,
  });

  return NextResponse.json(material, { status: 201 });
}
