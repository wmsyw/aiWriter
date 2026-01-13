import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as agents from '@/src/server/services/agents';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await agents.initializeUserAgents(session.userId);
  return NextResponse.json(result);
}
