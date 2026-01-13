import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const action = searchParams.get('action') || undefined;
  const userId = searchParams.get('userId') || undefined;

  const where = {
    ...(action && { action }),
    ...(userId && { userId }),
  };

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return NextResponse.json({
    events,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
