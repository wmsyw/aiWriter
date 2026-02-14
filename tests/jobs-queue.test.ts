import { describe, expect, it } from 'vitest';
import {
  countActiveJobs,
  isJobForChapter,
  mergeActiveJobsById,
  mergeJobsById,
  parseJobResponse,
  parseJobsListResponse,
  parseJobsStreamPayload,
} from '@/src/shared/jobs';

describe('jobs shared helpers', () => {
  it('parses list response in object shape', () => {
    const parsed = parseJobsListResponse({
      jobs: [
        {
          id: 'job-1',
          type: 'CHAPTER_GENERATE',
          status: 'queued',
          input: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]?.id).toBe('job-1');
    expect(parsed.hasMore).toBe(false);
  });

  it('parses job from envelope response', () => {
    const job = parseJobResponse({
      job: {
        id: 'job-envelope',
        type: 'OUTLINE_ROUGH',
        status: 'queued',
        input: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(job?.id).toBe('job-envelope');
  });

  it('parses legacy array payload for backward compatibility', () => {
    const parsed = parseJobsListResponse([
      {
        id: 'job-2',
        type: 'OUTLINE_DETAILED',
        status: 'running',
        input: { novelId: 'novel-1' },
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]?.status).toBe('running');
  });

  it('merges sse incremental updates by id and keeps latest shape', () => {
    const base = parseJobsListResponse({
      jobs: [
        {
          id: 'job-1',
          type: 'CHAPTER_GENERATE',
          status: 'running',
          input: {},
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:10.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    }).jobs;

    const streamPayload = parseJobsStreamPayload({
      jobs: [
        {
          id: 'job-1',
          type: 'CHAPTER_GENERATE',
          status: 'succeeded',
          input: {},
          output: { ok: true },
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:20.000Z',
        },
        {
          id: 'job-3',
          type: 'OUTLINE_DETAILED',
          status: 'queued',
          input: {},
          createdAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      isInitial: false,
    });

    expect(streamPayload).not.toBeNull();
    const merged = mergeJobsById(base, streamPayload?.jobs ?? []);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe('job-3');
    expect(merged[1]?.status).toBe('succeeded');
  });

  it('counts active jobs with queued and running statuses', () => {
    const parsed = parseJobsListResponse({
      jobs: [
        {
          id: 'job-1',
          type: 'A',
          status: 'queued',
          input: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'job-2',
          type: 'B',
          status: 'processing',
          input: {},
          createdAt: '2026-01-01T00:00:01.000Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          id: 'job-3',
          type: 'C',
          status: 'failed',
          input: {},
          createdAt: '2026-01-01T00:00:02.000Z',
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(countActiveJobs(parsed.jobs)).toBe(2);
  });

  it('filters chapter jobs and drops terminal jobs after merge', () => {
    const base = parseJobsListResponse({
      jobs: [
        {
          id: 'job-1',
          type: 'CHAPTER_GENERATE',
          status: 'running',
          input: { chapterId: 'chapter-1' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    }).jobs;

    const incoming = parseJobsListResponse({
      jobs: [
        {
          id: 'job-1',
          type: 'CHAPTER_GENERATE',
          status: 'succeeded',
          input: { chapterId: 'chapter-1' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:10.000Z',
        },
        {
          id: 'job-2',
          type: 'REVIEW_SCORE',
          status: 'queued',
          input: { chapterId: 'chapter-1' },
          createdAt: '2026-01-01T00:00:02.000Z',
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    }).jobs;

    const chapterJobs = incoming.filter((job) => isJobForChapter(job, 'chapter-1'));
    const merged = mergeActiveJobsById(base, chapterJobs);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('job-2');
  });
});
