import { NextResponse } from 'next/server';
import { prisma } from '@/src/server/db';
import { getBoss } from '@/src/server/services/jobs';

export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    queue: { status: 'ok' | 'error' | 'unavailable'; running?: boolean };
    pipelines?: { 
      status: 'ok' | 'degraded'; 
      recentFailures?: number;
      recentSuccesses?: number;
    };
  };
}

export async function GET() {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'ok' },
      queue: { status: 'unavailable' },
    },
  };

  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = { 
      status: 'ok', 
      latencyMs: Date.now() - dbStart 
    };
  } catch (error) {
    health.checks.database = { 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
    health.status = 'unhealthy';
  }

  try {
    await getBoss();
    health.checks.queue = { status: 'ok', running: true };
  } catch {
    health.checks.queue = { status: 'error', running: false };
    if (health.status === 'healthy') {
      health.status = 'degraded';
    }
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const [recentExecutions] = await Promise.all([
      prisma.pipelineExecution.groupBy({
        by: ['status'],
        where: {
          startedAt: { gte: fiveMinutesAgo },
        },
        _count: true,
      }),
    ]);
    
    const recentFailures = recentExecutions.find(e => e.status === 'failed')?._count ?? 0;
    const recentSuccesses = recentExecutions.find(e => e.status === 'completed')?._count ?? 0;
    
    const failureRate = recentSuccesses + recentFailures > 0 
      ? recentFailures / (recentSuccesses + recentFailures) 
      : 0;
    
    health.checks.pipelines = {
      status: failureRate > 0.5 ? 'degraded' : 'ok',
      recentFailures,
      recentSuccesses,
    };
    
    if (failureRate > 0.5 && health.status === 'healthy') {
      health.status = 'degraded';
    }
  } catch {
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  return NextResponse.json(health, { status: statusCode });
}
