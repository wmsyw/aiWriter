'use client';

import { useState, useEffect } from 'react';
import { BUILT_IN_AGENTS } from '@/src/constants/agents';

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
}

interface Provider {
  id: string;
  name: string;
  providerType: string;
  defaultModel?: string;
  models?: string[];
}

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

  const handleOpenModal = (agent?: Agent) => {
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
  };

  const handleSelectBuiltInTemplate = (key: string) => {
    const template = BUILT_IN_AGENTS[key];
    const matchingTemplate = templates.find(t => t.name === template.templateName);
    setCurrentAgent({
      name: template.name,
      description: template.description,
      templateId: matchingTemplate?.id,
      params: template.defaultParams,
    });
    setShowTemplateSelector(false);
  };

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
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">AI 助手</h1>
          <p className="text-gray-400">管理您的 AI 写作助手及其配置</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建助手
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="glass-card rounded-xl p-6 group hover:border-indigo-500/30 transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/10 group-hover:border-indigo-500/30 transition-colors">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              {agent.isBuiltIn && (
                <span className="px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-400">
                  内置
                </span>
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">{agent.name}</h3>
            <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">{agent.description || '暂无描述'}</p>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">服务商</span>
                <span className="text-gray-300 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  {providers.find(p => p.id === agent.providerConfigId)?.name || '默认'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">模型</span>
                <span className="text-gray-300 font-mono">{agent.model || '默认'}</span>
              </div>
            </div>

            <button 
              onClick={() => handleOpenModal(agent)}
              className="w-full btn-secondary py-2 rounded-lg text-sm border border-white/5 hover:border-white/20"
            >
              配置助手
            </button>
          </div>
        ))}

        <button 
          onClick={() => handleOpenModal()}
          className="glass-card rounded-xl p-6 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all duration-300 flex flex-col items-center justify-center gap-4 group min-h-[300px]"
        >
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
            <svg className="w-8 h-8 text-gray-400 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-gray-400 font-medium group-hover:text-indigo-300">创建新助手</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-2xl rounded-2xl p-6 md:p-8 animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {currentAgent.id ? '编辑助手' : '创建助手'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!currentAgent.id && showTemplateSelector && (
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-300 mb-3 block">从内置模板创建</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {Object.entries(BUILT_IN_AGENTS).map(([key, template]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectBuiltInTemplate(key)}
                      className="p-3 rounded-lg bg-white/5 hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-500/30 transition-all text-left"
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">名称</label>
                  <input
                    type="text"
                    required
                    value={currentAgent.name || ''}
                    onChange={e => setCurrentAgent({...currentAgent, name: e.target.value})}
                    className="w-full glass-input px-4 py-2 rounded-lg"
                    placeholder="例如：故事大纲师"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">描述</label>
                  <input
                    type="text"
                    value={currentAgent.description || ''}
                    onChange={e => setCurrentAgent({...currentAgent, description: e.target.value})}
                    className="w-full glass-input px-4 py-2 rounded-lg"
                    placeholder="这个助手是做什么的？"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">服务商</label>
                  <select
                    value={currentAgent.providerConfigId || ''}
                    onChange={e => setCurrentAgent({...currentAgent, providerConfigId: e.target.value || undefined})}
                    className="w-full glass-input px-4 py-2 rounded-lg appearance-none"
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
                            className="w-full glass-input px-4 py-2 rounded-lg appearance-none"
                          >
                            <option value="" className="bg-gray-900">选择模型...</option>
                            {availableModels.map((model: string) => (
                              <option key={model} value={model} className="bg-gray-900">{model}</option>
                            ))}
                            <option value="__custom__" className="bg-gray-900">自定义模型...</option>
                          </select>
                        )}
                        {(availableModels.length === 0 || useCustomModel) && (
                          <input
                            type="text"
                            value={useCustomModel ? customModel : (currentAgent.model || '')}
                            onChange={e => {
                              const value = e.target.value;
                              if (useCustomModel) {
                                setCustomModel(value);
                              }
                              setCurrentAgent({...currentAgent, model: value});
                            }}
                            className="w-full glass-input px-4 py-2 rounded-lg"
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
                  className="w-full glass-input px-4 py-2 rounded-lg appearance-none"
                >
                  <option value="" className="bg-gray-900">选择模板...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id} className="bg-gray-900">
                      {t.name}
                    </option>
                  ))}
                </select>
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
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">最大Token数</label>
                    <input
                      type="number"
                      value={currentAgent.params?.maxTokens ?? 1000}
                      onChange={e => updateParam('maxTokens', parseInt(e.target.value))}
                      className="w-full glass-input px-4 py-2 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary px-6 py-2 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      保存中...
                    </>
                  ) : (
                    '保存助手'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
