'use client';

import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BUILT_IN_AGENTS, type AgentCategory, type BuiltInAgentDefinition } from '@/src/constants/agents';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { Badge } from '@/app/components/ui/Badge';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { RangeSlider } from '@/app/components/ui/RangeSlider';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/Tabs';
import Modal, { ModalFooter } from '@/app/components/ui/Modal';
import {
  staggerContainer, 
  staggerItem, 
  fadeIn, 
  slideUp 
} from '@/app/lib/animations';

const AGENTS_CACHE_KEY = 'aiwriter.agents.cache.v1';
const TEMPLATES_CACHE_KEY = 'aiwriter.templates.cache.v1';
const PROVIDERS_CACHE_KEY = 'aiwriter.providers.cache.v1';
const INITIAL_LOAD_TIMEOUT_MS = 8000;

interface Agent {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  providerConfigId?: string;
  model?: string;
  isBuiltIn?: boolean;
  params?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

interface Template {
  id: string;
  name: string;
  content: string;
}

interface Provider {
  id: string;
  name: string;
  providerType: string;
  defaultModel?: string;
  models?: string[];
}

const CATEGORY_LABELS: Record<AgentCategory | 'all', string> = {
  all: '全部',
  writing: '写作生成',
  review: '评审检查',
  utility: '辅助工具',
};

const getCategoryBadgeVariant = (category: AgentCategory) => {
  switch (category) {
    case 'writing': return 'default';
    case 'review': return 'warning';
    case 'utility': return 'success';
    default: return 'outline';
  }
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const formErrors = (error as { formErrors?: unknown }).formErrors;
    if (Array.isArray(formErrors) && typeof formErrors[0] === 'string') {
      return formErrors[0];
    }
  }
  return fallback;
};

const AgentSkeleton = () => (
  <Card className="h-[280px]">
    <CardHeader className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton variant="circle" className="w-10 h-10" />
        <Skeleton variant="text" className="w-16" />
      </div>
      <Skeleton variant="text" className="w-3/4 h-6" />
    </CardHeader>
    <CardContent className="space-y-3">
      <Skeleton variant="text" />
      <Skeleton variant="text" className="w-5/6" />
    </CardContent>
    <CardFooter className="gap-2 mt-auto">
      <Skeleton variant="rect" className="h-9 flex-1 rounded-lg" />
      <Skeleton variant="rect" className="h-9 flex-1 rounded-lg" />
    </CardFooter>
  </Card>
);

