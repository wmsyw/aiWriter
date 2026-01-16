import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { 
  getPendingEntity, 
  reviewPendingEntity, 
  approveAndCreateMaterial,
  findMatchSuggestions 
} from '@/src/server/services/pending-entities';

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'merge']),
  mergeWithMaterialId: z.string().optional(),
  reviewNotes: z.string().optional(),
  createMaterial: z.boolean().optional().default(false),
  overrideData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; entityId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, entityId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const entity = await getPendingEntity(entityId);
  if (!entity || entity.novelId !== novelId) {
    return NextResponse.json({ error: 'Pending entity not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const includeSuggestions = searchParams.get('includeSuggestions') === 'true';

  if (includeSuggestions) {
    const suggestions = await findMatchSuggestions(novelId, session.userId, entityId);
    return NextResponse.json({ entity, suggestions });
  }

  return NextResponse.json({ entity });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; entityId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId, entityId } = await params;

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const entity = await getPendingEntity(entityId);
    if (!entity || entity.novelId !== novelId) {
      return NextResponse.json({ error: 'Pending entity not found' }, { status: 404 });
    }

    if (entity.status !== 'pending') {
      return NextResponse.json({ error: 'Entity already reviewed' }, { status: 400 });
    }

    const body = await request.json();
    const data = reviewSchema.parse(body);

    if (data.action === 'approve' && data.createMaterial) {
      const result = await approveAndCreateMaterial(entityId, session.userId, data.overrideData);
      return NextResponse.json({ 
        entity: result.pendingEntity, 
        materialId: result.materialId,
        message: 'Entity approved and material created' 
      });
    }

    if (data.action === 'merge' && !data.mergeWithMaterialId) {
      return NextResponse.json({ error: 'mergeWithMaterialId is required for merge action' }, { status: 400 });
    }

    const updated = await reviewPendingEntity({
      id: entityId,
      action: data.action,
      mergeWithMaterialId: data.mergeWithMaterialId,
      reviewNotes: data.reviewNotes,
    });

    return NextResponse.json({ entity: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to review entity' }, { status: 500 });
  }
}
