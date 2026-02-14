export type WizardPhase =
  | 'idle'
  | 'preparing'
  | 'queued'
  | 'generating'
  | 'parsing'
  | 'saving'
  | 'complete'
  | 'error';

export const WIZARD_PHASE_PROGRESS: Record<WizardPhase, number> = {
  idle: 0,
  preparing: 8,
  queued: 20,
  generating: 58,
  parsing: 76,
  saving: 90,
  complete: 100,
  error: 100,
};

export const WIZARD_PHASE_LABEL: Record<WizardPhase, string> = {
  idle: '待开始',
  preparing: '准备中',
  queued: '排队中',
  generating: '生成中',
  parsing: '解析中',
  saving: '保存中',
  complete: '已完成',
  error: '失败',
};

export function mapJobStatusToWizardPhase(status?: string | null): WizardPhase | null {
  if (!status) return null;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return null;

  if (['queued', 'waiting', 'scheduled', 'pending'].includes(normalized)) {
    return 'queued';
  }
  if (['running', 'active', 'processing'].includes(normalized)) {
    return 'generating';
  }
  if (['succeeded', 'success', 'completed'].includes(normalized)) {
    return 'parsing';
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) {
    return 'error';
  }
  return null;
}

type WizardTransitionEvent =
  | { type: 'prepare' }
  | { type: 'job-status'; status?: string | null }
  | { type: 'parsing' }
  | { type: 'saving' }
  | { type: 'complete' }
  | { type: 'error' }
  | { type: 'reset' };

export function transitionWizardPhase(current: WizardPhase, event: WizardTransitionEvent): WizardPhase {
  switch (event.type) {
    case 'prepare':
      return 'preparing';
    case 'job-status':
      return mapJobStatusToWizardPhase(event.status) || current;
    case 'parsing':
      return 'parsing';
    case 'saving':
      return 'saving';
    case 'complete':
      return 'complete';
    case 'error':
      return 'error';
    case 'reset':
      return 'idle';
    default:
      return current;
  }
}
