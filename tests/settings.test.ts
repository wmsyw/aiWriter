import { describe, expect, it } from 'vitest';
import {
  buildProviderVerifySignature,
  normalizeSettingsPreferences,
  resolveDefaultModelForProvider,
  syncPreferenceProviderModel,
} from '@/src/shared/settings';

describe('settings shared helpers', () => {
  const providers = [
    {
      id: 'p1',
      defaultModel: 'gpt-4o',
      models: ['gpt-4o', 'gpt-4.1-mini'],
    },
    {
      id: 'p2',
      defaultModel: 'claude-sonnet-4-5-20250929',
      models: ['claude-sonnet-4-5-20250929'],
    },
  ];

  it('normalizes unsafe preferences payload', () => {
    const normalized = normalizeSettingsPreferences({
      autoSave: 'yes',
      webSearchProvider: 'invalid',
      defaultWordCount: 1000,
    });

    expect(normalized.autoSave).toBe(true);
    expect(normalized.webSearchProvider).toBe('model');
    expect(normalized.defaultWordCount).toBe('1000');
  });

  it('resolves and syncs provider model', () => {
    expect(resolveDefaultModelForProvider(providers, 'p1')).toBe('gpt-4o');

    const synced = syncPreferenceProviderModel(
      {
        autoSave: true,
        wordCount: true,
        lineNumbers: false,
        defaultWordCount: '2000',
        writingStyle: 'popular',
        language: 'zh-CN',
        webSearchEnabled: false,
        webSearchProvider: 'model',
        webSearchApiKey: '',
        defaultProviderId: 'p1',
        defaultModel: 'missing-model',
      },
      providers,
    );

    expect(synced.defaultModel).toBe('gpt-4o');
  });

  it('builds stable verify signature', () => {
    const signature = buildProviderVerifySignature({
      providerId: 'p1',
      providerType: 'openai',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      models: ['gpt-4o'],
      apiKeyInput: '',
      hasStoredKey: true,
    });

    expect(signature).toContain('"providerId":"p1"');
    expect(signature).toContain('"keyMode":"stored"');
  });
});
