import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getHook, referenceHook, resolveHook, abandonHook } from '@/src/server/services/hooks';

const updateSchema = z.object({
  action: z.enum(['reference', 'resolve', 'abandon']),
  chapterNumber: z.number().int().positive().optional(),
  context: z.string().optional(),
  reason: z.string().optional(),
});

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
        if (!data.chapterNumber) {
          return NextResponse.json({ error: 'chapterNumber is required for reference action' }, { status: 400 });
        }
        await referenceHook(hookId, data.chapterNumber, data.context);
        break;
      case 'resolve':
        if (!data.chapterNumber) {
          return NextResponse.json({ error: 'chapterNumber is required for resolve action' }, { status: 400 });
        }
        await resolveHook(hookId, data.chapterNumber, data.context);
        break;
      case 'abandon':
        await abandonHook(hookId, data.reason);
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
