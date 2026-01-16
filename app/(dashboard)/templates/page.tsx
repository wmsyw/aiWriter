'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { staggerContainer, staggerItem, fadeIn } from '@/app/lib/animations';
import { Button } from '@/app/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/Card';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/Tabs';
import { Select } from '@/app/components/ui/Select';
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
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 p-4 md:p-8"
    >
      <Card className="w-full md:w-64 flex-shrink-0 flex flex-col p-0 overflow-hidden">
        <CardHeader className="p-4 border-b border-white/10 flex flex-row justify-between items-center space-y-0">
          <CardTitle className="text-base">模板列表</CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleCreateNew}
            className="h-8 w-8 p-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="space-y-2 p-2">
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ))
            ) : templates.length === 0 ? (
               <motion.div variants={fadeIn} className="text-center py-8 text-gray-500 text-sm">
                暂无模板
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
                  className={cn(draggedIndex === index ? 'opacity-50' : '')}
                >
                  <Card 
                    variant="interactive"
                    onClick={() => handleSelectTemplate(template)}
                    className={cn(
                      "flex items-center p-3 cursor-pointer group",
                      selectedTemplate?.id === template.id
                        ? "bg-indigo-500/10 border-indigo-500/50"
                        : "border-transparent"
                    )}
                  >
                    <div className="mr-3 text-gray-600 group-hover:text-gray-400 cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className={cn(
                        "font-medium truncate text-sm transition-colors",
                        selectedTemplate?.id === template.id ? "text-indigo-400" : "text-gray-300"
                      )}>
                        {template.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {new Date(template.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col p-0 relative overflow-hidden">
        {selectedTemplate ? (
          <>
            <CardHeader className="p-4 border-b border-white/10 flex flex-row items-center gap-4 space-y-0">
              <Input
                type="text"
                value={selectedTemplate.name}
                onChange={(e) => {
                  setSelectedTemplate({ ...selectedTemplate, name: e.target.value });
                  setHasChanges(true);
                }}
                className="text-lg font-bold bg-transparent border-transparent hover:border-white/10 focus:border-indigo-500/50 h-auto py-2 px-3"
                placeholder="Template Name"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                isLoading={isSaving}
              >
                {isSaving ? '保存中...' : '保存'}
              </Button>
            </CardHeader>
            
            <CardContent className="flex-1 p-0 relative">
              <Textarea
                value={selectedTemplate.content}
                onChange={(e) => {
                  setSelectedTemplate({ ...selectedTemplate, content: e.target.value });
                  setHasChanges(true);
                }}
                className="w-full h-full bg-transparent border-none focus-visible:ring-0 p-4 font-mono text-sm resize-none leading-relaxed custom-scrollbar text-gray-300"
                placeholder="在此编写模板内容... 使用 {{ 变量名 }} 插入动态内容。"
                spellCheck={false}
              />
            </CardContent>
            <div className="absolute bottom-4 right-4 text-xs text-gray-600 pointer-events-none bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
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
      </Card>

      <Card className="w-full md:w-80 flex-shrink-0 flex flex-col p-0 overflow-hidden">
        {selectedTemplate ? (
          <Tabs defaultValue="variables" className="flex-1 flex flex-col h-full">
            <TabsList variant="boxed" className="w-full justify-start rounded-none p-0 bg-transparent">
              <TabsTrigger value="variables" variant="boxed" className="flex-1 rounded-none data-[state=active]:bg-transparent">
                变量
              </TabsTrigger>
              <TabsTrigger value="preview" variant="boxed" className="flex-1 rounded-none data-[state=active]:bg-transparent">
                预览
              </TabsTrigger>
            </TabsList>

            <TabsContent value="variables" className="flex-1 overflow-y-auto p-4 custom-scrollbar mt-0 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-300">已定义变量</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={addVariable}
                  className="text-indigo-400 hover:text-indigo-300 h-6 px-2 text-xs"
                >
                  + 添加
                </Button>
              </div>
              
              {selectedTemplate.variables?.length === 0 ? (
                <p className="text-xs text-gray-500 italic text-center py-4">暂无变量</p>
              ) : (
                <div className="space-y-3">
                  {selectedTemplate.variables?.map((variable, idx) => (
                    <motion.div 
                      key={idx} 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white/5 rounded-xl p-3 space-y-2 border border-white/5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <Input
                          type="text"
                          value={variable.name}
                          onChange={(e) => updateVariable(idx, 'name', e.target.value)}
                          className="h-8 text-xs font-mono bg-black/20 border-white/5"
                          placeholder="var_name"
                        />
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => insertVariableToContent(variable.name)}
                            title="复制到剪贴板"
                            className="h-8 w-8 p-0 text-gray-500 hover:text-white"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </Button>
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariable(idx)}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-red-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </Button>
                        </div>
                      </div>
                      <select
                        value={variable.type}
                        onChange={(e) => updateVariable(idx, 'type', e.target.value)}
                        className="bg-black/20 w-full text-xs rounded-lg px-2 py-1.5 outline-none text-gray-400 border border-white/5 focus:border-indigo-500/30 transition-colors"
                      >
                        <option value="string">字符串</option>
                        <option value="number">数字</option>
                        <option value="boolean">布尔值</option>
                        <option value="array">数组</option>
                      </select>
                    </motion.div>
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
            </TabsContent>

            <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 custom-scrollbar mt-0 space-y-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">测试数据</h3>
              <div className="space-y-3">
                {selectedTemplate.variables?.map((v) => (
                  <div key={v.name} className="space-y-1">
                    <label className="text-xs text-gray-500 font-mono">{v.name}</label>
                    <Input
                      type="text"
                      value={String(previewData[v.name] ?? '')}
                      onChange={(e) => setPreviewData({ ...previewData, [v.name]: e.target.value })}
                      className="h-9 text-sm"
                      placeholder={`${v.name} 的值`}
                    />
                  </div>
                ))}
                {(!selectedTemplate.variables || selectedTemplate.variables.length === 0) && (
                  <p className="text-xs text-gray-500 italic text-center py-2">暂无变量可配置</p>
                )}
              </div>
              
              <Button
                variant="secondary"
                onClick={handleRunPreview}
                disabled={isPreviewLoading}
                isLoading={isPreviewLoading}
                className="w-full mt-4"
                rightIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                运行预览
              </Button>
              
              {previewResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 space-y-2"
                >
                  <h3 className="text-sm font-medium text-gray-300">渲染结果</h3>
                  <div className="bg-black/30 rounded-xl p-4 text-sm text-gray-300 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-white/10 custom-scrollbar">
                    {previewResult}
                  </div>
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center opacity-50">
            <p>选择模板以配置变量和预览</p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
