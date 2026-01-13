import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { Prisma } from '@prisma/client';

const stepSchema = z.object({
  agentKey: z.string(),
  order: z.number(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  steps: z.array(stepSchema).min(1).max(10),
});

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.userId },
    include: { steps: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description, steps } = createSchema.parse(body);

    const workflow = await prisma.workflow.create({
      data: {
        userId: session.userId,
        name,
        description,
        steps: {
          create: steps.map(s => ({
            agentKey: s.agentKey,
            order: s.order,
            config: (s.config || null) as Prisma.InputJsonValue,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json({ workflow });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}
