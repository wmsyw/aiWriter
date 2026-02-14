import {
  getJobErrorMessage,
  isTerminalJobStatus,
  parseJobResponse,
  type JobQueueItem,
  type JobQueueStatus,
} from '@/src/shared/jobs';

interface PollJobUntilTerminalOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onStatusChange?: (status: JobQueueStatus, job: JobQueueItem) => void;
  signal?: AbortSignal;
  timeoutMessage?: string;
  failedMessage?: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const handleAbort = () => {
      cleanup();
      reject(new Error('任务轮询已取消'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function pollJobUntilTerminal<T = unknown>(
  jobId: string,
  options: PollJobUntilTerminalOptions = {}
): Promise<T> {
  const {
    intervalMs = 2000,
    maxAttempts = 300,
    onStatusChange,
    signal,
    timeoutMessage = '任务执行超时，请稍后重试',
    failedMessage = '任务执行失败',
  } = options;

  let attempts = 0;
  let lastStatus: JobQueueStatus | null = null;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error('任务轮询已取消');
    }

    attempts += 1;

    const res = await fetch(`/api/jobs/${jobId}`);
    if (res.ok) {
      const payload = await res.json();
      const job = parseJobResponse(payload);

      if (!job) {
        throw new Error('任务数据格式异常');
      }

      if (job.status !== lastStatus) {
        lastStatus = job.status;
        onStatusChange?.(job.status, job);
      }

      if (job.status === 'succeeded') {
        return job.output as T;
      }

      if (isTerminalJobStatus(job.status)) {
        throw new Error(getJobErrorMessage(job, failedMessage));
      }
    }

    if (attempts < maxAttempts) {
      await sleep(intervalMs, signal);
    }
  }

  throw new Error(timeoutMessage);
}

