import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as agents from '@/src/server/services/agents';

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  templateId: z.string().optional(),
  providerConfigId: z.string().optional(),
  model: z.string().optional(),
  params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
  }).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Always sync built-in templates/agents to ensure new ones are available
  await agents.initializeUserAgents(session.userId);
  
  const list = await agents.listAgents(session.userId);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const agent = await agents.createAgent({
      userId: session.userId,
      name: parsed.data.name,
      description: parsed.data.description,
      templateId: parsed.data.templateId,
      providerConfigId: parsed.data.providerConfigId,
      model: parsed.data.model,
      params: parsed.data.params,
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create agent';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
