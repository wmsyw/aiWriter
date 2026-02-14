import { describe, expect, it, vi } from 'vitest';
import {
  buildPostGenerationJobSpecs,
  enqueuePostGenerationJobs,
} from '@/src/server/services/post-generation-jobs';

describe('post-generation jobs', () => {
  it('builds expected fan-out job list', () => {
    const specs = buildPostGenerationJobSpecs('chapter-1');
    expect(specs.map((item) => item.type)).toEqual([
      'MEMORY_EXTRACT',
      'HOOKS_EXTRACT',
      'PENDING_ENTITY_EXTRACT',
      'CHAPTER_SUMMARY_GENERATE',
    ]);
    expect(specs[0]?.input).toMatchObject({
      chapterId: 'chapter-1',
      extractHooks: false,
      extractPendingEntities: false,
      generateSummary: false,
    });
  });

  it('returns allQueued=true when every enqueue succeeds', async () => {
    const createJobFn = vi.fn().mockImplementation(async (_userId: string, type: string) => ({
      id: `job-${type}`,
    }));

    const summary = await enqueuePostGenerationJobs('user-1', 'chapter-2', createJobFn);

    expect(summary.allQueued).toBe(true);
    expect(summary.failed).toHaveLength(0);
    expect(summary.queuedTypes).toHaveLength(4);
    expect(createJobFn).toHaveBeenCalledTimes(4);
  });

  it('collects failed jobs when partial enqueue fails', async () => {
    const createJobFn = vi.fn().mockImplementation(async (_userId: string, type: string) => {
      if (type === 'HOOKS_EXTRACT') {
        throw new Error('queue unavailable');
      }
      return { id: `job-${type}` };
    });

    const summary = await enqueuePostGenerationJobs('user-1', 'chapter-3', createJobFn);

    expect(summary.allQueued).toBe(false);
    expect(summary.failed).toEqual([
      { type: 'HOOKS_EXTRACT', error: 'queue unavailable' },
    ]);
    expect(summary.results).toHaveLength(4);
  });
});
