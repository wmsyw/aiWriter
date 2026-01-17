import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob } from '@/src/server/services/jobs';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { novelId, materialName, materialType, currentDescription, currentAttributes } = body;

  if (!novelId || !materialName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const job = await createJob(
    session.userId,
    'MATERIAL_ENHANCE',
    {
      novelId,
      materialName,
      materialType,
      currentDescription,
      currentAttributes,
    }
  );

  return NextResponse.json({ job });
}
