import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/src/server/auth/session';
import { prisma } from '@/src/server/db';

const aspectSchema = z.object({
  key: z.string().max(50),
  label: z.string().max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  aspects: z.array(aspectSchema).min(1).max(20),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await (prisma as any).analysisTemplate.findMany({
    where: { userId: session.userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = createTemplateSchema.parse(body);

    if (data.isDefault) {
      await (prisma as any).analysisTemplate.updateMany({
        where: { userId: session.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await (prisma as any).analysisTemplate.create({
      data: {
        userId: session.userId,
        name: data.name,
        description: data.description,
        aspects: data.aspects,
        isDefault: data.isDefault || false,
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
