import { describe, expect, it } from 'vitest';
import {
  resolveJobSchedulingProfile,
  toQueueOptions,
  toSendOptions,
  toWorkerOptions,
} from '@/src/shared/job-scheduling';

describe('job scheduling profiles', () => {
  it('gives chapter generation higher priority than default jobs', () => {
    const chapterProfile = resolveJobSchedulingProfile('CHAPTER_GENERATE');
    const defaultProfile = resolveJobSchedulingProfile('UNKNOWN_JOB');

    expect(chapterProfile.priority).toBeGreaterThan(defaultProfile.priority);
    expect(chapterProfile.expireInSeconds).toBeGreaterThan(defaultProfile.expireInSeconds);
  });

  it('applies pipeline profile with extended retries', () => {
    const pipelineProfile = resolveJobSchedulingProfile('PIPELINE_EXECUTE');

    expect(pipelineProfile.retryLimit).toBe(4);
    expect(pipelineProfile.priority).toBeGreaterThanOrEqual(90);
  });

  it('builds queue/send/worker options from a resolved profile', () => {
    const profile = resolveJobSchedulingProfile('REVIEW_SCORE');
    const queueOptions = toQueueOptions(profile);
    const sendOptions = toSendOptions(profile, { priority: 99 });
    const workerOptions = toWorkerOptions(profile);

    expect(queueOptions.retryLimit).toBe(profile.retryLimit);
    expect(sendOptions.priority).toBe(99);
    expect(workerOptions.priority).toBe(true);
    expect(workerOptions.batchSize).toBe(1);
  });
});
