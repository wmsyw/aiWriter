import { AutoRecoveryOrchestrator } from '../../src/server/orchestrator/self-healing.js';
import { getObservabilityDashboard } from '../../src/server/orchestrator/observability.js';
import { workerLogger } from '../../src/core/logger.js';

const log = workerLogger.child({ processor: 'pipeline' });

const VALID_PIPELINE_TYPES = ['novel-setup', 'outline', 'chapter', 'review', 'finalize'];

let orchestratorInstance = null;

function getOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = new AutoRecoveryOrchestrator();
  }
  return orchestratorInstance;
}

export async function handlePipelineExecute(prisma, job, { jobId, userId, input }) {
  const { pipelineType, novelId, chapterId, config, pipelineInput, executionId } = input;

  if (!pipelineType || !VALID_PIPELINE_TYPES.includes(pipelineType)) {
    throw new Error(`Invalid pipeline type: ${pipelineType}`);
  }

  if (!novelId) {
    throw new Error('novelId is required');
  }

  const orchestrator = getOrchestrator();
  const dashboard = getObservabilityDashboard();

  log.info('Starting pipeline execution with auto-recovery', {
    pipelineType,
    novelId,
    chapterId,
    jobId,
    executionId,
  });

  const healthStatus = orchestrator.getHealthStatus();
  const pipelineHealth = healthStatus.get(pipelineType);
  if (pipelineHealth && !pipelineHealth.healthy) {
    log.warn('Pipeline health check failed', {
      pipelineType,
      failureCount: pipelineHealth.failureCount,
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'running' },
  });

  const pipelineInputData = {
    novelId,
    userId,
    chapterId,
    executionId,
    config: {
      ...config,
      enableCheckpoints: true,
    },
    input: pipelineInput,
  };

  const result = await orchestrator.executeWithAutoRecovery(
    pipelineType,
    pipelineInputData
  );

  if (result.recovered) {
    log.info('Pipeline recovered from failure', {
      pipelineType,
      novelId,
      jobId,
    });
  }

  const jobUpdate = {
    status: result.success ? 'succeeded' : 'failed',
    output: result.success ? result.output : null,
    error: result.error || null,
    updatedAt: new Date(),
  };

  await prisma.job.update({
    where: { id: jobId },
    data: jobUpdate,
  });

  log.info('Job status synced with pipeline result', {
    jobId,
    status: jobUpdate.status,
    executionId: result.executionId || executionId,
  });

  if (result.success) {
    dashboard.recordEvent({
      type: 'pipeline:completed',
      executionId: result.executionId || executionId,
      pipelineType,
      timestamp: new Date(),
      data: { recovered: result.recovered },
    });
  } else {
    dashboard.recordEvent({
      type: 'pipeline:failed',
      executionId: result.executionId || executionId,
      pipelineType,
      timestamp: new Date(),
      data: { error: result.error, recovered: result.recovered },
    });
  }

  return {
    success: result.success,
    output: result.output,
    error: result.error,
    recovered: result.recovered,
    executionId: result.executionId || executionId,
  };
}
