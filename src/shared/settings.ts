export type WebSearchProvider = 'tavily' | 'exa' | 'model';

export interface SettingsProviderConfig {
  id: string;
  defaultModel?: string;
  models?: string[];
}

export interface SettingsPreferences {
  autoSave: boolean;
  wordCount: boolean;
  lineNumbers: boolean;
  defaultWordCount: string;
  writingStyle: string;
  language: string;
  webSearchEnabled: boolean;
  webSearchProvider: WebSearchProvider;
  webSearchApiKey: string;
  defaultProviderId: string;
  defaultModel: string;
}

export const DEFAULT_SETTINGS_PREFERENCES: SettingsPreferences = {
  autoSave: true,
  wordCount: true,
  lineNumbers: false,
  defaultWordCount: '2000',
  writingStyle: 'popular',
  language: 'zh-CN',
  webSearchEnabled: false,
  webSearchProvider: 'model',
  webSearchApiKey: '',
  defaultProviderId: '',
  defaultModel: '',
};

function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function toSafeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function toSafeWebSearchProvider(value: unknown, fallback: WebSearchProvider): WebSearchProvider {
  if (value === 'tavily' || value === 'exa' || value === 'model') {
    return value;
  }
  return fallback;
}

export function normalizeSettingsPreferences(raw: unknown): SettingsPreferences {
  const safe = typeof raw === 'object' && raw !== null
    ? (raw as Record<string, unknown>)
    : {};

  return {
    autoSave: toSafeBoolean(safe.autoSave, DEFAULT_SETTINGS_PREFERENCES.autoSave),
    wordCount: toSafeBoolean(safe.wordCount, DEFAULT_SETTINGS_PREFERENCES.wordCount),
    lineNumbers: toSafeBoolean(safe.lineNumbers, DEFAULT_SETTINGS_PREFERENCES.lineNumbers),
    defaultWordCount: toSafeString(safe.defaultWordCount) || DEFAULT_SETTINGS_PREFERENCES.defaultWordCount,
    writingStyle: toSafeString(safe.writingStyle) || DEFAULT_SETTINGS_PREFERENCES.writingStyle,
    language: toSafeString(safe.language) || DEFAULT_SETTINGS_PREFERENCES.language,
    webSearchEnabled: toSafeBoolean(safe.webSearchEnabled, DEFAULT_SETTINGS_PREFERENCES.webSearchEnabled),
    webSearchProvider: toSafeWebSearchProvider(safe.webSearchProvider, DEFAULT_SETTINGS_PREFERENCES.webSearchProvider),
    webSearchApiKey: toSafeString(safe.webSearchApiKey),
    defaultProviderId: toSafeString(safe.defaultProviderId),
    defaultModel: toSafeString(safe.defaultModel),
  };
}

function getUniqueModels(provider: SettingsProviderConfig | undefined): string[] {
  if (!provider) return [];

  const rawModels = [provider.defaultModel, ...(provider.models || [])]
    .filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    .map((model) => model.trim());

  return [...new Set(rawModels)];
}

export function getProviderModelOptions(
  providers: readonly SettingsProviderConfig[],
  providerId: string
): string[] {
  if (!providerId) return [];
  const provider = providers.find((item) => item.id === providerId);
  return getUniqueModels(provider);
}

export function resolveDefaultModelForProvider(
  providers: readonly SettingsProviderConfig[],
  providerId: string
): string {
  const modelOptions = getProviderModelOptions(providers, providerId);
  return modelOptions[0] || '';
}

export function syncPreferenceProviderModel(
  preferences: SettingsPreferences,
  providers: readonly SettingsProviderConfig[]
): SettingsPreferences {
  if (!preferences.defaultProviderId) {
    if (!preferences.defaultModel) return preferences;
    return { ...preferences, defaultModel: '' };
  }

  const modelOptions = getProviderModelOptions(providers, preferences.defaultProviderId);
  if (modelOptions.length === 0) {
    if (!preferences.defaultModel) return preferences;
    return { ...preferences, defaultModel: '' };
  }

  if (!preferences.defaultModel || !modelOptions.includes(preferences.defaultModel)) {
    return { ...preferences, defaultModel: modelOptions[0] };
  }

  return preferences;
}

export function buildProviderVerifySignature(params: {
  providerId?: string;
  providerType: string;
  baseURL: string;
  defaultModel: string;
  models: string[];
  apiKeyInput: string;
  hasStoredKey: boolean;
}): string {
  const baseModel = params.defaultModel || params.models[0] || '';
  const keyMode = params.apiKeyInput.trim()
    ? 'input'
    : params.hasStoredKey
      ? 'stored'
      : 'missing';

  return JSON.stringify({
    providerId: params.providerId || 'new',
    providerType: params.providerType.trim(),
    baseURL: params.baseURL.trim(),
    model: baseModel.trim(),
    keyMode,
  });
}

export function requiresWebSearchApiKey(provider: WebSearchProvider): boolean {
  return provider !== 'model';
}
