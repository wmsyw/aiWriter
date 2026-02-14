import { describe, it, expect } from 'vitest';
import {
  applyProviderCapabilitiesToRequest,
  getProviderCapabilities,
  type NormalizedRequest,
} from '@/src/server/adapters/providers';

describe('Provider Capability Guard', () => {
  it('should disable tools and model web search for claude request', () => {
    const request: NormalizedRequest = {
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'lookup docs',
            parameters: {
              type: 'object',
              properties: { q: { type: 'string', description: 'query' } },
              required: ['q'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
      webSearch: true,
    };

    const guarded = applyProviderCapabilitiesToRequest('claude', request);

    expect(guarded.request.tools).toBeUndefined();
    expect(guarded.request.tool_choice).toBe('none');
    expect(guarded.request.webSearch).toBe(false);
    expect(guarded.warnings).toContain('tools_disabled_for_provider_or_model');
    expect(guarded.warnings).toContain('model_web_search_disabled_for_provider_or_model');
  });

  it('should keep tools and web search for supported openai model', () => {
    const request: NormalizedRequest = {
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'test' }],
      webSearch: true,
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'lookup docs',
            parameters: {
              type: 'object',
              properties: { q: { type: 'string', description: 'query' } },
            },
          },
        },
      ],
      tool_choice: 'auto',
    };

    const guarded = applyProviderCapabilitiesToRequest('openai', request);

    expect(guarded.request.tools).toHaveLength(1);
    expect(guarded.request.tool_choice).toBe('auto');
    expect(guarded.request.webSearch).toBe(true);
    expect(guarded.warnings).toHaveLength(0);
  });

  it('should disable model web search for custom provider by default', () => {
    const request: NormalizedRequest = {
      model: 'custom-model',
      messages: [{ role: 'user', content: 'test' }],
      webSearch: true,
    };

    const guarded = applyProviderCapabilitiesToRequest('custom', request);

    expect(guarded.request.webSearch).toBe(false);
    expect(guarded.warnings).toContain('model_web_search_disabled_for_provider_or_model');
  });

  it('should expose gemini capability profile', () => {
    const caps = getProviderCapabilities('gemini', 'gemini-3-flash-preview');
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsFunctionCalling).toBe(true);
    expect(caps.supportsModelWebSearch).toBe(true);
    expect(caps.supportsEmbeddings).toBe(true);
  });
});
