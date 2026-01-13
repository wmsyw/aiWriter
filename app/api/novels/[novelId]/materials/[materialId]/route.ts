import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import * as materials from '@/src/server/services/materials';

const updateMaterialSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string; materialId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, materialId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const material = await materials.getMaterial(materialId);
  if (!material || material.novelId !== novelId) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  return NextResponse.json(material);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ novelId: string; materialId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, materialId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const existing = await materials.getMaterial(materialId);
  if (!existing || existing.novelId !== novelId) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateMaterialSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await materials.updateMaterial(materialId, parsed.data as materials.UpdateMaterialInput);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ novelId: string; materialId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, materialId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const existing = await materials.getMaterial(materialId);
  if (!existing || existing.novelId !== novelId) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  await materials.deleteMaterial(materialId);
  return NextResponse.json({ success: true });
}
