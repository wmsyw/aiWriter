import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import {
  getHook,
  referenceHook,
  resolveHook,
  abandonHook,
  updateHookMetadata,
} from '@/src/server/services/hooks';

const updateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reference'),
    chapterNumber: z.number().int().positive(),
    context: z.string().optional(),
  }),
  z.object({
    action: z.literal('resolve'),
    chapterNumber: z.number().int().positive(),
    context: z.string().optional(),
  }),
  z.object({
    action: z.literal('abandon'),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('update_meta'),
    type: z.enum(['foreshadowing', 'chekhov_gun', 'mystery', 'promise', 'setup']).optional(),
    description: z.string().min(1).optional(),
    plantedInChapter: z.number().int().positive().optional(),
    plantedContext: z.string().nullable().optional(),
    importance: z.enum(['critical', 'major', 'minor']).optional(),
    expectedResolutionBy: z.number().int().positive().nullable().optional(),
    reminderThreshold: z.number().int().positive().max(200).optional(),
    relatedCharacters: z.array(z.string().trim().min(1)).max(30).optional(),
    relatedOrganizations: z.array(z.string().trim().min(1)).max(30).optional(),
    notes: z.string().nullable().optional(),
  }),
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ novelId: string; hookId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, hookId } = await params;

  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId: session.userId },
  });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const hook = await getHook(hookId);
  if (!hook || hook.novelId !== novelId) {
    return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
  }

  return NextResponse.json({ hook });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string; hookId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId, hookId } = await params;

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const hook = await getHook(hookId);
    if (!hook || hook.novelId !== novelId) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    switch (data.action) {
      case 'reference':
        await referenceHook(hookId, data.chapterNumber, data.context);
        break;
      case 'resolve':
        await resolveHook(hookId, data.chapterNumber, data.context);
        break;
      case 'abandon':
        await abandonHook(hookId, data.reason);
        break;
      case 'update_meta':
        await updateHookMetadata(hookId, {
          type: data.type,
          description: data.description,
          plantedInChapter: data.plantedInChapter,
          plantedContext: data.plantedContext,
          importance: data.importance,
          expectedResolutionBy: data.expectedResolutionBy,
          reminderThreshold: data.reminderThreshold,
          relatedCharacters: data.relatedCharacters,
          relatedOrganizations: data.relatedOrganizations,
          notes: data.notes,
        });
        break;
    }

    const updatedHook = await getHook(hookId);
    return NextResponse.json({ hook: updatedHook });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update hook' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ novelId: string; hookId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId, hookId } = await params;

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const hook = await prisma.narrativeHook.findUnique({ where: { id: hookId } });
    if (!hook || hook.novelId !== novelId) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    await prisma.narrativeHook.delete({ where: { id: hookId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete hook' }, { status: 500 });
  }
}
