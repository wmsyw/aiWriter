import { describe, expect, it } from 'vitest';
import {
  RUNTIME_POLICY_MARKER,
  applyRuntimePromptPolicy,
  buildRuntimeSystemPolicy,
  normalizeAgentRuntimeCategory,
  resolveRuntimePriority,
} from '@/src/shared/agent-runtime-policy';

describe('agent runtime policy', () => {
  it('normalizes category values safely', () => {
    expect(normalizeAgentRuntimeCategory('writing')).toBe('writing');
    expect(normalizeAgentRuntimeCategory('review')).toBe('review');
    expect(normalizeAgentRuntimeCategory('utility')).toBe('utility');
    expect(normalizeAgentRuntimeCategory('unknown')).toBe('default');
  });

  it('injects runtime system policy once', () => {
    const original = [{ role: 'user', content: '请生成大纲' }];
    const withPolicy = applyRuntimePromptPolicy(original, {
      category: 'writing',
      responseFormat: 'json',
      agentName: '大纲生成器',
    });

    expect(withPolicy[0]?.role).toBe('system');
    expect(withPolicy[0]?.content).toContain(RUNTIME_POLICY_MARKER);
    expect(withPolicy).toHaveLength(2);

    const injectedAgain = applyRuntimePromptPolicy(withPolicy, {
      category: 'writing',
      responseFormat: 'json',
    });
    expect(injectedAgain).toHaveLength(2);
  });

  it('adds strict json requirement and raises priority for json responses', () => {
    const policy = buildRuntimeSystemPolicy({
      category: 'review',
      responseFormat: 'json',
    });

    expect(policy).toContain('合法 JSON');
    expect(resolveRuntimePriority({ category: 'review', responseFormat: 'json' })).toBeGreaterThan(
      resolveRuntimePriority({ category: 'review', responseFormat: 'text' })
    );
  });
});
