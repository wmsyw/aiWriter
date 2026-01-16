'use client';

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
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
import { Skeleton } from '@/app/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/Tabs';
import Modal from '@/app/components/ui/Modal';
import { 
  staggerContainer, 
  staggerItem, 
  fadeIn, 
  slideUp 
} from '@/app/lib/animations';

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
  template, 
  isExpanded, 
  onToggleExpand, 
  onCreateInstance 
}: {
  agentKey: string;
  agent: BuiltInAgentDefinition;
  template?: Template;
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onCreateInstance: (key: string) => void;
}) => {
  const categoryLabel = CATEGORY_LABELS[agent.category];
  const badgeVariant = getCategoryBadgeVariant(agent.category);
  
  return (
    <motion.div
      variants={staggerItem}
      layout
      className={isExpanded ? 'col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4' : ''}
    >
      <Card variant="interactive" className="h-full flex flex-col">
        <div className="p-6">
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
          
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-6">
            <span>模板: {agent.templateName}</span>
            {template && <span className="text-emerald-400">✓</span>}
          </div>

          <div className="flex gap-2 mt-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleExpand(agentKey)}
              className="flex-1"
            >
              {isExpanded ? '收起' : '查看模板'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onCreateInstance(agentKey)}
              className="flex-1"
            >
              创建实例
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="border-t border-white/10 bg-black/20"
            >
              <div className="p-4">
                {template ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-300">提示词模板内容</h4>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <Badge variant="outline" size="sm">温度: {agent.defaultParams.temperature ?? 0.7}</Badge>
                        <Badge variant="outline" size="sm">MaxTokens: {agent.defaultParams.maxTokens ?? 2000}</Badge>
                      </div>
                    </div>
                    <pre className="text-xs text-gray-300 font-mono bg-[#0d1117] border border-white/5 rounded-lg p-4 max-h-64 overflow-auto custom-scrollbar whitespace-pre-wrap break-words leading-relaxed">
                      {template.content}
                    </pre>
                  </>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-amber-400 flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      未找到对应模板 "{agent.templateName}"，请先在模板页面创建该模板。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent>>({});
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedBuiltInAgent, setSelectedBuiltInAgent] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<AgentCategory | 'all'>('all');
  const activeTemplate = templates.find(t => t.id === currentAgent.templateId);

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [agentsRes, templatesRes, providersRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/templates'),
        fetch('/api/providers')
      ]);

      const agentsData = await agentsRes.json();
      const templatesData = await templatesRes.json();
      const providersData = await providersRes.json();

      setAgents(Array.isArray(agentsData) ? agentsData : []);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setProviders(providersData.configs || []);
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = useCallback((agent?: Agent) => {
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
      name: template.name,
      description: template.description,
      templateId: matchingTemplate?.id,
      params: template.defaultParams,
    });
    setShowTemplateSelector(false);
  }, [templates]);

  const handleViewBuiltInAgent = useCallback((key: string) => {
    setSelectedBuiltInAgent(prev => prev === key ? null : key);
  }, []);

  const handleCreateInstance = useCallback((key: string) => {
    handleSelectBuiltInTemplate(key);
    setIsModalOpen(true);
  }, [handleSelectBuiltInTemplate]);

  const getBuiltInAgentTemplate = useCallback((templateName: string) => {
    return templates.find(t => t.name === templateName);
  }, [templates]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = currentAgent.id ? `/api/agents/${currentAgent.id}` : '/api/agents';
      const method = currentAgent.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentAgent),
      });

      if (!res.ok) throw new Error('Failed to save agent');

      await fetchData();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving agent:', error);
    } finally {
      setSaving(false);
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-white mb-2"
          >
            AI 助手
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400"
          >
            管理您的 AI 写作助手及其配置
          </motion.p>
        </div>
        <Button 
          variant="primary"
          onClick={() => handleOpenModal()}
          leftIcon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          新建助手
        </Button>
      </div>

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
                template={getBuiltInAgentTemplate(agent.templateName)}
                isExpanded={selectedBuiltInAgent === key}
                onToggleExpand={handleViewBuiltInAgent}
                onCreateInstance={handleCreateInstance}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {agents.length > 0 && (
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
            {agents.map((agent) => (
              <CustomAgentCard
                key={agent.id}
                agent={agent}
                providerName={providers.find(p => p.id === agent.providerConfigId)?.name || '默认'}
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
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentAgent.id ? '编辑助手' : '创建助手'}
        size="2xl"
      >
        {!currentAgent.id && showTemplateSelector && (
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-300 mb-3 block">从内置模板创建</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {Object.entries(BUILT_IN_AGENTS).map(([key, template]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectBuiltInTemplate(key)}
                  className="p-3 rounded-lg bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 transition-all text-left"
                >
                  <div className="text-sm font-medium text-white truncate">{template.name}</div>
                  <div className="text-xs text-gray-500 truncate">{template.description}</div>
                </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="名称"
              required
              value={currentAgent.name || ''}
              onChange={e => setCurrentAgent({...currentAgent, name: e.target.value})}
              placeholder="例如：故事大纲师"
            />
            <Input
              label="描述"
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
                className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="" className="bg-gray-900">默认服务商</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id} className="bg-gray-900">
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
                        className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="" className="bg-gray-900">选择模型...</option>
                        {availableModels.map((model: string) => (
                          <option key={model} value={model} className="bg-gray-900">{model}</option>
                        ))}
                        <option value="__custom__" className="bg-gray-900">自定义模型...</option>
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
              onChange={e => setCurrentAgent({...currentAgent, templateId: e.target.value || undefined})}
              className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="" className="bg-gray-900">选择模板...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id} className="bg-gray-900">
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

          <div className="border-t border-white/10 pt-6">
            <h3 className="text-sm font-medium text-gray-300 mb-4">参数设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>温度 (Temperature)</span>
                  <span>{currentAgent.params?.temperature ?? 0.7}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={currentAgent.params?.temperature ?? 0.7}
                  onChange={e => updateParam('temperature', parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Input
                  label="最大Token数"
                  type="number"
                  value={currentAgent.params?.maxTokens ?? 1000}
                  onChange={e => updateParam('maxTokens', parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-8">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={saving}
              isLoading={saving}
            >
              保存助手
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