const BuiltInAgentCard = memo(({ 
  agentKey, 
  agent, 
  instance,
  providerName,
  hasTemplate,
  hasAnyProvider,
  onViewTemplate, 
  onCreateInstance
}: {
  agentKey: string;
  agent: BuiltInAgentDefinition;
  instance?: Agent;
  providerName: string;
  hasTemplate: boolean;
  hasAnyProvider: boolean;
  onViewTemplate: (key: string) => void;
  onCreateInstance: (key: string) => void;
}) => {
  const categoryLabel = CATEGORY_LABELS[agent.category];
  const badgeVariant = getCategoryBadgeVariant(agent.category);
  const isConfigured = Boolean(instance?.providerConfigId || instance?.model || hasAnyProvider);
  const statusText = instance?.providerConfigId || instance?.model
    ? '已配置'
    : hasAnyProvider
      ? '默认可用'
      : '待配置';
  
  return (
    <motion.div
      variants={staggerItem}
      layout
      className="col-span-1"
    >
      <Card variant="interactive" className="h-full flex flex-col">
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border bg-gradient-to-br ${
              agent.category === 'writing' ? 'from-emerald-500/20 to-purple-500/20 border-emerald-500/30 text-emerald-400' :
              agent.category === 'review' ? 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400' :
              'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <Badge variant={badgeVariant}>
              {categoryLabel}
            </Badge>
          </div>
          
          <h3 className="text-lg font-bold text-white mb-2">{agent.name}</h3>
          <p className="text-gray-400 text-sm mb-4 line-clamp-2 min-h-[40px]">{agent.description}</p>
          
          <div className="space-y-2 mb-6 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">实例状态</span>
              <Badge variant={isConfigured ? 'success' : 'outline'} size="sm">
                {statusText}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">模板</span>
              <Badge variant={hasTemplate ? 'success' : 'warning'} size="sm">
                {hasTemplate ? '已就绪' : '缺失'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-gray-500">
              <span>服务商</span>
              <span className="text-gray-300">{providerName}</span>
            </div>
            <div className="flex items-center justify-between text-gray-500">
              <span>模型</span>
              <span className="text-gray-300 font-mono">{instance?.model || '默认模型'}</span>
            </div>
          </div>

          <div className="flex gap-2 mt-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onViewTemplate(agentKey)}
              className="flex-1"
            >
              查看模板
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onCreateInstance(agentKey)}
              className="flex-1"
            >
              配置调用
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});

BuiltInAgentCard.displayName = 'BuiltInAgentCard';

const CustomAgentCard = memo(({ 
  agent, 
  providerName, 
  onConfigure 
}: {
  agent: Agent;
  providerName: string;
  onConfigure: (agent: Agent) => void;
}) => {
  return (
    <motion.div variants={staggerItem}>
      <Card variant="interactive" className="h-full flex flex-col p-6 group">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-purple-500/20 flex items-center justify-center border border-emerald-500/10 group-hover:border-emerald-500/30 transition-colors">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          {agent.isBuiltIn && (
            <Badge variant="default">内置</Badge>
          )}
        </div>

        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">{agent.name}</h3>
        <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">{agent.description || '暂无描述'}</p>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">服务商</span>
            <Badge variant="outline" size="sm" className="font-normal">
              {providerName}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">模型</span>
            <span className="text-gray-300 font-mono">{agent.model || '默认'}</span>
          </div>
        </div>

        <Button 
          variant="secondary"
          className="w-full mt-auto"
          onClick={() => onConfigure(agent)}
        >
          配置助手
        </Button>
      </Card>
    </motion.div>
  );
});

