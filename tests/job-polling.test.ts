import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollJobUntilTerminal } from '@/app/lib/jobs/polling';

function buildJobResponse(
  status: string,
  overrides: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({
      job: {
        id: 'job-1',
        type: 'OUTLINE_ROUGH',
        status,
        input: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
      },
    }),
    { status: 200 }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pollJobUntilTerminal', () => {
  it('resolves output when job succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildJobResponse('queued'))
      .mockResolvedValueOnce(buildJobResponse('running'))
      .mockResolvedValueOnce(
        buildJobResponse('succeeded', { output: { ok: true, score: 9 } })
      );

    vi.stubGlobal('fetch', fetchMock);

    const statuses: string[] = [];
    const output = await pollJobUntilTerminal<{ ok: boolean; score: number }>('job-1', {
      intervalMs: 1,
      maxAttempts: 10,
      onStatusChange: (status) => statuses.push(status),
    });

    expect(output).toEqual({ ok: true, score: 9 });
    expect(statuses).toEqual(['queued', 'running', 'succeeded']);
  });

  it('throws job error when terminal status is failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildJobResponse('failed', { error: '模型调用失败' })
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      pollJobUntilTerminal('job-1', {
        intervalMs: 1,
        maxAttempts: 10,
        failedMessage: '默认失败信息',
      })
    ).rejects.toThrow('模型调用失败');
  });

  it('throws timeout when max attempts reached', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => buildJobResponse('running'));

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      pollJobUntilTerminal('job-1', {
        intervalMs: 1,
        maxAttempts: 2,
        timeoutMessage: '轮询超时',
      })
    ).rejects.toThrow('轮询超时');
  });
});
