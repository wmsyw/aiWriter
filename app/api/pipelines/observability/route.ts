import { NextRequest } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { getObservabilityDashboard, type PipelineType } from '@/src/server/orchestrator';

const VALID_PIPELINE_TYPES: PipelineType[] = [
  'novel-setup',
  'outline',
  'chapter',
  'review',
  'finalize',
];

function isValidPipelineType(type: string): type is PipelineType {
  return VALID_PIPELINE_TYPES.includes(type as PipelineType);
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get('action') ?? 'health';
  const pipelineType = searchParams.get('pipelineType');
  const timeWindow = parseInt(searchParams.get('timeWindow') ?? '60', 10);

  const dashboard = getObservabilityDashboard();

  switch (action) {
    case 'health': {
      if (pipelineType && isValidPipelineType(pipelineType)) {
        const health = await dashboard.getHealthStatus(pipelineType);
        return Response.json(health);
      }
      
      const allHealth = await dashboard.getAllPipelinesHealth();
      const result: Record<string, unknown> = {};
      for (const [type, health] of allHealth) {
        result[type] = health;
      }
      return Response.json(result);
    }

    case 'metrics': {
      if (!pipelineType || !isValidPipelineType(pipelineType)) {
        return Response.json(
          { error: 'pipelineType is required and must be valid' },
          { status: 400 }
        );
      }

      const metrics = await dashboard.getAggregatedMetrics(pipelineType, timeWindow);
      return Response.json({
        ...metrics,
        errorBreakdown: Object.fromEntries(metrics.errorBreakdown),
        stagePerformance: Object.fromEntries(metrics.stagePerformance),
      });
    }

    case 'execution': {
      const executionId = searchParams.get('executionId');
      if (!executionId) {
        return Response.json({ error: 'executionId is required' }, { status: 400 });
      }

      const execution = await dashboard.getExecutionMetrics(executionId);
      if (!execution) {
        return Response.json({ error: 'Execution not found' }, { status: 404 });
      }

      return Response.json(execution);
    }

    case 'activity': {
      const limit = parseInt(searchParams.get('limit') ?? '20', 10);
      const activity = await dashboard.getRecentActivity(Math.min(limit, 100));
      return Response.json({ events: activity });
    }

    default:
      return Response.json(
        { error: 'Invalid action. Must be: health, metrics, execution, or activity' },
        { status: 400 }
      );
  }
}
