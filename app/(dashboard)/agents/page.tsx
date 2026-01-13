'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent>>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();

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
    } else {
      setCurrentAgent({
        name: '',
        description: '',
        params: {
          temperature: 0.7,
          maxTokens: 1000,
        }
      });
    }
    setIsModalOpen(true);
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
          <h1 className="text-3xl font-bold text-white mb-2">Agents</h1>
          <p className="text-gray-400">Manage your AI writing assistants and their configurations.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Agent
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
                  System
                </span>
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">{agent.name}</h3>
            <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">{agent.description || 'No description provided.'}</p>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Provider</span>
                <span className="text-gray-300 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  {providers.find(p => p.id === agent.providerConfigId)?.name || 'Default'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Model</span>
                <span className="text-gray-300 font-mono">{agent.model || 'Default'}</span>
              </div>
            </div>

            <button 
              onClick={() => handleOpenModal(agent)}
              className="w-full btn-secondary py-2 rounded-lg text-sm border border-white/5 hover:border-white/20"
            >
              Configure Agent
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
          <span className="text-gray-400 font-medium group-hover:text-indigo-300">Create New Agent</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-2xl rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-white">
                {currentAgent.id ? 'Edit Agent' : 'Create Agent'}
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

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Name</label>
                  <input
                    type="text"
                    required
                    value={currentAgent.name || ''}
                    onChange={e => setCurrentAgent({...currentAgent, name: e.target.value})}
                    className="w-full glass-input px-4 py-2 rounded-lg"
                    placeholder="e.g. Story Outliner"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Description</label>
                  <input
                    type="text"
                    value={currentAgent.description || ''}
                    onChange={e => setCurrentAgent({...currentAgent, description: e.target.value})}
                    className="w-full glass-input px-4 py-2 rounded-lg"
                    placeholder="What does this agent do?"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Provider</label>
                  <select
                    value={currentAgent.providerConfigId || ''}
                    onChange={e => setCurrentAgent({...currentAgent, providerConfigId: e.target.value || undefined})}
                    className="w-full glass-input px-4 py-2 rounded-lg appearance-none"
                  >
                    <option value="" className="bg-gray-900">Default Provider</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.id} className="bg-gray-900">
                        {p.name} ({p.providerType})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Model</label>
                  <input
                    type="text"
                    value={currentAgent.model || ''}
                    onChange={e => setCurrentAgent({...currentAgent, model: e.target.value})}
                    className="w-full glass-input px-4 py-2 rounded-lg"
                    placeholder="e.g. gpt-4-turbo"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">System Prompt Template</label>
                <select
                  value={currentAgent.templateId || ''}
                  onChange={e => setCurrentAgent({...currentAgent, templateId: e.target.value || undefined})}
                  className="w-full glass-input px-4 py-2 rounded-lg appearance-none"
                >
                  <option value="" className="bg-gray-900">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id} className="bg-gray-900">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-white/10 pt-6">
                <h3 className="text-sm font-medium text-gray-300 mb-4">Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Temperature</span>
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
                    <label className="text-sm font-medium text-gray-300">Max Tokens</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Agent'
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
