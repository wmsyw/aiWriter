import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  getCreativeIntentFromWorkflowConfig,
  mergeCreativeIntentIntoWorkflowConfig,
  normalizeCreativeIntent,
  resolveCreativeIntentFromNovel,
  withCreativeIntentField,
} from '@/src/server/services/creative-intent';

describe('creative intent helpers', () => {
  it('normalizes and trims creative intent', () => {
    expect(normalizeCreativeIntent('  保持克制叙事  ')).toBe('保持克制叙事');
    expect(normalizeCreativeIntent('   ')).toBeUndefined();
    expect(normalizeCreativeIntent(undefined)).toBeUndefined();
  });

  it('extracts creative intent from workflow config', () => {
    expect(getCreativeIntentFromWorkflowConfig({ creativeIntent: '群像成长' } as Prisma.JsonValue)).toBe('群像成长');
    expect(getCreativeIntentFromWorkflowConfig({ context: { maxTokens: 1234 } } as Prisma.JsonValue)).toBeUndefined();
  });

  it('merges creative intent into workflow config while preserving existing fields', () => {
    const merged = mergeCreativeIntentIntoWorkflowConfig(
      { context: { maxTokens: 4096 } } as Prisma.JsonValue,
      '强调角色弧光'
    );

    expect(merged).toEqual({
      context: { maxTokens: 4096 },
      creativeIntent: '强调角色弧光',
    });
  });

  it('removes creative intent and returns JsonNull when config becomes empty', () => {
    const merged = mergeCreativeIntentIntoWorkflowConfig(
      { creativeIntent: '旧意图' } as Prisma.JsonValue,
      undefined
    );

    expect(merged).toBe(Prisma.JsonNull);
  });

  it('resolves creative intent with workflow config first, then special requirements', () => {
    expect(resolveCreativeIntentFromNovel({
      workflowConfig: { creativeIntent: '优先剧情驱动' } as Prisma.JsonValue,
      specialRequirements: '备用要求',
    })).toBe('优先剧情驱动');

    expect(resolveCreativeIntentFromNovel({
      workflowConfig: { context: { maxTokens: 1 } } as Prisma.JsonValue,
      specialRequirements: '只写第一人称',
    })).toBe('只写第一人称');
  });

  it('adds creativeIntent field when mapping novel', () => {
    const mapped = withCreativeIntentField({
      id: 'novel-1',
      workflowConfig: { creativeIntent: '慢热推进' } as Prisma.JsonValue,
      specialRequirements: null,
    });

    expect(mapped.creativeIntent).toBe('慢热推进');
  });
});
