import { describe, expect, it } from 'vitest';
import { resolveContinuityGateConfig } from '@/src/shared/continuity-gate-config';

describe('continuity gate config helpers', () => {
  it('resolves defaults when workflow config is empty', () => {
    const config = resolveContinuityGateConfig({});

    expect(config.enabled).toBe(true);
    expect(config.passScore).toBe(6.8);
    expect(config.rejectScore).toBe(4.9);
    expect(config.maxRepairAttempts).toBe(1);
  });

  it('clamps and parses custom workflow config values', () => {
    const config = resolveContinuityGateConfig({
      review: { passThreshold: '9.8' },
      continuityGate: {
        enabled: false,
        passScore: 10,
        rejectScore: '9.9',
        maxRepairAttempts: '3.2',
      },
    });

    expect(config.enabled).toBe(false);
    expect(config.passScore).toBe(9.5);
    expect(config.rejectScore).toBe(9.1);
    expect(config.maxRepairAttempts).toBe(3);
  });
});
