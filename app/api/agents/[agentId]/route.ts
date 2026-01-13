import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as agents from '@/src/server/services/agents';

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId } = await params;
  const agent = await agents.getAgent(agentId);
  
  if (!agent || agent.userId !== session.userId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId } = await params;
  const existing = await agents.getAgent(agentId);
  
  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const updated = await agents.updateAgent(agentId, parsed.data);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId } = await params;
  const existing = await agents.getAgent(agentId);
  
  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  try {
    await agents.deleteAgent(agentId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
