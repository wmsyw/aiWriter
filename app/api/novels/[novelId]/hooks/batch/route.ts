import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { batchApplyHookAction } from '@/src/server/services/hooks';

const batchSchema = z
  .object({
    hookIds: z.array(z.string().min(1)).min(1).max(300),
    action: z.enum(['reference', 'resolve', 'abandon', 'delete']),
    chapterNumber: z.number().int().positive().optional(),
    context: z.string().optional(),
    reason: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if ((input.action === 'reference' || input.action === 'resolve') && !input.chapterNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'chapterNumber is required for reference/resolve actions',
        path: ['chapterNumber'],
      });
    }
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { novelId } = await params;

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
      select: { id: true },
    });
    if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

    const body = await request.json();
    const data = batchSchema.parse(body);

    const result = await batchApplyHookAction(novelId, data.hookIds, {
      action: data.action,
      chapterNumber: data.chapterNumber,
      context: data.context,
      reason: data.reason,
    });

    return NextResponse.json({
      updatedCount: result.updatedCount,
      hooks: result.updatedHooks,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process hook batch action' }, { status: 500 });
  }
}
