import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

const reorderSchema = z.object({
  order: z.array(z.object({
    id: z.string(),
    order: z.number().int().min(0),
  })),
});

export async function PUT(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { order } = reorderSchema.parse(body);

    await prisma.$transaction(
      order.map(item => 
        prisma.promptTemplate.updateMany({
          where: { id: item.id, userId: session.userId },
          data: { order: item.order },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to reorder templates' }, { status: 500 });
  }
}
