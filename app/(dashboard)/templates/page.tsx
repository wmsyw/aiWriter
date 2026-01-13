'use client';

import { useState, useEffect } from 'react';

interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  defaultValue?: any;
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
  const [previewData, setPreviewData] = useState<Record<string, any>>({});
  const [previewResult, setPreviewResult] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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
      name: 'Untitled Template',
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
      if (!confirm('You have unsaved changes. Discard them?')) return;
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
      alert('Please save the template first to run a preview.');
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

  const updateVariable = (index: number, field: keyof Variable, value: any) => {
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
    alert(`Copied "${tag}" to clipboard! Paste it in the editor.`);
  };

  return (
    <div className="h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 p-4 md:p-8 animate-fade-in">
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="font-semibold text-white">Templates</h2>
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
          ) : templates.map(template => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
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
          ))}
          {templates.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No templates yet.
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
                {isSaving ? 'Saving...' : 'Save Changes'}
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
                placeholder="Write your template here... Use {{ variableName }} for dynamic content."
                spellCheck={false}
              />
            </div>
            <div className="absolute bottom-4 right-4 text-xs text-gray-600 pointer-events-none">
              LiquidJS Syntax Supported
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>Select a template or create a new one</p>
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
                Variables
              </button>
              <button
                onClick={() => setSidebarTab('preview')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  sidebarTab === 'preview' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Preview
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {sidebarTab === 'variables' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-300">Defined Variables</h3>
                    <button 
                      onClick={addVariable}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      + Add New
                    </button>
                  </div>
                  
                  {selectedTemplate.variables?.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No variables defined.</p>
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
                                title="Copy to clipboard"
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
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="array">Array</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-8 pt-4 border-t border-white/10">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">How to use</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Use <code className="bg-white/10 px-1 rounded text-gray-300">{`{{ variableName }}`}</code> to insert variables into your template. 
                      You can also use loops and conditionals like <code className="bg-white/10 px-1 rounded text-gray-300">{`{% if ... %}`}</code>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Test Data</h3>
                  <div className="space-y-3">
                    {selectedTemplate.variables?.map((v) => (
                      <div key={v.name} className="space-y-1">
                        <label className="text-xs text-gray-500 font-mono">{v.name}</label>
                        <input
                          type="text"
                          value={previewData[v.name] || ''}
                          onChange={(e) => setPreviewData({ ...previewData, [v.name]: e.target.value })}
                          className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                          placeholder={`Value for ${v.name}`}
                        />
                      </div>
                    ))}
                    {(!selectedTemplate.variables || selectedTemplate.variables.length === 0) && (
                      <p className="text-xs text-gray-500 italic">No variables to configure.</p>
                    )}
                  </div>
                  
                  <button
                    onClick={handleRunPreview}
                    disabled={isPreviewLoading}
                    className="w-full btn-secondary py-2 rounded-xl text-sm flex items-center justify-center gap-2 mt-4"
                  >
                    {isPreviewLoading ? 'Rendering...' : 'Run Preview'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  
                  {previewResult && (
                    <div className="mt-6 space-y-2">
                      <h3 className="text-sm font-medium text-gray-300">Result</h3>
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
            <p>Select a template to configure variables and preview.</p>
          </div>
        )}
      </div>
    </div>
  );
}
