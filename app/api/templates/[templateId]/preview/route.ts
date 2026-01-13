import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as templates from '@/src/server/services/templates';

const previewSchema = z.object({
  context: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;
  const template = await templates.getTemplate(templateId);
  
  if (!template || template.userId !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const rendered = templates.renderTemplateString(template.content, parsed.data.context);
    return NextResponse.json({ rendered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
