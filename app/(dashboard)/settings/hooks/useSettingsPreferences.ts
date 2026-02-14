'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  DEFAULT_SETTINGS_PREFERENCES,
  normalizeSettingsPreferences,
  syncPreferenceProviderModel,
  type SettingsPreferences,
  type SettingsProviderConfig,
} from '@/src/shared/settings';
import type { PreferencesSaveState } from '../types';

interface UseSettingsPreferencesResult {
  preferences: SettingsPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<SettingsPreferences>>;
  preferencesLoaded: boolean;
  preferencesSaveState: PreferencesSaveState;
  preferencesSaveMessage: string;
}

export function useSettingsPreferences(
  providers: readonly SettingsProviderConfig[]
): UseSettingsPreferencesResult {
  const [preferences, setPreferences] = useState<SettingsPreferences>(DEFAULT_SETTINGS_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesSaveState, setPreferencesSaveState] = useState<PreferencesSaveState>('idle');
  const [preferencesSaveMessage, setPreferencesSaveMessage] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savePreferences = useCallback(async (nextPreferences: SettingsPreferences) => {
    setPreferencesSaveState('saving');
    setPreferencesSaveMessage('正在保存偏好...');
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPreferences),
      });
      if (!res.ok) {
        throw new Error(`保存失败: ${res.status}`);
      }
      setPreferencesSaveState('saved');
      setPreferencesSaveMessage('偏好已自动保存');
      return true;
    } catch (err) {
      console.error('Failed to save preferences', err);
      setPreferencesSaveState('error');
      setPreferencesSaveMessage('偏好保存失败，请稍后重试');
      return false;
    }
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          setPreferences(normalizeSettingsPreferences(data));
        }
      } catch (err) {
        console.error('Failed to load preferences', err);
      } finally {
        setPreferencesLoaded(true);
      }
    };

    void loadPreferences();
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void savePreferences(preferences);
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [preferences, preferencesLoaded, savePreferences]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    setPreferences((prev) => syncPreferenceProviderModel(prev, providers));
  }, [providers, preferencesLoaded]);

  useEffect(() => {
    if (saveStateTimerRef.current) {
      clearTimeout(saveStateTimerRef.current);
    }

    if (preferencesSaveState === 'saved') {
      saveStateTimerRef.current = setTimeout(() => {
        setPreferencesSaveState('idle');
        setPreferencesSaveMessage('');
      }, 1800);
    }

    return () => {
      if (saveStateTimerRef.current) {
        clearTimeout(saveStateTimerRef.current);
      }
    };
  }, [preferencesSaveState]);

  return {
    preferences,
    setPreferences,
    preferencesLoaded,
    preferencesSaveState,
    preferencesSaveMessage,
  };
}
