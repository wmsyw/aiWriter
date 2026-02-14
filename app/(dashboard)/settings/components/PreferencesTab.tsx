'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/app/components/ui/Card';
import { Select } from '@/app/components/ui/Select';
import { Input } from '@/app/components/ui/Input';
import {
  getProviderModelOptions,
  resolveDefaultModelForProvider,
  requiresWebSearchApiKey,
  type SettingsPreferences,
  type WebSearchProvider,
} from '@/src/shared/settings';
import type { PreferencesSaveState, ProviderConfig } from '../types';

const NO_PROVIDER_VALUE = '__none__';

interface PreferencesTabProps {
  providers: ProviderConfig[];
  preferences: SettingsPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<SettingsPreferences>>;
  preferencesSaveState: PreferencesSaveState;
  preferencesSaveMessage: string;
}

function SettingsToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/10'}`}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
}

export function PreferencesTab({
  providers,
  preferences,
  setPreferences,
  preferencesSaveState,
  preferencesSaveMessage,
}: PreferencesTabProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 focus:outline-none">
      <div className="space-y-1 text-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">偏好设置</h2>
        <p className="text-gray-400">自定义编辑器和界面设置</p>
        {preferencesSaveState !== 'idle' && (
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              preferencesSaveState === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : preferencesSaveState === 'saving'
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                preferencesSaveState === 'error'
                  ? 'bg-red-300'
                  : preferencesSaveState === 'saving'
                    ? 'bg-blue-300 animate-pulse'
                    : 'bg-emerald-300'
              }`}
            />
            {preferencesSaveMessage}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>编辑器设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">自动保存</div>
              <div className="text-gray-400 text-sm">每隔一段时间自动保存章节内容</div>
            </div>
            <SettingsToggle
              checked={preferences.autoSave}
              onChange={() => setPreferences((prev) => ({ ...prev, autoSave: !prev.autoSave }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">字数统计</div>
              <div className="text-gray-400 text-sm">在编辑器底部显示字数统计</div>
            </div>
            <SettingsToggle
              checked={preferences.wordCount}
              onChange={() => setPreferences((prev) => ({ ...prev, wordCount: !prev.wordCount }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">行号显示</div>
              <div className="text-gray-400 text-sm">在编辑器左侧显示行号</div>
            </div>
            <SettingsToggle
              checked={preferences.lineNumbers}
              onChange={() => setPreferences((prev) => ({ ...prev, lineNumbers: !prev.lineNumbers }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 写作设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Select
            label="默认生成字数"
            value={preferences.defaultWordCount}
            onChange={(val) => setPreferences((prev) => ({ ...prev, defaultWordCount: val }))}
            options={[
              { value: '500', label: '约 500 字' },
              { value: '1000', label: '约 1000 字' },
              { value: '2000', label: '约 2000 字' },
              { value: '3000', label: '约 3000 字' },
            ]}
          />
          <Select
            label="写作风格"
            value={preferences.writingStyle}
            onChange={(val) => setPreferences((prev) => ({ ...prev, writingStyle: val }))}
            options={[
              { value: 'literary', label: '文学性' },
              { value: 'popular', label: '通俗易懂' },
              { value: 'humorous', label: '幽默诙谐' },
              { value: 'serious', label: '严肃正式' },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>全局默认模型</CardTitle>
          <CardDescription>当 AI 助手未指定模型时，将使用此默认模型</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="默认服务商"
            value={preferences.defaultProviderId || NO_PROVIDER_VALUE}
            onChange={(val) => {
              if (val === NO_PROVIDER_VALUE) {
                setPreferences((prev) => ({ ...prev, defaultProviderId: '', defaultModel: '' }));
                return;
              }
              setPreferences((prev) => ({
                ...prev,
                defaultProviderId: val,
                defaultModel: resolveDefaultModelForProvider(providers, val),
              }));
            }}
            options={[
              { value: NO_PROVIDER_VALUE, label: '未设置' },
              ...providers.map((provider) => ({ value: provider.id, label: provider.name })),
            ]}
          />
          {preferences.defaultProviderId && (
            <Select
              label="默认模型"
              value={preferences.defaultModel}
              onChange={(val) => setPreferences((prev) => ({ ...prev, defaultModel: val }))}
              options={getProviderModelOptions(providers, preferences.defaultProviderId).map((model) => ({ value: model, label: model }))}
            />
          )}
          {!preferences.defaultProviderId && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
              请先选择服务商，然后选择默认模型
            </div>
          )}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <strong>模型优先级说明：</strong>
                <ul className="mt-1 space-y-0.5 list-disc list-inside text-blue-300/80">
                  <li>AI 助手配置的模型优先级最高</li>
                  <li>如果 AI 助手未指定模型，使用此全局默认模型</li>
                  <li>如果 AI 助手指定了其他服务商，将使用该服务商的默认模型</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>网络搜索</CardTitle>
          <CardDescription>启用后，AI 在生成涉及专业知识、时事热点等内容时会自动联网搜索</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">启用网络搜索</div>
              <div className="text-gray-400 text-sm">允许 AI 在写作时联网查询信息</div>
            </div>
            <SettingsToggle
              checked={preferences.webSearchEnabled}
              onChange={() => setPreferences((prev) => ({ ...prev, webSearchEnabled: !prev.webSearchEnabled }))}
            />
          </div>

          <AnimatePresence>
            {preferences.webSearchEnabled && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-6 overflow-hidden"
              >
                <Select
                  label="搜索服务商"
                  value={preferences.webSearchProvider}
                  onChange={(val) => setPreferences((prev) => ({ ...prev, webSearchProvider: val as WebSearchProvider }))}
                  options={[
                    { value: 'model', label: '模型内置搜索 (推荐)' },
                    { value: 'tavily', label: 'Tavily' },
                    { value: 'exa', label: 'Exa AI' },
                  ]}
                />

                {!requiresWebSearchApiKey(preferences.webSearchProvider) ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                    使用 AI 模型自带的联网搜索功能，无需额外配置 API 密钥
                  </div>
                ) : (
                  <Input
                    type="password"
                    label="搜索 API 密钥"
                    helperText={preferences.webSearchProvider === 'tavily' ? '在 tavily.com 获取密钥' : '在 exa.ai 获取密钥'}
                    value={preferences.webSearchApiKey}
                    onChange={(e) => setPreferences((prev) => ({ ...prev, webSearchApiKey: e.target.value }))}
                    placeholder={preferences.webSearchProvider === 'tavily' ? 'tvly-...' : 'exa-...'}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>界面设置</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            label="界面语言"
            value={preferences.language}
            onChange={(val) => setPreferences((prev) => ({ ...prev, language: val }))}
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'zh-TW', label: '繁體中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
