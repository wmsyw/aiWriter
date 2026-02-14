import { describe, it, expect } from 'vitest';
import { mapJobStatusToWizardPhase, transitionWizardPhase } from '@/src/shared/wizard-phase';

describe('Wizard Phase Flow', () => {
  it('should map job statuses to wizard phases', () => {
    expect(mapJobStatusToWizardPhase('queued')).toBe('queued');
    expect(mapJobStatusToWizardPhase('running')).toBe('generating');
    expect(mapJobStatusToWizardPhase('succeeded')).toBe('parsing');
    expect(mapJobStatusToWizardPhase('failed')).toBe('error');
    expect(mapJobStatusToWizardPhase('unknown')).toBeNull();
  });

  it('should transition phase through a standard generation lifecycle', () => {
    let phase = transitionWizardPhase('idle', { type: 'prepare' });
    expect(phase).toBe('preparing');

    phase = transitionWizardPhase(phase, { type: 'job-status', status: 'queued' });
    expect(phase).toBe('queued');

    phase = transitionWizardPhase(phase, { type: 'job-status', status: 'running' });
    expect(phase).toBe('generating');

    phase = transitionWizardPhase(phase, { type: 'job-status', status: 'succeeded' });
    expect(phase).toBe('parsing');

    phase = transitionWizardPhase(phase, { type: 'saving' });
    expect(phase).toBe('saving');

    phase = transitionWizardPhase(phase, { type: 'complete' });
    expect(phase).toBe('complete');
  });

  it('should keep current phase for unrecognized job status and reset to idle', () => {
    let phase = transitionWizardPhase('generating', { type: 'job-status', status: 'mystery' });
    expect(phase).toBe('generating');

    phase = transitionWizardPhase(phase, { type: 'reset' });
    expect(phase).toBe('idle');
  });
});
