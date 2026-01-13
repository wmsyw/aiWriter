'use client';

import { useState, useEffect } from 'react';

type VariableValue = string | number | boolean | string[];

interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  defaultValue?: VariableValue;
}

interface Template {
  id: string;
  name: string;
  content: string;
  variables: Variable[];
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'variables' | 'preview'>('variables');
  const [previewData, setPreviewData] = useState<Record<string, VariableValue>>({});
  const [previewResult, setPreviewResult] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newTemplate: Template = {
      id: 'new',
      name: '未命名模板',
      content: '',
      variables: [],
      updatedAt: new Date().toISOString(),
    };
    setSelectedTemplate(newTemplate);
    setHasChanges(true);
    setPreviewResult('');
  };

  const handleSelectTemplate = (template: Template) => {
    if (hasChanges) {
      if (!confirm('有未保存的更改，确定要放弃吗？')) return;
    }
    setSelectedTemplate(JSON.parse(JSON.stringify(template)));
    setHasChanges(false);
    setPreviewResult('');
    
    const initialPreview: Record<string, any> = {};
    template.variables?.forEach(v => {
      initialPreview[v.name] = v.defaultValue || '';
    });
    setPreviewData(initialPreview);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    try {
      setIsSaving(true);
      const isNew = selectedTemplate.id === 'new';
      const url = isNew ? '/api/templates' : `/api/templates/${selectedTemplate.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedTemplate.name,
          content: selectedTemplate.content,
          variables: selectedTemplate.variables,
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        setTemplates(prev => isNew ? [...prev, saved] : prev.map(t => t.id === saved.id ? saved : t));
        setSelectedTemplate(saved);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunPreview = async () => {
    if (!selectedTemplate || selectedTemplate.id === 'new') {
      alert('请先保存模板后再进行预览。');
      return;
    }

    try {
      setIsPreviewLoading(true);
      const res = await fetch(`/api/templates/${selectedTemplate.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: previewData }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewResult(data.rendered);
      } else {
        const err = await res.json();
        setPreviewResult(`Error: ${err.error || 'Failed to render'}`);
      }
    } catch (error) {
      console.error('Preview failed:', error);
      setPreviewResult('Error: Failed to connect to server');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const addVariable = () => {
    if (!selectedTemplate) return;
    const newVar: Variable = {
      name: `variable_${selectedTemplate.variables.length + 1}`,
      type: 'string',
      description: '',
      required: false
    };
    setSelectedTemplate({
      ...selectedTemplate,
      variables: [...(selectedTemplate.variables || []), newVar]
    });
    setHasChanges(true);
  };

  const updateVariable = (index: number, field: keyof Variable, value: VariableValue) => {
    if (!selectedTemplate) return;
    const newVars = [...(selectedTemplate.variables || [])];
    newVars[index] = { ...newVars[index], [field]: value };
    setSelectedTemplate({ ...selectedTemplate, variables: newVars });
    setHasChanges(true);
  };

  const removeVariable = (index: number) => {
    if (!selectedTemplate) return;
    const newVars = [...(selectedTemplate.variables || [])];
    newVars.splice(index, 1);
    setSelectedTemplate({ ...selectedTemplate, variables: newVars });
    setHasChanges(true);
  };

  const insertVariableToContent = (varName: string) => {
    if (!selectedTemplate) return;
    const tag = `{{ ${varName} }}`;
    navigator.clipboard.writeText(tag);
    alert(`已复制 "${tag}" 到剪贴板，请粘贴到编辑器中。`);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newTemplates = [...templates];
    const draggedItem = newTemplates[draggedIndex];
    newTemplates.splice(draggedIndex, 1);
    newTemplates.splice(index, 0, draggedItem);
    setTemplates(newTemplates);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);
    
    const orderData = templates.map((t, i) => ({ id: t.id, order: i }));
    try {
      await fetch('/api/templates/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderData }),
      });
    } catch (error) {
      console.error('Failed to save order:', error);
      fetchTemplates();
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 p-4 md:p-8 animate-fade-in">
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="font-semibold text-white">模板列表</h2>
          <button 
            onClick={handleCreateNew}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            [1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
          ) : templates.map((template, index) => (
            <div
              key={template.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 rounded-xl transition-all ${
                draggedIndex === index ? 'opacity-50' : ''
              }`}
            >
              <div className="p-1 text-gray-600 cursor-grab active:cursor-grabbing">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              </div>
              <button
                onClick={() => handleSelectTemplate(template)}
                className={`flex-1 text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                  selectedTemplate?.id === template.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="font-medium truncate">{template.name}</div>
                <div className="text-xs opacity-60 truncate">
                  {new Date(template.updatedAt).toLocaleDateString()}
                </div>
              </button>
            </div>
          ))}
          {templates.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500 text-sm">
              暂无模板
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col glass-card rounded-2xl overflow-hidden relative">
        {selectedTemplate ? (
          <>
            <div className="p-4 border-b border-white/10 flex items-center gap-4">
              <input
                type="text"
                value={selectedTemplate.name}
                onChange={(e) => {
                  setSelectedTemplate({ ...selectedTemplate, name: e.target.value });
                  setHasChanges(true);
                }}
                className="bg-transparent text-xl font-bold text-white outline-none flex-1 placeholder-gray-600"
                placeholder="Template Name"
              />
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={`btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2 ${
                  (!hasChanges || isSaving) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
            
            <div className="flex-1 p-4 relative">
              <textarea
                value={selectedTemplate.content}
                onChange={(e) => {
                  setSelectedTemplate({ ...selectedTemplate, content: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full h-full bg-transparent text-gray-300 font-mono text-sm resize-none outline-none focus:ring-0 leading-relaxed custom-scrollbar"
                placeholder="在此编写模板内容... 使用 {{ 变量名 }} 插入动态内容。"
                spellCheck={false}
              />
            </div>
            <div className="absolute bottom-4 right-4 text-xs text-gray-600 pointer-events-none">
              支持 LiquidJS 语法
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>选择一个模板或创建新模板</p>
          </div>
        )}
      </div>

      <div className="w-full md:w-80 flex-shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
        {selectedTemplate ? (
          <>
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setSidebarTab('variables')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  sidebarTab === 'variables' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                变量
              </button>
              <button
                onClick={() => setSidebarTab('preview')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  sidebarTab === 'preview' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                预览
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {sidebarTab === 'variables' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-300">已定义变量</h3>
                    <button 
                      onClick={addVariable}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      + 添加
                    </button>
                  </div>
                  
                  {selectedTemplate.variables?.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">暂无变量</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedTemplate.variables?.map((variable, idx) => (
                        <div key={idx} className="bg-white/5 rounded-xl p-3 space-y-2 border border-white/5">
                          <div className="flex justify-between items-start">
                            <input
                              type="text"
                              value={variable.name}
                              onChange={(e) => updateVariable(idx, 'name', e.target.value)}
                              className="bg-transparent text-sm font-mono text-white outline-none w-full"
                              placeholder="var_name"
                            />
                            <div className="flex gap-2">
                              <button 
                                onClick={() => insertVariableToContent(variable.name)}
                                title="复制到剪贴板"
                                className="text-gray-500 hover:text-white"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                              </button>
                              <button 
                                onClick={() => removeVariable(idx)}
                                className="text-gray-500 hover:text-red-400"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <select
                            value={variable.type}
                            onChange={(e) => updateVariable(idx, 'type', e.target.value)}
                            className="bg-black/20 w-full text-xs rounded-lg px-2 py-1 outline-none text-gray-400 border border-white/5"
                          >
                            <option value="string">字符串</option>
                            <option value="number">数字</option>
                            <option value="boolean">布尔值</option>
                            <option value="array">数组</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-8 pt-4 border-t border-white/10">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">使用说明</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      使用 <code className="bg-white/10 px-1 rounded text-gray-300">{`{{ 变量名 }}`}</code> 在模板中插入变量。
                      也可以使用循环和条件语句，如 <code className="bg-white/10 px-1 rounded text-gray-300">{`{% if ... %}`}</code>。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">测试数据</h3>
                  <div className="space-y-3">
                    {selectedTemplate.variables?.map((v) => (
                      <div key={v.name} className="space-y-1">
                        <label className="text-xs text-gray-500 font-mono">{v.name}</label>
                        <input
                          type="text"
                          value={String(previewData[v.name] ?? '')}
                          onChange={(e) => setPreviewData({ ...previewData, [v.name]: e.target.value })}
                          className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                          placeholder={`${v.name} 的值`}
                        />
                      </div>
                    ))}
                    {(!selectedTemplate.variables || selectedTemplate.variables.length === 0) && (
                      <p className="text-xs text-gray-500 italic">暂无变量可配置</p>
                    )}
                  </div>
                  
                  <button
                    onClick={handleRunPreview}
                    disabled={isPreviewLoading}
                    className="w-full btn-secondary py-2 rounded-xl text-sm flex items-center justify-center gap-2 mt-4"
                  >
                    {isPreviewLoading ? '渲染中...' : '运行预览'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  
                  {previewResult && (
                    <div className="mt-6 space-y-2">
                      <h3 className="text-sm font-medium text-gray-300">渲染结果</h3>
                      <div className="bg-black/30 rounded-xl p-4 text-sm text-gray-300 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-white/10">
                        {previewResult}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center opacity-50">
            <p>选择模板以配置变量和预览</p>
          </div>
        )}
      </div>
    </div>
  );
}
