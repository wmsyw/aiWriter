import type { SettingsPreferences } from '@/src/shared/settings';
import type React from 'react';

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsFunctionCalling: boolean;
  supportsModelWebSearch: boolean;
  supportsVision: boolean;
  supportsEmbeddings: boolean;
  supportsImageGen: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: string;
  baseURL: string;
  defaultModel?: string;
  models?: string[];
  createdAt: string;
  updatedAt: string;
  capabilities?: ProviderCapabilities;
}

export type SettingsTab = 'providers' | 'account' | 'preferences';

export type PreferencesSaveState = 'idle' | 'saving' | 'saved' | 'error';

export type SettingsPreferencesUpdater = React.Dispatch<React.SetStateAction<SettingsPreferences>>;
