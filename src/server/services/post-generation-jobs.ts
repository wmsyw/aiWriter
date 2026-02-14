import { createJob, JobType } from './jobs';

export interface PostGenerationJobResult {
  type: string;
  ok: boolean;
  jobId?: string;
  error?: string;
}

export interface PostGenerationQueueSummary {
  allQueued: boolean;
  queuedTypes: string[];
  failed: Array<{ type: string; error: string }>;
  results: PostGenerationJobResult[];
}

type CreateJobFn = (
  userId: string,
  type: string,
  input: Record<string, unknown>
) => Promise<{ id: string }>;

interface PostGenerationJobSpec {
  type: string;
  input: Record<string, unknown>;
}

export function buildPostGenerationJobSpecs(chapterId: string): PostGenerationJobSpec[] {
  return [
    {
      type: JobType.MEMORY_EXTRACT,
      input: {
        chapterId,
        extractHooks: false,
        extractPendingEntities: false,
        generateSummary: false,
      },
    },
    {
      type: JobType.HOOKS_EXTRACT,
      input: { chapterId },
    },
    {
      type: JobType.PENDING_ENTITY_EXTRACT,
      input: { chapterId },
    },
    {
      type: JobType.CHAPTER_SUMMARY_GENERATE,
      input: { chapterId },
    },
  ];
}

export async function enqueuePostGenerationJobs(
  userId: string,
  chapterId: string,
  createJobFn: CreateJobFn = createJob
): Promise<PostGenerationQueueSummary> {
  const specs = buildPostGenerationJobSpecs(chapterId);

  const settled = await Promise.allSettled(
    specs.map(async (spec) => {
      const job = await createJobFn(userId, spec.type, spec.input);
      return { type: spec.type, jobId: job.id };
    })
  );

  const results: PostGenerationJobResult[] = settled.map((item, index) => {
    const spec = specs[index];
    if (item.status === 'fulfilled') {
      return {
        type: spec.type,
        ok: true,
        jobId: item.value.jobId,
      };
    }
    const error =
      item.reason instanceof Error ? item.reason.message : String(item.reason || 'Unknown error');
    return {
      type: spec.type,
      ok: false,
      error,
    };
  });

  const failed = results
    .filter((item) => !item.ok)
    .map((item) => ({ type: item.type, error: item.error || 'Unknown error' }));

  return {
    allQueued: failed.length === 0,
    queuedTypes: results.filter((item) => item.ok).map((item) => item.type),
    failed,
    results,
  };
}
