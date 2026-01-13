import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as templates from '@/src/server/services/templates';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
  })).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const list = await templates.listTemplates(session.userId);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const template = await templates.createTemplate({
      userId: session.userId,
      name: parsed.data.name,
      content: parsed.data.content,
      variables: parsed.data.variables,
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
