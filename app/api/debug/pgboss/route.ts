import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getBoss } from '@/src/server/services/jobs';
import { prisma } from '@/src/server/db';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const boss = await getBoss();
    
    const pgbossJobs = await prisma.$queryRaw`
      SELECT name, state, COUNT(*)::int as count 
      FROM pgboss.job 
      GROUP BY name, state 
      ORDER BY name, state
    `;
    
    const pgbossQueues = await prisma.$queryRaw`
      SELECT name, created_on, updated_on 
      FROM pgboss.queue 
      ORDER BY name
    `;
    
    const recentJobs = await prisma.$queryRaw`
      SELECT id, name, state, created_on, started_on, completed_on, retry_count
      FROM pgboss.job 
      ORDER BY created_on DESC 
      LIMIT 20
    `;

    const appJobs = await prisma.job.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      status: 'ok',
      pgboss: {
        jobsByStateAndType: pgbossJobs,
        queues: pgbossQueues,
        recentJobs,
      },
      appJobs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Debug pgboss error:', error);
    return NextResponse.json({ 
      error: 'Debug query failed',
    }, { status: 500 });
  }
}
