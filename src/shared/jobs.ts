export const JOB_QUEUE_ACTIVE_STATUSES = ['queued', 'running', 'processing'] as const;
export const JOB_QUEUE_TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'] as const;
export const JOB_QUEUE_STATUSES = [
  ...JOB_QUEUE_ACTIVE_STATUSES,
  ...JOB_QUEUE_TERMINAL_STATUSES,
] as const;

export type JobQueueStatus = (typeof JOB_QUEUE_STATUSES)[number];

export interface JobQueueItem {
  id: string;
  type: string;
  status: JobQueueStatus;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobsListResponse {
  jobs: JobQueueItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface JobsStreamPayload {
  jobs: JobQueueItem[];
  isInitial: boolean;
}

const DEFAULT_LIST_RESPONSE: JobsListResponse = {
  jobs: [],
  nextCursor: null,
  hasMore: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

export function isJobQueueStatus(value: unknown): value is JobQueueStatus {
  return (
    typeof value === 'string' &&
    (JOB_QUEUE_STATUSES as readonly string[]).includes(value)
  );
}

export function parseJobQueueItem(payload: unknown): JobQueueItem | null {
  if (!isRecord(payload)) {
    return null;
  }

  const id = typeof payload.id === 'string' ? payload.id : null;
  const type = typeof payload.type === 'string' ? payload.type : null;
  const status = payload.status;
  const input = isRecord(payload.input) ? payload.input : {};
  const createdAt = toIsoString(payload.createdAt);
  const updatedAt = toIsoString(payload.updatedAt);

  if (!id || !type || !isJobQueueStatus(status) || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    type,
    status,
    input,
    output: payload.output,
    error: typeof payload.error === 'string' ? payload.error : null,
    createdAt,
    updatedAt,
  };
}

export function parseJobResponse(payload: unknown): JobQueueItem | null {
  if (isRecord(payload) && 'job' in payload) {
    return parseJobQueueItem(payload.job);
  }

  return parseJobQueueItem(payload);
}

export function getJobErrorMessage(
  job: Pick<JobQueueItem, 'error'>,
  fallback = '任务执行失败'
): string {
  if (typeof job.error === 'string' && job.error.trim().length > 0) {
    return job.error;
  }

  return fallback;
}

export function parseJobsListResponse(payload: unknown): JobsListResponse {
  if (Array.isArray(payload)) {
    const jobs = payload
      .map((item) => parseJobQueueItem(item))
      .filter((item): item is JobQueueItem => item !== null);

    return {
      jobs: sortJobsByCreatedAtDesc(jobs),
      nextCursor: null,
      hasMore: false,
    };
  }

  if (!isRecord(payload)) {
    return DEFAULT_LIST_RESPONSE;
  }

  const jobsPayload = Array.isArray(payload.jobs) ? payload.jobs : [];
  const jobs = jobsPayload
    .map((item) => parseJobQueueItem(item))
    .filter((item): item is JobQueueItem => item !== null);

  const nextCursor =
    typeof payload.nextCursor === 'string' ? payload.nextCursor : null;
  const hasMore =
    typeof payload.hasMore === 'boolean' ? payload.hasMore : nextCursor !== null;

  return {
    jobs: sortJobsByCreatedAtDesc(jobs),
    nextCursor,
    hasMore,
  };
}

export function parseJobsStreamPayload(payload: unknown): JobsStreamPayload | null {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    return null;
  }

  const jobs = payload.jobs
    .map((item) => parseJobQueueItem(item))
    .filter((item): item is JobQueueItem => item !== null);

  return {
    jobs: sortJobsByCreatedAtDesc(jobs),
    isInitial: payload.isInitial === true,
  };
}

function toTimeMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function sortJobsByCreatedAtDesc(jobs: JobQueueItem[]): JobQueueItem[] {
  return [...jobs].sort((a, b) => {
    const createdDiff = toTimeMs(b.createdAt) - toTimeMs(a.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const updatedDiff = toTimeMs(b.updatedAt) - toTimeMs(a.updatedAt);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return b.id.localeCompare(a.id);
  });
}

export function mergeJobsById(
  existingJobs: JobQueueItem[],
  incomingJobs: JobQueueItem[]
): JobQueueItem[] {
  if (incomingJobs.length === 0) {
    return existingJobs;
  }

  const jobsById = new Map(existingJobs.map((job) => [job.id, job]));
  for (const job of incomingJobs) {
    jobsById.set(job.id, job);
  }

  return sortJobsByCreatedAtDesc(Array.from(jobsById.values()));
}

export function isActiveJobStatus(status: JobQueueStatus): boolean {
  return (JOB_QUEUE_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function countActiveJobs(jobs: JobQueueItem[]): number {
  return jobs.filter((job) => isActiveJobStatus(job.status)).length;
}

export function isTerminalJobStatus(status: JobQueueStatus): boolean {
  return (JOB_QUEUE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isJobForChapter(job: Pick<JobQueueItem, 'input'>, chapterId: string): boolean {
  return typeof job.input.chapterId === 'string' && job.input.chapterId === chapterId;
}

export function mergeActiveJobsById(
  existingJobs: JobQueueItem[],
  incomingJobs: JobQueueItem[]
): JobQueueItem[] {
  const merged = mergeJobsById(existingJobs, incomingJobs);
  return merged.filter((job) => !isTerminalJobStatus(job.status));
}
