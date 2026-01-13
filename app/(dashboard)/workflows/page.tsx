'use client';

import { useState, useEffect } from 'react';
import { BUILT_IN_AGENTS } from '@/src/constants/agents';

interface WorkflowStep {
  id?: string;
  agentKey: string;
  order: number;
  config?: Record<string, unknown>;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  updatedAt: string;
}

const AGENT_OPTIONS = Object.entries(BUILT_IN_AGENTS).map(([key, agent]) => ({
  key,
  name: agent.name,
  description: agent.description,
  category: agent.category,
}));

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch('/api/workflows');
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error('Failed to fetch workflows', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingWorkflow(null);
    setIsModalOpen(true);
  };

  const handleEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此工作流吗？')) return;
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkflows(workflows.filter(w => w.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete workflow', error);
    }
  };

  const handleSave = async (data: { name: string; description?: string; steps: WorkflowStep[] }) => {
    try {
      const url = editingWorkflow ? `/api/workflows/${editingWorkflow.id}` : '/api/workflows';
      const method = editingWorkflow ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        fetchWorkflows();
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save workflow', error);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient mb-2">工作流</h1>
          <p className="text-gray-400">将多个 Agent 编排成自动化流程</p>
        </div>
        <button onClick={handleCreate} className="btn-primary px-6 py-2.5 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          创建工作流
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => <div key={i} className="glass-card h-40 rounded-2xl animate-pulse" />)}
        </div>
      ) : workflows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workflows.map(workflow => (
                <div key={workflow.id} className="glass-card p-6 rounded-2xl group hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2 z-10">
                    <button
                      onClick={() => handleEdit(workflow)}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white backdrop-blur-sm transition-colors"
                      title="编辑"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 backdrop-blur-sm transition-colors"
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-6 relative z-0">
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">{workflow.name}</h3>
                    {workflow.description && (
                      <p className="text-sm text-gray-400 line-clamp-2">{workflow.description}</p>
                    )}
                  </div>

                  <div className="relative z-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">执行流程</span>
                      <div className="h-px flex-1 bg-white/5"></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {workflow.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-sm text-gray-300 group-hover:border-indigo-500/20 group-hover:bg-indigo-500/5 transition-all">
                            <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <span>{BUILT_IN_AGENTS[step.agentKey]?.name || step.agentKey}</span>
                          </div>
                          {idx < workflow.steps.length - 1 && (
                            <svg className="w-4 h-4 text-gray-600 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">暂无工作流</h3>
          <p className="text-gray-400 mb-6">创建工作流来自动化你的写作流程</p>
          <button onClick={handleCreate} className="btn-primary px-6 py-2.5 rounded-xl">
            创建第一个工作流
          </button>
        </div>
      )}

      {isModalOpen && (
        <WorkflowModal
          workflow={editingWorkflow}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function WorkflowModal({
  workflow,
  onClose,
  onSave,
}: {
  workflow: Workflow | null;
  onClose: () => void;
  onSave: (data: { name: string; description?: string; steps: WorkflowStep[] }) => Promise<void>;
}) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps || [{ agentKey: 'CHAPTER_WRITER', order: 0 }]
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleAddStep = () => {
    setSteps([...steps, { agentKey: 'REVIEWER', order: steps.length }]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(newSteps.map((s, i) => ({ ...s, order: i })));
  };

  const handleStepChange = (index: number, agentKey: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], agentKey };
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || steps.length === 0) return;

    setIsSaving(true);
    await onSave({ name, description, steps });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="glass-card w-full max-w-2xl p-8 rounded-2xl relative z-10 animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gradient mb-6">
          {workflow ? '编辑工作流' : '创建工作流'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="glass-input w-full px-4 py-2 rounded-xl"
              placeholder="例如：长篇章节生成流程"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">描述</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="glass-input w-full px-4 py-2 rounded-xl"
              placeholder="可选描述..."
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">执行步骤</label>
              <button
                type="button"
                onClick={handleAddStep}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg"
              >
                + 添加步骤
              </button>
            </div>

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <select
                    value={step.agentKey}
                    onChange={e => handleStepChange(idx, e.target.value)}
                    className="glass-input flex-1 px-4 py-2 rounded-xl"
                  >
                    {AGENT_OPTIONS.map(agent => (
                      <option key={agent.key} value={agent.key} className="bg-[#1a1a2e]">
                        {agent.name} - {agent.description?.slice(0, 30)}...
                      </option>
                    ))}
                  </select>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(idx)}
                      className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2.5 rounded-xl">
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary px-6 py-2.5 rounded-xl flex items-center gap-2"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
