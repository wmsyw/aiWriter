import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser, auditRequest } from '@/src/server/middleware/audit';
import { encryptApiKey } from '@/src/server/crypto';
import { AuditActions } from '@/src/server/services/audit';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  providerType: z.enum(['openai', 'claude', 'gemini']).optional(),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  defaultModel: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const config = await prisma.providerConfig.findFirst({
    where: { id, userId: session.userId },
    select: {
      id: true,
      name: true,
      providerType: true,
      baseURL: true,
      defaultModel: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!config) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
  }

  return NextResponse.json(config);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.providerConfig.findFirst({
    where: { id, userId: session.userId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '验证失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.providerType !== undefined) updateData.providerType = parsed.data.providerType;
  if (parsed.data.baseURL !== undefined) updateData.baseURL = parsed.data.baseURL;
  if (parsed.data.defaultModel !== undefined) updateData.defaultModel = parsed.data.defaultModel;
  if (parsed.data.apiKey) {
    updateData.apiKeyCiphertext = encryptApiKey(parsed.data.apiKey);
  }

  const updated = await prisma.providerConfig.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      providerType: true,
      baseURL: true,
      defaultModel: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await auditRequest(req, AuditActions.PROVIDER_UPDATE, 'provider_config', {
    resourceId: id,
    metadata: { name: updated.name },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.providerConfig.findFirst({
    where: { id, userId: session.userId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
  }

  await prisma.providerConfig.delete({ where: { id } });

  await auditRequest(req, AuditActions.PROVIDER_DELETE, 'provider_config', {
    resourceId: id,
    metadata: { name: existing.name },
  });

  return NextResponse.json({ success: true });
}
