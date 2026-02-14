import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as agents from '@/src/server/services/agents';

const batchConfigureSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  providerConfigId: z.string().optional(),
  model: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = batchConfigureSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await agents.batchConfigureAgentModel(session.userId, parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Batch configure failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
