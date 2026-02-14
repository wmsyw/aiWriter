'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  staggerContainer, 
  staggerItem, 
  fadeIn, 
  slideUp 
} from '@/app/lib/animations';

import { Button } from '@/app/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/Tabs';
import { Badge } from '@/app/components/ui/Badge';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { Select } from '@/app/components/ui/Select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/app/components/ui/Dialog';

type ProviderConfig = {
  id: string;
  name: string;
  providerType: string;
  baseURL: string;
  defaultModel?: string;
  models?: string[];
  createdAt: string;
  updatedAt: string;
  capabilities?: {
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsFunctionCalling: boolean;
    supportsModelWebSearch: boolean;
    supportsVision: boolean;
    supportsEmbeddings: boolean;
    supportsImageGen: boolean;
  };
};

type Tab = 'providers' | 'account' | 'preferences';

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', defaultURL: 'https://api.openai.com/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'claude', label: 'Claude', defaultURL: 'https://api.anthropic.com/v1', defaultModels: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-haiku-4-5-20251001'] },
  { value: 'gemini', label: 'Gemini', defaultURL: 'https://generativelanguage.googleapis.com/v1beta', defaultModels: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  { value: 'custom', label: '自定义', defaultURL: '', defaultModels: [] },
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
    models: [] as string[],
    newModel: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{
    message?: string;
    latency?: number;
    error?: string;
    model?: string;
    capabilities?: ProviderConfig['capabilities'];
  } | null>(null);
  const [lastVerifiedSignature, setLastVerifiedSignature] = useState<string | null>(null);

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
    defaultProviderId: '',
    defaultModel: '',
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentVerifySignature = JSON.stringify({
    providerId: editingProvider?.id || 'new',
    providerType: formData.providerType.trim(),
    baseURL: formData.baseURL.trim(),
    model: (formData.defaultModel || formData.models[0] || '').trim(),
    keyMode: formData.apiKey.trim() ? 'input' : (editingProvider ? 'stored' : 'missing'),
  });
  const isVerificationStale = !!lastVerifiedSignature && lastVerifiedSignature !== currentVerifySignature;

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
      defaultModel: provider?.defaultModels[0] || '',
      models: provider?.defaultModels || [],
      newModel: '',
    }));
  };

  const openCreateModal = () => {
    setEditingProvider(null);
    const defaultProvider = PROVIDER_TYPES[0];
    setFormData({
      name: '',
      providerType: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      defaultModel: 'gpt-4o',
      models: defaultProvider.defaultModels,
      newModel: '',
    });
    setError('');
    setTestStatus('idle');
    setTestResult(null);
    setLastVerifiedSignature(null);
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
      models: provider.models || [],
      newModel: '',
    });
    setError('');
    setTestStatus('idle');
    setTestResult(null);
    setLastVerifiedSignature(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.defaultModel) {
      setError('请选择默认模型');
      return;
    }
    if (formData.models.length === 0) {
      setError('请至少添加一个模型');
      return;
    }
    if (isVerificationStale) {
      setError('配置已变更，请重新测试连接后再保存');
      return;
    }
    
    setSaving(true);
    setError('');

    try {
      const method = editingProvider ? 'PUT' : 'POST';
      const url = editingProvider ? `/api/providers/${editingProvider.id}` : '/api/providers';

      const body: Record<string, unknown> = {
        name: formData.name,
        providerType: formData.providerType,
        baseURL: formData.baseURL,
        defaultModel: formData.defaultModel,
        models: formData.models,
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

  const handleTestConnection = async () => {
    const apiKey = formData.apiKey.trim();
    if (!apiKey && !editingProvider) {
      setError('请先填写 API 密钥');
      return;
    }

    setTestStatus('testing');
    setTestResult(null);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        providerType: formData.providerType,
        baseURL: formData.baseURL,
        model: formData.defaultModel || formData.models[0],
      };

      if (editingProvider?.id) {
        payload.providerId = editingProvider.id;
      }

      if (apiKey) {
        payload.apiKey = apiKey;
      }

      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setTestStatus('success');
        setTestResult({
          message: data.message,
          latency: data.latency,
          model: data.model,
          capabilities: data.capabilities,
        });
        setLastVerifiedSignature(currentVerifySignature);
      } else {
        setTestStatus('error');
        setTestResult({ error: data.error });
        setLastVerifiedSignature(null);
      }
    } catch (err) {
      setTestStatus('error');
      setTestResult({ error: err instanceof Error ? err.message : '连接测试失败' });
      setLastVerifiedSignature(null);
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
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
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );

  const capabilityBadges = (capabilities?: ProviderConfig['capabilities']) => {
    if (!capabilities) return null;
    const tags = [
      capabilities.supportsFunctionCalling ? '函数调用' : null,
      capabilities.supportsModelWebSearch ? '模型联网' : null,
      capabilities.supportsVision ? '视觉' : null,
      capabilities.supportsEmbeddings ? 'Embedding' : null,
      capabilities.supportsImageGen ? '图像生成' : null,
    ].filter(Boolean) as string[];
    if (tags.length === 0) {
      return <span className="text-[11px] text-gray-500">无高级能力</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  };

  return (
    <motion.div 
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList variant="pills" className="bg-black/20 p-1 mb-8">
          <TabsTrigger value="providers" variant="pills" className="gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            AI 服务商
          </TabsTrigger>
          <TabsTrigger value="account" variant="pills" className="gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            账号安全
          </TabsTrigger>
          <TabsTrigger value="preferences" variant="pills" className="gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            偏好设置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6 focus:outline-none">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-white tracking-tight">AI 服务商配置</h2>
              <p className="text-gray-400">配置 OpenAI、Claude、Gemini 等 AI 服务的 API 密钥</p>
            </div>
            <Button
              onClick={openCreateModal}
              size="sm"
              className="min-w-[122px]"
              leftIcon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }>
              添加服务商
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-4">
                  <Skeleton variant="rect" className="h-48 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : providers.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-white/20 bg-white/5">
              <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">尚未配置服务商</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">添加 AI 服务商配置以开始使用智能写作功能，支持多种主流大模型</p>
              <Button onClick={openCreateModal} size="lg">
                添加第一个服务商
              </Button>
            </Card>
          ) : (
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence>
                {providers.map((provider) => {
                  const providerInfo = PROVIDER_TYPES.find(p => p.value === provider.providerType);
                  return (
                    <Card 
                      key={provider.id}
                      variant="interactive"
                      className="group relative overflow-hidden"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      layout
                    >
                      <CardHeader className="relative z-10 pb-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                            provider.providerType === 'openai' ? 'bg-green-500/20 text-green-400 shadow-green-500/10' :
                            provider.providerType === 'claude' ? 'bg-orange-500/20 text-orange-400 shadow-orange-500/10' :
                            'bg-blue-500/20 text-blue-400 shadow-blue-500/10'
                          }`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-700/70 bg-zinc-900/80 shadow-lg shadow-black/30">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={(e) => { e.stopPropagation(); openEditModal(provider); }}
                              className="h-9 w-9 p-0 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/90 border border-transparent hover:border-zinc-600/70 transition-all"
                              aria-label={`编辑${provider.name}`}
                              title="编辑服务商"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={(e) => { e.stopPropagation(); handleDelete(provider.id); }}
                              className="h-9 w-9 p-0 rounded-lg text-red-300 hover:text-red-200 hover:bg-red-500/15 border border-transparent hover:border-red-500/35 transition-all"
                              aria-label={`删除${provider.name}`}
                              title="删除服务商"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </Button>
                          </div>
                        </div>
                        <CardTitle>{provider.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-2">
                          <Badge variant={
                            provider.providerType === 'openai' ? 'success' :
                            provider.providerType === 'claude' ? 'warning' : 'info'
                          }>
                            {providerInfo?.label || provider.providerType}
                          </Badge>
                          {provider.defaultModel && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                              {provider.defaultModel}
                            </span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="relative z-10 pt-0">
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono bg-black/20 p-2 rounded-lg truncate">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <span className="truncate">{provider.baseURL}</span>
                        </div>
                        <div className="mt-3">
                          {capabilityBadges(provider.capabilities)}
                        </div>
                      </CardContent>
                      
                      <div className={`absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-[50px] opacity-10 pointer-events-none ${
                        provider.providerType === 'openai' ? 'bg-green-500' :
                        provider.providerType === 'claude' ? 'bg-orange-500' :
                        'bg-blue-500'
                      }`} />
                    </Card>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="account" className="max-w-xl mx-auto space-y-6 focus:outline-none">
          <div className="space-y-1 text-center mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">账号安全</h2>
            <p className="text-gray-400">修改密码和账号安全设置</p>
          </div>

          <Card className="border-white/10 overflow-visible">
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
              <CardDescription>建议定期更换密码以保护账号安全</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <Input
                  type="password"
                  label="当前密码"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  required
                />
                <Input
                  type="password"
                  label="新密码"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  required
                  minLength={8}
                />
                <Input
                  type="password"
                  label="确认新密码"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                />

                {passwordError && (
                  <motion.div 
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {passwordError}
                  </motion.div>
                )}

                {passwordSuccess && (
                  <motion.div 
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {passwordSuccess}
                  </motion.div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    isLoading={changingPassword}
                    className="w-full"
                  >
                    修改密码
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="max-w-2xl mx-auto space-y-6 focus:outline-none">
          <div className="space-y-1 text-center mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">偏好设置</h2>
            <p className="text-gray-400">自定义编辑器和界面设置</p>
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
                <Toggle 
                  checked={preferences.autoSave} 
                  onChange={() => setPreferences(p => ({ ...p, autoSave: !p.autoSave }))} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">字数统计</div>
                  <div className="text-gray-400 text-sm">在编辑器底部显示字数统计</div>
                </div>
                <Toggle 
                  checked={preferences.wordCount} 
                  onChange={() => setPreferences(p => ({ ...p, wordCount: !p.wordCount }))} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">行号显示</div>
                  <div className="text-gray-400 text-sm">在编辑器左侧显示行号</div>
                </div>
                <Toggle 
                  checked={preferences.lineNumbers} 
                  onChange={() => setPreferences(p => ({ ...p, lineNumbers: !p.lineNumbers }))} 
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
                onChange={(val) => setPreferences(p => ({ ...p, defaultWordCount: val }))}
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
                onChange={(val) => setPreferences(p => ({ ...p, writingStyle: val }))}
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
                value={preferences.defaultProviderId}
                onChange={(val) => {
                  const provider = providers.find(p => p.id === val);
                  setPreferences(p => ({ 
                    ...p, 
                    defaultProviderId: val,
                    defaultModel: provider?.defaultModel || (provider?.models?.[0]) || ''
                  }));
                }}
                options={[
                  { value: '', label: '未设置' },
                  ...providers.map(p => ({ value: p.id, label: p.name }))
                ]}
              />
              {preferences.defaultProviderId && (
                <Select
                  label="默认模型"
                  value={preferences.defaultModel}
                  onChange={(val) => setPreferences(p => ({ ...p, defaultModel: val }))}
                  options={(() => {
                    const provider = providers.find(p => p.id === preferences.defaultProviderId);
                    const models = provider?.models || [];
                    return models.map(m => ({ value: m, label: m }));
                  })()}
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
                <Toggle 
                  checked={preferences.webSearchEnabled} 
                  onChange={() => setPreferences(p => ({ ...p, webSearchEnabled: !p.webSearchEnabled }))} 
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
                      onChange={(val) => setPreferences(p => ({ ...p, webSearchProvider: val as 'tavily' | 'exa' | 'model' }))}
                      options={[
                        { value: 'model', label: '模型内置搜索 (推荐)' },
                        { value: 'tavily', label: 'Tavily' },
                        { value: 'exa', label: 'Exa AI' },
                      ]}
                    />
                    
                    {preferences.webSearchProvider === 'model' ? (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                        使用 AI 模型自带的联网搜索功能，无需额外配置 API 密钥
                      </div>
                    ) : (
                      <Input
                        type="password"
                        label="搜索 API 密钥"
                        helperText={
                          preferences.webSearchProvider === 'tavily' 
                            ? "在 tavily.com 获取密钥" 
                            : "在 exa.ai 获取密钥"
                        }
                        value={preferences.webSearchApiKey}
                        onChange={(e) => setPreferences(p => ({ ...p, webSearchApiKey: e.target.value }))}
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
                onChange={(val) => setPreferences(p => ({ ...p, language: val }))}
                options={[
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'zh-TW', label: '繁體中文' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingProvider ? '编辑服务商' : '添加服务商'}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <Input
              label="配置名称"
              placeholder="例如: 我的 OpenAI"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">服务商类型</label>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDER_TYPES.map((type) => (
                  <Button
                    key={type.value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleProviderTypeChange(type.value)}
                    className={`h-10 rounded-xl border px-4 text-sm font-medium transition-all ${
                      formData.providerType === type.value
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400 hover:border-emerald-400/70 hover:bg-emerald-500/25'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-zinc-100'
                    }`}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            <Input
              type="url"
              label="API 地址"
              value={formData.baseURL}
              onChange={(e) => setFormData(prev => ({ ...prev, baseURL: e.target.value }))}
              className="font-mono text-sm"
              required
            />

            <Input
              type="password"
              label="API 密钥"
              helperText={editingProvider ? "留空则不修改" : undefined}
              value={formData.apiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              className="font-mono"
              placeholder="sk-..."
              required={!editingProvider}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">模型列表</label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {formData.models.map((model) => (
                    <Badge key={model} variant="outline" className="pl-2 pr-1 gap-1">
                      {model}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, models: prev.models.filter(m => m !== model) }))}
                        className="h-6 w-6 rounded-full px-0 text-gray-400 hover:bg-white/20 hover:text-white"
                        aria-label={`删除模型 ${model}`}
                        title={`删除模型 ${model}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={formData.newModel}
                    onChange={(e) => setFormData(prev => ({ ...prev, newModel: e.target.value }))}
                    placeholder="输入模型名称，如 gpt-4o"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && formData.newModel.trim()) {
                        e.preventDefault();
                        if (!formData.models.includes(formData.newModel.trim())) {
                          setFormData(prev => ({ ...prev, models: [...prev.models, prev.newModel.trim()], newModel: '' }));
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="whitespace-nowrap"
                    onClick={() => {
                      if (formData.newModel.trim() && !formData.models.includes(formData.newModel.trim())) {
                        setFormData(prev => ({ ...prev, models: [...prev.models, prev.newModel.trim()], newModel: '' }));
                      }
                    }}
                  >
                    添加
                  </Button>
                </div>
              </div>
            </div>

            <Select
              label="默认模型"
              value={formData.defaultModel}
              onChange={(val) => setFormData(prev => ({ ...prev, defaultModel: val }))}
              options={formData.models.map(m => ({ value: m, label: m }))}
            />

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {testResult && (
              <motion.div 
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  testStatus === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {testStatus === 'success' ? (
                  <>
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span>连接成功</span>
                      <span className="text-emerald-500/60 font-normal">
                        {testResult.message} • 延迟: {testResult.latency}ms
                        {testResult.model ? ` • 模型: ${testResult.model}` : ''}
                      </span>
                      {capabilityBadges(testResult.capabilities)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span>连接失败</span>
                      <span className="text-red-500/60 font-normal">{testResult.error}</span>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {isVerificationStale && (
              <motion.div
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300"
              >
                当前配置已变更，连接状态已转为待验证，请重新测试连接。
              </motion.div>
            )}

            <DialogFooter className="mt-2 flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || (!formData.apiKey.trim() && !editingProvider)}
                isLoading={testStatus === 'testing'}
                className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
                leftIcon={!testStatus.includes('testing') && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                >
                  测试连接
                </Button>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
                  onClick={() => setShowModal(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={saving}
                >
                  保存
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
