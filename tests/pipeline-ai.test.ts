import { describe, expect, it } from 'vitest';
import { resolvePipelineModel } from '@/src/server/services/pipeline-ai';

describe('pipeline ai model resolver', () => {
  it('prioritizes request model', () => {
    const model = resolvePipelineModel({
      requestModel: 'gpt-4.1',
      preferredModel: 'gpt-4o',
      providerDefaultModel: 'gpt-4o-mini',
      providerModels: ['gpt-4o-mini'],
    });

    expect(model).toBe('gpt-4.1');
  });

  it('uses preferred model when provider supports it', () => {
    const model = resolvePipelineModel({
      preferredModel: 'gpt-4o',
      providerDefaultModel: 'gpt-4o-mini',
      providerModels: ['gpt-4o', 'gpt-4o-mini'],
    });

    expect(model).toBe('gpt-4o');
  });

  it('falls back to provider default when preferred model is unavailable', () => {
    const model = resolvePipelineModel({
      preferredModel: 'gpt-4o',
      providerDefaultModel: 'claude-sonnet',
      providerModels: ['claude-sonnet', 'claude-haiku'],
    });

    expect(model).toBe('claude-sonnet');
  });

  it('falls back to first provider model and final hard default', () => {
    const withProviderModels = resolvePipelineModel({
      providerModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    });
    expect(withProviderModels).toBe('gemini-2.5-flash');

    const withNone = resolvePipelineModel({});
    expect(withNone).toBe('gpt-4o');
  });
});