CustomAgentCard.displayName = 'CustomAgentCard';

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchProviderConfigId, setBatchProviderConfigId] = useState('');
  const [batchModel, setBatchModel] = useState('');
  const [batchUseCustomModel, setBatchUseCustomModel] = useState(false);
  const [batchCustomModel, setBatchCustomModel] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [viewingAgentKey, setViewingAgentKey] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<AgentCategory | 'all'>('all');
  const [builtInTemplateCache, setBuiltInTemplateCache] = useState<Record<string, { name: string; content: string } | null>>({});
  const hasCacheBootstrapRef = useRef(false);
  const redirectingToLoginRef = useRef(false);
  const activeTemplate = templates.find(t => t.id === currentAgent.templateId);
  const builtInInstances = useMemo(() => agents.filter(agent => agent.isBuiltIn), [agents]);
  const customAgents = useMemo(() => agents.filter(agent => !agent.isBuiltIn), [agents]);
  const builtInInstanceMap = useMemo(() => {
    return new Map(builtInInstances.map(agent => [agent.name, agent]));
  }, [builtInInstances]);
  const isEditingBuiltIn = Boolean(currentAgent.id && currentAgent.isBuiltIn);
  const selectedBatchCount = batchSelectedIds.size;
  
  const viewingAgent = viewingAgentKey ? BUILT_IN_AGENTS[viewingAgentKey] : null;
  const viewingTemplate = useMemo(() => {
    if (!viewingAgent) return null;
    const dbTemplate = templates.find(t => t.name === viewingAgent.templateName);
    if (dbTemplate) return dbTemplate;
    return builtInTemplateCache[viewingAgent.templateName] ?? null;
  }, [viewingAgent, templates, builtInTemplateCache]);

  const fetchingTemplates = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!viewingAgent) return;
    const templateName = viewingAgent.templateName;
    const hasInDb = templates.some(t => t.name === templateName);
    const hasInCache = templateName in builtInTemplateCache;
    const isFetching = fetchingTemplates.current.has(templateName);
    
    let isMounted = true;
    
    if (!hasInDb && !hasInCache && !isFetching) {
      fetchingTemplates.current.add(templateName);
      fetch(`/api/templates/builtin?name=${encodeURIComponent(templateName)}`, {
        cache: 'no-store',
        credentials: 'include',
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (isMounted) {
            setBuiltInTemplateCache(prev => ({ ...prev, [templateName]: data }));
          }
        })
        .catch(() => {
          if (isMounted) {
            setBuiltInTemplateCache(prev => ({ ...prev, [templateName]: null }));
          }
        })
        .finally(() => {
          fetchingTemplates.current.delete(templateName);
        });
    }
    
    return () => {
      isMounted = false;
    };
  }, [viewingAgent, templates, builtInTemplateCache]);

  const builtInAgentsByCategory = useMemo(() => {
    const groups: Record<AgentCategory, Array<[string, typeof BUILT_IN_AGENTS[string]]>> = {
      writing: [],
      review: [],
      utility: [],
    };
    Object.entries(BUILT_IN_AGENTS).forEach(([key, agent]) => {
      groups[agent.category].push([key, agent]);
    });
    return groups;
  }, []);

  const filteredBuiltInAgents = useMemo(() => {
    if (activeCategory === 'all') {
      return Object.entries(BUILT_IN_AGENTS);
    }
    return builtInAgentsByCategory[activeCategory];
  }, [activeCategory, builtInAgentsByCategory]);
  const batchAvailableModels =
    providers.find((provider) => provider.id === batchProviderConfigId)?.models || [];

  const getProviderName = useCallback((providerConfigId?: string) => {
    if (!providerConfigId) return '默认服务商';
    return providers.find(provider => provider.id === providerConfigId)?.name || '默认服务商';
  }, [providers]);

  const fetchJsonWithTimeout = useCallback(async (url: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const fetchJsonWithRetry = useCallback(async (url: string) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let res: Response;
      try {
        res = await fetchJsonWithTimeout(url, 10000);
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 220));
          continue;
        }
        const message =
          error instanceof Error && error.name === 'AbortError'
            ? `${url} 请求超时`
            : `${url} 网络异常`;
        return {
          ok: false as const,
          status: 500,
          error: message,
        };
      }

      const payload = await res.json().catch(() => null);

      if (res.ok) {
        return { ok: true as const, data: payload };
      }

      if (res.status === 401 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        continue;
      }

      return {
        ok: false as const,
        status: res.status,
        error: extractErrorMessage(payload, `${url} 请求失败 (${res.status})`),
      };
    }

    return {
      ok: false as const,
      status: 500,
      error: `${url} 请求失败`,
    };
  }, [fetchJsonWithTimeout]);

  const redirectToLogin = useCallback(() => {
    if (redirectingToLoginRef.current) {
      return;
    }
    redirectingToLoginRef.current = true;
    router.replace('/login');
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const [agentsResult, templatesResult, providersResult] = await Promise.all([
        fetchJsonWithRetry('/api/agents'),
        fetchJsonWithRetry('/api/templates'),
        fetchJsonWithRetry('/api/providers'),
      ]);

      if (agentsResult.ok) {
        const nextAgents = Array.isArray(agentsResult.data) ? (agentsResult.data as Agent[]) : [];
        setAgents(nextAgents);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AGENTS_CACHE_KEY, JSON.stringify(nextAgents));
        }
      }
      if (templatesResult.ok) {
        const nextTemplates = Array.isArray(templatesResult.data) ? (templatesResult.data as Template[]) : [];
        setTemplates(nextTemplates);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(TEMPLATES_CACHE_KEY, JSON.stringify(nextTemplates));
        }
      }
      if (providersResult.ok) {
        const configs = (providersResult.data as { configs?: unknown })?.configs;
        const nextProviders = Array.isArray(configs) ? (configs as Provider[]) : [];
        setProviders(nextProviders);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PROVIDERS_CACHE_KEY, JSON.stringify(nextProviders));
        }
      }

      const failedRequests = [agentsResult, templatesResult, providersResult].filter(
        (result) => !result.ok
      );
      const hasUnauthorized = failedRequests.some((result) => result.status === 401);
      if (hasUnauthorized) {
        redirectToLogin();
        return;
      }
      if (failedRequests.length > 0) {
        console.warn(
          'Agents page data partially failed:',
          failedRequests.map((result) => result.error)
        );
        if (failedRequests.length === 3 && !hasCacheBootstrapRef.current) {
          setLoadWarning('实时数据加载失败，已切换到离线展示。');
        } else {
          setLoadWarning('部分配置加载失败，页面展示可用数据。');
        }
      } else {
        setLoadWarning(null);
      }
    } catch (error) {
      console.error('Failed to fetch data', error);
      if (!hasCacheBootstrapRef.current) {
        setLoadWarning('助手配置加载失败，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchJsonWithRetry, redirectToLogin]);

  useEffect(() => {
    let hasCachedData = false;
    if (typeof window !== 'undefined') {
      try {
        const cachedAgents = window.localStorage.getItem(AGENTS_CACHE_KEY);
        const cachedTemplates = window.localStorage.getItem(TEMPLATES_CACHE_KEY);
        const cachedProviders = window.localStorage.getItem(PROVIDERS_CACHE_KEY);

        if (cachedAgents) {
          const parsed = JSON.parse(cachedAgents);
          if (Array.isArray(parsed)) {
            setAgents(parsed as Agent[]);
            hasCachedData = true;
          }
        }
        if (cachedTemplates) {
          const parsed = JSON.parse(cachedTemplates);
          if (Array.isArray(parsed)) {
            setTemplates(parsed as Template[]);
            hasCachedData = true;
          }
        }
        if (cachedProviders) {
          const parsed = JSON.parse(cachedProviders);
          if (Array.isArray(parsed)) {
            setProviders(parsed as Provider[]);
            hasCachedData = true;
          }
        }
      } catch (error) {
        console.warn('Failed to read agents page cache', error);
      }
    }

    hasCacheBootstrapRef.current = hasCachedData;
    if (hasCachedData) {
      setLoading(false);
    }

    const timeout = setTimeout(() => {
      setLoading(false);
      setLoadWarning((prev) => prev || '加载超时，已先展示本地可用内容。');
    }, INITIAL_LOAD_TIMEOUT_MS);

    void fetchData().finally(() => {
      clearTimeout(timeout);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [fetchData]);

  const handleOpenModal = useCallback((agent?: Agent) => {
    setSaveError(null);
    if (agent) {
      setCurrentAgent(agent);
      const provider = providers.find(p => p.id === agent.providerConfigId);
      const providerModels = provider?.models || [];
      const isCustom = Boolean(agent.model && providerModels.length > 0 && !providerModels.includes(agent.model));
      setUseCustomModel(isCustom);
      setCustomModel(isCustom && agent.model ? agent.model : '');
      setShowTemplateSelector(false);
    } else {
      setCurrentAgent({
        name: '',
        description: '',
        params: {
          temperature: 0.7,
          maxTokens: 1000,
        }
      });
      setUseCustomModel(false);
      setCustomModel('');
      setShowTemplateSelector(true);
    }
    setIsModalOpen(true);
  }, [providers]);

  const handleSelectBuiltInTemplate = useCallback((key: string) => {
    const template = BUILT_IN_AGENTS[key];
    const matchingTemplate = templates.find(t => t.name === template.templateName);
    setCurrentAgent({
      name: `${template.name}·自定义`,
      description: `基于内置助手「${template.name}」创建`,
      templateId: matchingTemplate?.id,
      params: template.defaultParams,
    });
    setShowTemplateSelector(false);
  }, [templates]);

  const handleViewBuiltInAgent = useCallback((key: string) => {
    setViewingAgentKey(key);
  }, []);

  const handleCreateInstance = useCallback((key: string) => {
    const builtInDef = BUILT_IN_AGENTS[key];
    if (!builtInDef) return;
    const existingBuiltIn = builtInInstanceMap.get(builtInDef.name);
    if (existingBuiltIn) {
      handleOpenModal(existingBuiltIn);
      return;
    }

    handleSelectBuiltInTemplate(key);
    setIsModalOpen(true);
  }, [builtInInstanceMap, handleOpenModal, handleSelectBuiltInTemplate]);

  const getBuiltInAgentTemplate = useCallback((templateName: string) => {
    return templates.find(t => t.name === templateName);
  }, [templates]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!currentAgent.id && !currentAgent.name?.trim()) {
      setSaveError('请先填写助手名称');
      return;
    }

    setSaving(true);

    try {
      const url = currentAgent.id ? `/api/agents/${currentAgent.id}` : '/api/agents';
      const method = currentAgent.id ? 'PUT' : 'POST';
      const payload = currentAgent.id && currentAgent.isBuiltIn
        ? {
            providerConfigId: currentAgent.providerConfigId || '',
            model: currentAgent.model || '',
          }
        : {
            name: currentAgent.name?.trim() || '',
            description: currentAgent.description || '',
            templateId: currentAgent.templateId || '',
            providerConfigId: currentAgent.providerConfigId || '',
            model: currentAgent.model || '',
            params: currentAgent.params,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(errorPayload, '保存助手失败'));
      }

      await fetchData();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving agent:', error);
      setSaveError(error instanceof Error ? error.message : '保存助手失败');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenBatchModal = () => {
    setBatchError(null);
    setBatchSuccessMessage(null);
    setBatchSelectedIds(new Set(agents.map((agent) => agent.id)));
    setBatchProviderConfigId('');
    setBatchModel('');
    setBatchUseCustomModel(false);
    setBatchCustomModel('');
    setIsBatchModalOpen(true);
  };

  const handleCloseBatchModal = () => {
    if (batchSaving) return;
    setIsBatchModalOpen(false);
    setBatchError(null);
  };

  const toggleBatchAgentSelection = (id: string, checked: boolean) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAllBatchAgents = () => {
    setBatchSelectedIds(new Set(agents.map((agent) => agent.id)));
  };

  const handleClearBatchAgents = () => {
    setBatchSelectedIds(new Set());
  };

  const handleBatchConfigureSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError(null);
    setBatchSuccessMessage(null);

    if (batchSelectedIds.size === 0) {
      setBatchError('请至少选择一个助手');
      return;
    }

    setBatchSaving(true);
    try {
      const modelValue = batchUseCustomModel ? batchCustomModel : batchModel;
      const res = await fetch('/api/agents/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(batchSelectedIds),
          providerConfigId: batchProviderConfigId,
          model: modelValue,
        }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(errorPayload, '批量配置失败'));
      }

      const payload = await res.json().catch(() => ({ updatedCount: batchSelectedIds.size }));
      const updatedCount =
        typeof payload?.updatedCount === 'number' ? payload.updatedCount : batchSelectedIds.size;
      setBatchSuccessMessage(`已批量更新 ${updatedCount} 个助手`);
      await fetchData();
      setIsBatchModalOpen(false);
    } catch (error) {
      console.error('Batch configure failed:', error);
      setBatchError(error instanceof Error ? error.message : '批量配置失败');
    } finally {
      setBatchSaving(false);
    }
  };

  const updateParam = (key: string, value: number) => {
    setCurrentAgent(prev => ({
      ...prev,
      params: {
        ...prev.params,
        [key]: value
      }
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton variant="text" className="h-8 w-48 mb-2" />
            <Skeleton variant="text" className="h-4 w-64" />
          </div>
          <Skeleton variant="rect" className="h-10 w-32 rounded-lg" />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" className="h-6 w-32" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} variant="rect" className="h-8 w-16 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <AgentSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="page-header items-start gap-4">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="page-title"
          >
            AI 助手
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="page-subtitle"
          >
            管理您的 AI 写作助手及其配置
          </motion.p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-w-[132px]"
            onClick={handleOpenBatchModal}
            disabled={agents.length === 0}
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            }
          >
            批量配置模型
          </Button>
          <Button 
            variant="primary"
            size="sm"
            className="min-w-[108px]"
            onClick={() => handleOpenModal()}
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            新建助手
          </Button>
        </div>
      </div>

      {batchSuccessMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {batchSuccessMessage}
        </div>
      )}

      {loadWarning && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {loadWarning}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            内置 AI 助手
          </h2>
          <Tabs 
            value={activeCategory} 
            onValueChange={(v) => setActiveCategory(v as AgentCategory | 'all')}
          >
            <TabsList variant="pills">
              {['all', 'writing', 'review', 'utility'].map((cat) => (
                <TabsTrigger key={cat} value={cat} variant="pills">
                  {CATEGORY_LABELS[cat as AgentCategory | 'all']}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredBuiltInAgents.map(([key, agent]) => (
              <BuiltInAgentCard
                key={key}
                agentKey={key}
                agent={agent}
                instance={builtInInstanceMap.get(agent.name)}
                providerName={getProviderName(builtInInstanceMap.get(agent.name)?.providerConfigId)}
                hasTemplate={Boolean(getBuiltInAgentTemplate(agent.templateName))}
                hasAnyProvider={providers.length > 0}
                onViewTemplate={handleViewBuiltInAgent}
                onCreateInstance={handleCreateInstance}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          自定义助手
        </h2>
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {customAgents.map((agent) => (
            <CustomAgentCard
              key={agent.id}
              agent={agent}
              providerName={getProviderName(agent.providerConfigId)}
              onConfigure={handleOpenModal}
            />
          ))}
          
          <motion.div variants={staggerItem}>
            <Card 
              variant="outline" 
              className="h-full border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer min-h-[200px]"
              onClick={() => handleOpenModal()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <svg className="w-8 h-8 text-gray-400 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-gray-400 font-medium group-hover:text-emerald-300">创建新的自定义助手</span>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>

      <Modal
        isOpen={isBatchModalOpen}
        onClose={handleCloseBatchModal}
        title="批量配置助手模型"
        size="xl"
      >
        <form onSubmit={handleBatchConfigureSave} className="space-y-6">
          <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-xs text-blue-200">
            选择多个助手后可一次性统一设置服务商与模型。留空将清空对应字段，回到系统默认策略。
          </div>

          {batchError && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {batchError}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-medium text-gray-300">选择助手</label>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span>已选 {selectedBatchCount} / {agents.length}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleSelectAllBatchAgents}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleClearBatchAgents}
                >
                  清空
                </Button>
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 custom-scrollbar">
              {agents.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-500">暂无可配置助手</div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => {
                    const isSelected = batchSelectedIds.has(agent.id);
                    return (
                      <label
                        key={agent.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                          isSelected
                            ? 'border-emerald-500/35 bg-emerald-500/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) => toggleBatchAgentSelection(agent.id, event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
                          aria-label={`选择助手 ${agent.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-white">{agent.name}</span>
                            <Badge variant={agent.isBuiltIn ? 'info' : 'outline'} size="sm">
                              {agent.isBuiltIn ? '内置' : '自定义'}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            当前：{getProviderName(agent.providerConfigId)} · {agent.model || '默认模型'}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">服务商</label>
              <select
                value={batchProviderConfigId}
                onChange={(event) => {
                  setBatchProviderConfigId(event.target.value);
                  setBatchModel('');
                  setBatchCustomModel('');
                  setBatchUseCustomModel(false);
                }}
                className="select-menu w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">默认服务商</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.providerType})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">模型</label>
              <div className="space-y-2">
                {batchAvailableModels.length > 0 && (
                  <select
                    value={batchUseCustomModel ? '__custom__' : batchModel}
                    onChange={(event) => {
                      if (event.target.value === '__custom__') {
                        setBatchUseCustomModel(true);
                        setBatchCustomModel('');
                        setBatchModel('');
                        return;
                      }
                      setBatchUseCustomModel(false);
                      setBatchCustomModel('');
                      setBatchModel(event.target.value);
                    }}
                    className="select-menu w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="">默认模型</option>
                    {batchAvailableModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                    <option value="__custom__">自定义模型...</option>
                  </select>
                )}

                {(batchAvailableModels.length === 0 || batchUseCustomModel) && (
                  <Input
                    value={batchUseCustomModel ? batchCustomModel : batchModel}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (batchUseCustomModel) {
                        setBatchCustomModel(value);
                      }
                      setBatchModel(value);
                    }}
                    placeholder="留空则使用默认模型"
                  />
                )}
              </div>
            </div>
          </div>

          <ModalFooter className="mt-6">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={handleCloseBatchModal}
              disabled={batchSaving}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={batchSaving || selectedBatchCount === 0}
              isLoading={batchSaving}
              loadingText="保存中..."
            >
              批量保存
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditingBuiltIn ? '配置内置助手' : currentAgent.id ? '编辑助手' : '创建助手'}
        size="2xl"
      >
        {!currentAgent.id && showTemplateSelector && (
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-300 mb-3 block">从内置模板创建</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {Object.entries(BUILT_IN_AGENTS).map(([key, template]) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelectBuiltInTemplate(key)}
                  className="h-auto w-full justify-start rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:bg-emerald-500/18 hover:border-emerald-500/35"
                >
                  <div className="text-sm font-medium text-white truncate">{template.name}</div>
                  <div className="text-xs text-gray-500 truncate">{template.description}</div>
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex-1 h-px bg-white/10"></div>
              <span>或从空白创建</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {isEditingBuiltIn && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              内置助手仅支持修改服务商与模型，提示词与参数由系统统一维护。
            </div>
          )}

          {saveError && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="名称"
              required={!isEditingBuiltIn}
              disabled={isEditingBuiltIn}
              value={currentAgent.name || ''}
              onChange={e => setCurrentAgent({...currentAgent, name: e.target.value})}
              placeholder="例如：故事大纲师"
            />
            <Input
              label="描述"
              disabled={isEditingBuiltIn}
              value={currentAgent.description || ''}
              onChange={e => setCurrentAgent({...currentAgent, description: e.target.value})}
              placeholder="这个助手是做什么的？"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">服务商</label>
              <select
                value={currentAgent.providerConfigId || ''}
                onChange={e => setCurrentAgent({...currentAgent, providerConfigId: e.target.value || undefined})}
                className="select-menu w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">默认服务商</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.providerType})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">模型</label>
              {(() => {
                const selectedProvider = providers.find(p => p.id === currentAgent.providerConfigId);
                const availableModels = selectedProvider?.models || [];
                return (
                  <div className="space-y-2">
                    {availableModels.length > 0 && (
                      <select
                        value={useCustomModel ? '__custom__' : (currentAgent.model || '')}
                        onChange={e => {
                          if (e.target.value === '__custom__') {
                            setUseCustomModel(true);
                            setCustomModel('');
                            setCurrentAgent({...currentAgent, model: ''});
                          } else {
                            setUseCustomModel(false);
                            setCustomModel('');
                            setCurrentAgent({...currentAgent, model: e.target.value});
                          }
                        }}
                        className="select-menu w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="">选择模型...</option>
                        {availableModels.map((model: string) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                        <option value="__custom__">自定义模型...</option>
                      </select>
                    )}
                    {(availableModels.length === 0 || useCustomModel) && (
                      <Input
                        value={useCustomModel ? customModel : (currentAgent.model || '')}
                        onChange={e => {
                          const value = e.target.value;
                          if (useCustomModel) {
                            setCustomModel(value);
                          }
                          setCurrentAgent({...currentAgent, model: value});
                        }}
                        placeholder="输入模型名称，如 gpt-4o"
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">系统提示词模板</label>
            <select
              value={currentAgent.templateId || ''}
              disabled={isEditingBuiltIn}
              onChange={e => setCurrentAgent({...currentAgent, templateId: e.target.value || undefined})}
              className="select-menu w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="">选择模板...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">提示词内容（可见）</label>
            <Textarea
              value={activeTemplate?.content || '请选择模板以查看提示词内容'}
              readOnly
              className="min-h-[160px] font-mono text-gray-300"
            />
            {activeTemplate && (
              <p className="text-xs text-gray-500">模板：{activeTemplate.name}</p>
            )}
          </div>

          {!isEditingBuiltIn && (
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">参数设置</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider
                  label="温度 (Temperature)"
                  min={0}
                  max={2}
                  step={0.1}
                  value={currentAgent.params?.temperature ?? 0.7}
                  onChange={e => updateParam('temperature', parseFloat(e.target.value))}
                  valueFormatter={(value) => value.toFixed(1)}
                  aria-label="温度参数"
                />
                <div className="space-y-2">
                  <Input
                    label="最大Token数"
                    type="number"
                    value={currentAgent.params?.maxTokens ?? 1000}
                    onChange={e => updateParam('maxTokens', Number.parseInt(e.target.value, 10) || 1000)}
                  />
                </div>
              </div>
            </div>
          )}

          <ModalFooter className="mt-8">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setIsModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={saving}
              isLoading={saving}
              loadingText="保存中..."
            >
              保存助手
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        isOpen={!!viewingAgentKey}
        onClose={() => setViewingAgentKey(null)}
        title={viewingAgent?.name || '模板详情'}
        size="lg"
      >
        {viewingAgent && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center border bg-gradient-to-br ${
                viewingAgent.category === 'writing' ? 'from-emerald-500/20 to-purple-500/20 border-emerald-500/30 text-emerald-400' :
                viewingAgent.category === 'review' ? 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400' :
                'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400'
              }`}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <Badge variant={getCategoryBadgeVariant(viewingAgent.category)}>
                  {CATEGORY_LABELS[viewingAgent.category]}
                </Badge>
                <p className="text-gray-400 text-sm mt-1">{viewingAgent.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-300">模板内容</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" size="sm" className="font-mono">Temp: {viewingAgent.defaultParams.temperature ?? 0.7}</Badge>
                  <Badge variant="outline" size="sm" className="font-mono">Tokens: {viewingAgent.defaultParams.maxTokens ?? 2000}</Badge>
                </div>
              </div>
              
              {viewingTemplate ? (
                <div className="relative group">
                  <pre className="text-xs text-gray-300 font-mono bg-[#0d1117] border border-white/5 rounded-lg p-4 max-h-[50vh] overflow-auto custom-scrollbar whitespace-pre-wrap break-words leading-relaxed selection:bg-emerald-500/30">
                    {viewingTemplate.content}
                  </pre>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(viewingTemplate.content);
                      }}
                    >
                      复制
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-white/5 rounded-lg border border-dashed border-white/10">
                  <p className="text-sm text-amber-400 flex flex-col items-center justify-center gap-2">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>未找到模板 "{viewingAgent.templateName}"</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">请确认该模板已在系统中创建</p>
                </div>
              )}
            </div>
            
            <ModalFooter className="border-t-0 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setViewingAgentKey(null);
                  if (viewingAgentKey) handleCreateInstance(viewingAgentKey);
                }}
              >
                使用此模板创建
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>
    </div>
  );
}
