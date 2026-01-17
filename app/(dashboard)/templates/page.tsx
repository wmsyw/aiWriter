'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { staggerContainer, staggerItem, fadeIn } from '@/app/lib/animations';
import { Button } from '@/app/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/Card';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/Tabs';
import { cn } from '@/app/lib/utils';

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
  const [previewData, setPreviewData] = useState<Record<string, VariableValue>>({});
  const [previewResult, setPreviewResult] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setCharCount(selectedTemplate.content.length);
    }
  }, [selectedTemplate?.content]);

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
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6"
    >
      <Card className="w-full md:w-72 flex-shrink-0 flex flex-col p-0 overflow-hidden bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm rounded-2xl shadow-xl">
        <CardHeader className="p-4 border-b border-white/5 flex flex-row justify-between items-center space-y-0 bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <CardTitle className="text-sm font-semibold tracking-wide text-zinc-100">所有模板</CardTitle>
          </div>
            <Button 
            variant="ghost" 
            size="sm"
            onClick={handleCreateNew}
            className="h-7 w-7 p-0 rounded-full hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors"
            aria-label="新建模板"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-gradient-to-b from-zinc-900/30 to-zinc-950/30">
          <AnimatePresence mode="popLayout">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="p-2">
                  <Skeleton className="h-12 w-full rounded-xl bg-zinc-800/50" />
                </div>
              ))
            ) : templates.length === 0 ? (
               <motion.div variants={fadeIn} className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <svg className="w-10 h-10 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs">暂无模板</span>
              </motion.div>
            ) : (
              templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  variants={staggerItem}
                  layoutId={template.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(draggedIndex === index ? 'opacity-40 scale-95' : '')}
                >
                  <div 
                    onClick={() => handleSelectTemplate(template)}
                    className={cn(
                      "group relative flex items-center p-3 cursor-pointer rounded-xl transition-all duration-200 border",
                      selectedTemplate?.id === template.id
                        ? "bg-emerald-500/5 border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]"
                        : "bg-zinc-800/20 border-transparent hover:bg-zinc-800/60 hover:border-zinc-700/50"
                    )}
                  >
                    {selectedTemplate?.id === template.id && (
                      <motion.div 
                        layoutId="active-pill"
                        className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-500 rounded-r-full" 
                      />
                    )}

                    <div className="mr-3 text-zinc-600 group-hover:text-zinc-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v.01M12 12v.01M12 18v.01M12 6v.01M12 12v.01M12 18v.01" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6v.01M8 12v.01M8 18v.01M8 6v.01M8 12v.01M8 18v.01" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0 ml-1">
                      <div className={cn(
                        "font-medium truncate text-sm transition-colors",
                        selectedTemplate?.id === template.id ? "text-emerald-400" : "text-zinc-300 group-hover:text-zinc-100"
                      )}>
                        {template.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-900/50 px-1.5 py-0.5 rounded border border-white/5">
                          {template.variables?.length || 0} 变量
                        </span>
                        <span className="text-[10px] text-zinc-600 truncate">
                          {new Date(template.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col p-0 relative overflow-hidden bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm rounded-2xl shadow-xl">
        {selectedTemplate ? (
          <>
            <CardHeader className="h-14 p-0 px-6 border-b border-white/5 flex flex-row items-center justify-between bg-zinc-900/30 gap-6">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="hidden md:flex items-center gap-2 text-zinc-500 select-none flex-shrink-0">
                  <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-70">模板</span>
                  <span className="text-zinc-700 font-light">/</span>
                </div>
                <Input
                  type="text"
                  value={selectedTemplate.name}
                  onChange={(e) => {
                    setSelectedTemplate({ ...selectedTemplate, name: e.target.value });
                    setHasChanges(true);
                  }}
                  className="text-sm font-medium bg-transparent border-transparent hover:border-white/5 focus:border-emerald-500/50 focus:bg-zinc-900/50 h-9 px-3 w-full max-w-md text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 rounded-lg"
                  placeholder="模板名称"
                />
              </div>
              <div className="flex items-center gap-5">
                <div className={cn(
                  "flex items-center gap-2 text-[10px] font-medium transition-all duration-300",
                  hasChanges ? "text-amber-500 opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
                )}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span>未保存更改</span>
                </div>

                <div className="h-4 w-px bg-white/5 hidden sm:block" />

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  isLoading={isSaving}
                  className={cn(
                    "h-8 text-xs font-medium px-5 transition-all duration-200",
                    hasChanges 
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5" 
                      : "bg-zinc-800 text-zinc-500 hover:bg-zinc-800 cursor-not-allowed"
                  )}
                >
                  {isSaving ? '保存中...' : '保存'}
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 p-0 relative flex flex-col min-h-0">
              <div className="flex-1 relative flex">
                <div className="w-12 bg-zinc-950/30 border-r border-white/5 hidden sm:flex flex-col items-end py-6 px-3 text-zinc-700 font-mono text-xs select-none">
                  {[...Array(20)].map((_, i) => <div key={i} className="leading-relaxed">{i + 1}</div>)}
                  <div className="text-zinc-800">...</div>
                </div>

                <Textarea
                  value={selectedTemplate.content}
                  onChange={(e) => {
                    setSelectedTemplate({ ...selectedTemplate, content: e.target.value });
                    setHasChanges(true);
                  }}
                  className="flex-1 w-full h-full bg-transparent border-none focus-visible:ring-0 p-6 font-mono text-sm resize-none leading-relaxed custom-scrollbar text-zinc-300 placeholder:text-zinc-700"
                  placeholder="在此编写模板内容... 使用 {{ 变量名 }} 插入动态内容。"
                  spellCheck={false}
                />
              </div>

              <div className="h-8 border-t border-white/5 bg-zinc-950/30 px-4 flex items-center justify-between text-[10px] text-zinc-500 select-none">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-1.5 text-amber-500/80">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="font-medium">LiquidJS 已启用</span>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                  <span>{charCount} 字符</span>
                  <span className="hidden sm:inline">UTF-8</span>
                </div>
              </div>
            </CardContent>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <div className="w-20 h-20 rounded-full bg-zinc-800/50 flex items-center justify-center mb-6 border border-white/5">
               <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
               </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">准备写作</h3>
            <p className="max-w-xs text-center text-sm text-zinc-600">
              从左侧选择现有模板或创建一个新模板以开始。
            </p>
          </div>
        )}
      </Card>

      <Card className="w-full md:w-80 flex-shrink-0 flex flex-col p-0 overflow-hidden bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm rounded-2xl shadow-xl">
        {selectedTemplate ? (
          <Tabs defaultValue="variables" className="flex-1 flex flex-col h-full">
            <div className="px-1 pt-1 bg-zinc-900/30 border-b border-white/5">
              <TabsList variant="boxed" className="w-full bg-transparent p-0 gap-1 h-10">
                <TabsTrigger 
                  value="variables" 
                  variant="boxed" 
                  className="flex-1 rounded-t-lg border-b-2 border-transparent data-[state=active]:bg-zinc-800/50 data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400 text-xs font-medium text-zinc-500"
                >
                  变量配置
                </TabsTrigger>
                <TabsTrigger 
                  value="preview" 
                  variant="boxed" 
                  className="flex-1 rounded-t-lg border-b-2 border-transparent data-[state=active]:bg-zinc-800/50 data-[state=active]:border-amber-500 data-[state=active]:text-amber-400 text-xs font-medium text-zinc-500"
                >
                  预览结果
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="variables" className="flex-1 overflow-y-auto p-4 custom-scrollbar mt-0 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">参数列表</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={addVariable}
                  className="h-6 px-2 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                >
                  + 添加变量
                </Button>
              </div>
              
              {selectedTemplate.variables?.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-8 flex flex-col items-center text-center">
                  <span className="text-xs text-zinc-600 mb-2">未定义变量</span>
                  <Button variant="ghost" size="sm" onClick={addVariable} className="h-7 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200">
                    创建一个
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedTemplate.variables?.map((variable, idx) => (
                    <motion.div 
                      key={idx} 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group bg-zinc-950/40 rounded-xl p-3 space-y-3 border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-zinc-600 font-mono mb-1 block uppercase">变量名</label>
                          <Input
                            type="text"
                            value={variable.name}
                            onChange={(e) => updateVariable(idx, 'name', e.target.value)}
                            className="h-7 text-xs font-mono font-medium bg-zinc-900/50 border-zinc-800 focus:border-emerald-500/30 text-emerald-400"
                            placeholder="var_name"
                          />
                        </div>
                        <div className="flex gap-1 pt-4">
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => insertVariableToContent(variable.name)}
                            title="复制标签"
                            className="h-7 w-7 p-0 text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </Button>
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariable(idx)}
                            className="h-7 w-7 p-0 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-[10px] text-zinc-600 font-mono mb-1 block uppercase">类型</label>
                        <div className="relative">
                          <select
                            value={variable.type}
                            onChange={(e) => updateVariable(idx, 'type', e.target.value)}
                            className="appearance-none bg-zinc-900/50 w-full text-xs rounded-lg px-2 py-1.5 outline-none text-zinc-300 border border-zinc-800 focus:border-emerald-500/30 transition-colors"
                          >
                            <option value="string">文本 (String)</option>
                            <option value="number">数字 (Number)</option>
                            <option value="boolean">布尔 (Boolean)</option>
                            <option value="array">数组 (Array)</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                             <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              
              <div className="mt-8 pt-4 border-t border-dashed border-zinc-800">
                <div className="flex items-center gap-2 mb-2">
                   <div className="w-1 h-1 rounded-full bg-amber-500"></div>
                   <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">使用提示</h3>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                   <p className="text-xs text-zinc-500 leading-relaxed">
                     使用 <code className="bg-amber-500/10 text-amber-500 px-1 rounded mx-0.5">{`{{ name }}`}</code> 语法插入变量。
                     支持逻辑控制块，如 <code className="bg-amber-500/10 text-amber-500 px-1 rounded mx-0.5">{`{% if %}`}</code>。
                   </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 custom-scrollbar mt-0 space-y-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">测试数据</h3>
              <div className="space-y-3">
                {selectedTemplate.variables?.map((v) => (
                  <div key={v.name} className="space-y-1">
                    <label className="text-xs text-zinc-500 font-mono flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"></span>
                       {v.name}
                    </label>
                    <Input
                      type="text"
                      value={String(previewData[v.name] ?? '')}
                      onChange={(e) => setPreviewData({ ...previewData, [v.name]: e.target.value })}
                      className="h-9 text-sm bg-zinc-950/50 border-zinc-800 text-zinc-300 focus:border-amber-500/50"
                      placeholder={`输入 ${v.name} 的值`}
                    />
                  </div>
                ))}
                {(!selectedTemplate.variables || selectedTemplate.variables.length === 0) && (
                  <p className="text-xs text-zinc-600 italic text-center py-2">无需配置变量</p>
                )}
              </div>
              
              <Button
                variant="secondary"
                onClick={handleRunPreview}
                disabled={isPreviewLoading}
                isLoading={isPreviewLoading}
                className="w-full mt-4 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40"
                rightIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                生成预览
              </Button>
              
              {previewResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 space-y-2"
                >
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">输出结果</h3>
                  <div className="bg-zinc-950 rounded-xl p-4 text-sm text-zinc-300 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-zinc-800 custom-scrollbar shadow-inner">
                    {previewResult}
                  </div>
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center opacity-40">
             <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 mb-4 transform rotate-12 flex items-center justify-center">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
             </div>
            <p className="text-sm">在此配置变量并预览结果</p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
