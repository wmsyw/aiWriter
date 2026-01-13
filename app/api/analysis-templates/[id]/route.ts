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

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  aspects: z.array(aspectSchema).min(1).max(20).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = await (prisma as any).analysisTemplate.findFirst({
    where: { id, userId: session.userId },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const data = updateTemplateSchema.parse(body);

    const existing = await (prisma as any).analysisTemplate.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (data.isDefault) {
      await (prisma as any).analysisTemplate.updateMany({
        where: { userId: session.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await (prisma as any).analysisTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await (prisma as any).analysisTemplate.findFirst({
    where: { id, userId: session.userId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await (prisma as any).analysisTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
