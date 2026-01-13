import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as templates from '@/src/server/services/templates';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
  })).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;
  const template = await templates.getTemplate(templateId);
  
  if (!template || template.userId !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;
  const existing = await templates.getTemplate(templateId);
  
  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const updated = await templates.updateTemplate(templateId, parsed.data);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;
  const existing = await templates.getTemplate(templateId);
  
  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await templates.deleteTemplate(templateId);
  return NextResponse.json({ success: true });
}
