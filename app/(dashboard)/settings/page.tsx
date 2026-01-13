'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

type ProviderConfig = {
  id: string;
  name: string;
  providerType: string;
  baseURL: string;
  defaultModel?: string;
  createdAt: string;
};

type Tab = 'providers' | 'account' | 'preferences';

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', defaultURL: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'claude', label: 'Claude', defaultURL: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'] },
  { value: 'gemini', label: 'Gemini', defaultURL: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-1.5-pro'] },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    providerType: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    defaultModel: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [preferences, setPreferences] = useState({
    autoSave: true,
    wordCount: true,
    lineNumbers: false,
    defaultWordCount: '2000',
    writingStyle: 'popular',
    language: 'zh-CN',
    webSearchEnabled: false,
    webSearchProvider: 'model' as 'tavily' | 'exa' | 'model',
    webSearchApiKey: '',
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const savePreferences = useCallback(async (prefs: typeof preferences) => {
    try {
      await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
    } catch (err) {
      console.error('Failed to save preferences', err);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    const loadPreferences = async () => {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          setPreferences(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load preferences', err);
      } finally {
        setPreferencesLoaded(true);
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    saveTimerRef.current = setTimeout(() => {
      savePreferences(preferences);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [preferences, preferencesLoaded, savePreferences]);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      setProviders(data.configs || []);
    } catch (err) {
      console.error('Failed to fetch providers', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderTypeChange = (type: string) => {
    const provider = PROVIDER_TYPES.find(p => p.value === type);
    setFormData(prev => ({
      ...prev,
      providerType: type,
      baseURL: provider?.defaultURL || '',
      defaultModel: provider?.models[0] || '',
    }));
  };

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      providerType: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      defaultModel: 'gpt-4o',
    });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      providerType: provider.providerType,
      baseURL: provider.baseURL,
      apiKey: '',
      defaultModel: provider.defaultModel || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const method = editingProvider ? 'PUT' : 'POST';
      const url = editingProvider ? `/api/providers/${editingProvider.id}` : '/api/providers';
      
      const body: Record<string, string> = {
        name: formData.name,
        providerType: formData.providerType,
        baseURL: formData.baseURL,
        defaultModel: formData.defaultModel,
      };
      
      if (formData.apiKey) {
        body.apiKey = formData.apiKey;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMessage = typeof data.error === 'string' 
          ? data.error 
          : data.details?.formErrors?.join(', ') || data.error?.formErrors?.join(', ') || '保存失败';
        throw new Error(errorMessage);
      }

      await fetchProviders();
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个服务商配置吗?')) return;
    
    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      await fetchProviders();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('新密码至少需要8个字符');
      return;
    }

    setChangingPassword(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMessage = typeof data.error === 'string' 
          ? data.error 
          : data.error?.formErrors?.join(', ') || '修改密码失败';
        throw new Error(errorMessage);
      }

      setPasswordSuccess('密码修改成功');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setChangingPassword(false);
    }
  };

  const tabs: { id: Tab; name: string; icon: React.ReactNode }[] = [
    {
      id: 'providers',
      name: 'AI 服务商',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'account',
      name: '账号安全',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      id: 'preferences',
      name: '偏好设置',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
<div className="flex gap-2" role="tablist" aria-label="设置选项">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.name}
          </button>
        ))}
      </div>

{activeTab === 'providers' && (
        <div id="panel-providers" role="tabpanel" aria-labelledby="tab-providers" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-white">AI 服务商配置</h2>
              <p className="text-gray-400 text-sm mt-1">配置 OpenAI、Claude、Gemini 等 AI 服务的 API 密钥</p>
            </div>
            <button onClick={openCreateModal} className="btn-primary px-4 py-2 rounded-xl flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加服务商
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : providers.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">尚未配置服务商</h3>
              <p className="text-gray-400 mb-6">添加 AI 服务商配置以开始使用智能写作功能</p>
              <button onClick={openCreateModal} className="btn-primary px-6 py-2 rounded-xl">
                添加第一个服务商
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {providers.map((provider) => {
                const providerInfo = PROVIDER_TYPES.find(p => p.value === provider.providerType);
                return (
                  <div
                    key={provider.id}
                    className="glass-card rounded-2xl p-6 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          provider.providerType === 'openai' ? 'bg-green-500/20 text-green-400' :
                          provider.providerType === 'claude' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              provider.providerType === 'openai' ? 'bg-green-500/20 text-green-400' :
                              provider.providerType === 'claude' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {providerInfo?.label || provider.providerType}
                            </span>
                            {provider.defaultModel && (
                              <span className="text-gray-400 text-sm">{provider.defaultModel}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(provider)}
                          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(provider.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className="font-mono text-xs">{provider.baseURL}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

{activeTab === 'account' && (
        <div id="panel-account" role="tabpanel" aria-labelledby="tab-account" className="max-w-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">账号安全</h2>
            <p className="text-gray-400 text-sm mt-1">修改密码和账号安全设置</p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">修改密码</h3>
            
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">当前密码</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">新密码</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">确认新密码</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl"
                  required
                />
              </div>

              {passwordError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  {passwordSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={changingPassword}
                className="btn-primary px-6 py-2 rounded-xl disabled:opacity-50"
              >
                {changingPassword ? '保存中...' : '修改密码'}
              </button>
            </form>
          </div>
        </div>
      )}

{activeTab === 'preferences' && (
        <div id="panel-preferences" role="tabpanel" aria-labelledby="tab-preferences" className="max-w-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">偏好设置</h2>
            <p className="text-gray-400 text-sm mt-1">自定义编辑器和界面设置</p>
          </div>

          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">编辑器设置</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">自动保存</div>
                    <div className="text-gray-400 text-sm">每隔一段时间自动保存章节内容</div>
                  </div>
                  <button 
                    onClick={() => setPreferences(p => ({ ...p, autoSave: !p.autoSave }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${preferences.autoSave ? 'bg-indigo-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${preferences.autoSave ? 'right-1' : 'left-1'}`}></span>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">字数统计</div>
                    <div className="text-gray-400 text-sm">在编辑器底部显示字数统计</div>
                  </div>
                  <button 
                    onClick={() => setPreferences(p => ({ ...p, wordCount: !p.wordCount }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${preferences.wordCount ? 'bg-indigo-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${preferences.wordCount ? 'right-1' : 'left-1'}`}></span>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">行号显示</div>
                    <div className="text-gray-400 text-sm">在编辑器左侧显示行号</div>
                  </div>
                  <button 
                    onClick={() => setPreferences(p => ({ ...p, lineNumbers: !p.lineNumbers }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${preferences.lineNumbers ? 'bg-indigo-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${preferences.lineNumbers ? 'right-1' : 'left-1'}`}></span>
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">AI 写作设置</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">默认生成字数</label>
                  <select 
                    value={preferences.defaultWordCount}
                    onChange={(e) => setPreferences(p => ({ ...p, defaultWordCount: e.target.value }))}
                    className="w-full glass-input px-4 py-3 rounded-xl"
                  >
                    <option value="500">约 500 字</option>
                    <option value="1000">约 1000 字</option>
                    <option value="2000">约 2000 字</option>
                    <option value="3000">约 3000 字</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">写作风格</label>
                  <select 
                    value={preferences.writingStyle}
                    onChange={(e) => setPreferences(p => ({ ...p, writingStyle: e.target.value }))}
                    className="w-full glass-input px-4 py-3 rounded-xl"
                  >
                    <option value="literary">文学性</option>
                    <option value="popular">通俗易懂</option>
                    <option value="humorous">幽默诙谐</option>
                    <option value="serious">严肃正式</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">网络搜索</h3>
              <p className="text-gray-400 text-sm mb-4">启用后，AI 在生成涉及专业知识、时事热点、价格、历史事件等内容时会自动联网搜索参考资料</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">启用网络搜索</div>
                    <div className="text-gray-400 text-sm">允许 AI 在写作时联网查询信息</div>
                  </div>
                  <button 
                    onClick={() => setPreferences(p => ({ ...p, webSearchEnabled: !p.webSearchEnabled }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${preferences.webSearchEnabled ? 'bg-indigo-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${preferences.webSearchEnabled ? 'right-1' : 'left-1'}`}></span>
                  </button>
                </div>
                
                {preferences.webSearchEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">搜索服务商</label>
                      <select 
                        value={preferences.webSearchProvider}
                        onChange={(e) => setPreferences(p => ({ ...p, webSearchProvider: e.target.value as 'tavily' | 'exa' | 'model' }))}
                        className="w-full glass-input px-4 py-3 rounded-xl"
                      >
                        <option value="model">模型内置搜索 (推荐)</option>
                        <option value="tavily">Tavily</option>
                        <option value="exa">Exa AI</option>
                      </select>
                      {preferences.webSearchProvider === 'model' && (
                        <p className="text-xs text-gray-500 mt-2">使用 AI 模型自带的联网搜索功能，无需额外配置 API 密钥</p>
                      )}
                    </div>
                    {preferences.webSearchProvider !== 'model' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          搜索 API 密钥
                          <a 
                            href={preferences.webSearchProvider === 'tavily' ? 'https://tavily.com' : 'https://exa.ai'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="ml-2 text-indigo-400 hover:text-indigo-300 text-xs"
                          >
                            获取密钥 →
                          </a>
                        </label>
                        <input
                          type="password"
                          value={preferences.webSearchApiKey}
                          onChange={(e) => setPreferences(p => ({ ...p, webSearchApiKey: e.target.value }))}
                          className="w-full glass-input px-4 py-3 rounded-xl font-mono text-sm"
                          placeholder={preferences.webSearchProvider === 'tavily' ? 'tvly-...' : 'exa-...'}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">界面设置</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">界面语言</label>
                  <select 
                    value={preferences.language}
                    onChange={(e) => setPreferences(p => ({ ...p, language: e.target.value }))}
                    className="w-full glass-input px-4 py-3 rounded-xl"
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁體中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

{showModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="provider-modal-title"
        >
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 id="provider-modal-title" className="text-xl font-bold text-white">
                {editingProvider ? '编辑服务商' : '添加服务商'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="关闭对话框"
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">配置名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl"
                  placeholder="例如: 我的 OpenAI"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">服务商类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDER_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleProviderTypeChange(type.value)}
                      className={`px-4 py-3 rounded-xl border transition-all ${
                        formData.providerType === type.value
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">API 地址</label>
                <input
                  type="url"
                  value={formData.baseURL}
                  onChange={(e) => setFormData(prev => ({ ...prev, baseURL: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API 密钥 {editingProvider && <span className="text-gray-500">(留空则不修改)</span>}
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl font-mono"
                  placeholder="sk-..."
                  required={!editingProvider}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">默认模型</label>
                <select
                  value={formData.defaultModel}
                  onChange={(e) => setFormData(prev => ({ ...prev, defaultModel: e.target.value }))}
                  className="w-full glass-input px-4 py-3 rounded-xl"
                >
                  {PROVIDER_TYPES.find(p => p.value === formData.providerType)?.models.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-secondary px-4 py-2 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 btn-primary px-4 py-2 rounded-xl disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
