'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/app/components/ui/Toast';
import {
  NEW_TEMPLATE_ID,
  addVariableToTemplate,
  buildPreviewData,
  cloneTemplate,
  createTemplateDraft,
  getTemplateCharCount,
  isPersistedTemplate,
  reorderTemplatesByIndex,
  removeVariableFromTemplate,
  toTemplatePayload,
  updateVariableInTemplate,
  type TemplateItem,
  type TemplateVariable,
  type TemplateVariableValue,
} from '@/src/shared/template-editor';

interface UseTemplateEditorResult {
  templates: TemplateItem[];
  selectedTemplate: TemplateItem | null;
  isLoading: boolean;
  previewData: Record<string, TemplateVariableValue>;
  previewResult: string;
  isPreviewLoading: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  discardConfirmOpen: boolean;
  discardConfirmMessage: string;
  draggedIndex: number | null;
  charCount: number;
  handleCreateNew: () => void;
  handleSelectTemplate: (template: TemplateItem) => void;
  handleSave: () => Promise<void>;
  handleRunPreview: () => Promise<void>;
  addVariable: () => void;
  updateVariable: (
    index: number,
    field: keyof TemplateVariable,
    value: TemplateVariable[keyof TemplateVariable]
  ) => void;
  removeVariable: (index: number) => void;
  insertVariableToContent: (varName: string) => void;
  handleDragStart: (index: number) => void;
  handleDragOver: (index: number) => void;
  handleDragEnd: () => Promise<void>;
  updateTemplateName: (name: string) => void;
  updateTemplateContent: (content: string) => void;
  updatePreviewValue: (key: string, value: TemplateVariableValue) => void;
  confirmDiscardChanges: () => void;
  cancelDiscardChanges: () => void;
}

type PendingTemplateAction =
  | { type: 'create' }
  | { type: 'select'; template: TemplateItem };

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();

    if (typeof data?.error === 'string') {
      return data.error;
    }

    if (Array.isArray(data?.error)) {
      return data.error.map((item: { message?: string }) => item.message || '').filter(Boolean).join('；') || fallback;
    }

    if (typeof data?.error === 'object' && data?.error !== null) {
      if (Array.isArray((data.error as { formErrors?: string[] }).formErrors)) {
        const formError = (data.error as { formErrors: string[] }).formErrors.join('；');
        if (formError) return formError;
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function useTemplateEditor(): UseTemplateEditorResult {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [previewData, setPreviewData] = useState<Record<string, TemplateVariableValue>>({});
  const [previewResult, setPreviewResult] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingTemplateAction | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const charCount = useMemo(() => getTemplateCharCount(selectedTemplate), [selectedTemplate]);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/templates');
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, '加载模板失败'));
      }

      const data = (await res.json()) as TemplateItem[];
      setTemplates(data);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const executeAction = useCallback((action: PendingTemplateAction) => {
    if (action.type === 'create') {
      const newTemplate = createTemplateDraft();
      setSelectedTemplate(newTemplate);
      setPreviewData({});
      setPreviewResult('');
      setHasChanges(true);
      return;
    }

    const cloned = cloneTemplate(action.template);
    setSelectedTemplate(cloned);
    setPreviewData(buildPreviewData(cloned.variables));
    setPreviewResult('');
    setHasChanges(false);
  }, []);

  const requestAction = useCallback((action: PendingTemplateAction) => {
    if (!hasChanges) {
      executeAction(action);
      return;
    }
    setPendingAction(action);
  }, [executeAction, hasChanges]);

  const handleCreateNew = useCallback(() => {
    requestAction({ type: 'create' });
  }, [requestAction]);

  const handleSelectTemplate = useCallback((template: TemplateItem) => {
    requestAction({ type: 'select', template });
  }, [requestAction]);

  const confirmDiscardChanges = useCallback(() => {
    if (!pendingAction) return;
    executeAction(pendingAction);
    setPendingAction(null);
  }, [executeAction, pendingAction]);

  const cancelDiscardChanges = useCallback(() => {
    setPendingAction(null);
  }, []);

  const updateTemplateName = useCallback((name: string) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      if (prev.name === name) return prev;
      setHasChanges(true);
      return { ...prev, name };
    });
  }, []);

  const updateTemplateContent = useCallback((content: string) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;
      if (prev.content === content) return prev;
      setHasChanges(true);
      return { ...prev, content };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedTemplate) return;

    try {
      setIsSaving(true);
      const isNew = selectedTemplate.id === NEW_TEMPLATE_ID;
      const url = isNew ? '/api/templates' : `/api/templates/${selectedTemplate.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toTemplatePayload(selectedTemplate)),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, '保存模板失败'));
      }

      const saved = (await res.json()) as TemplateItem;
      const cloned = cloneTemplate(saved);

      setTemplates((prev) => (isNew ? [...prev, cloned] : prev.map((template) => (template.id === cloned.id ? cloned : template))));
      setSelectedTemplate(cloned);
      setPreviewData((prev) => {
        const defaults = buildPreviewData(cloned.variables);
        return { ...defaults, ...prev };
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({
        variant: 'error',
        title: '保存模板失败',
        description: error instanceof Error ? error.message : '保存模板失败',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedTemplate, toast]);

  const handleRunPreview = useCallback(async () => {
    if (!selectedTemplate || !isPersistedTemplate(selectedTemplate)) {
      toast({
        variant: 'warning',
        description: '请先保存模板后再进行预览。',
      });
      return;
    }

    try {
      setIsPreviewLoading(true);
      const res = await fetch(`/api/templates/${selectedTemplate.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: previewData }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Failed to render');
        setPreviewResult(`Error: ${message}`);
        return;
      }

      const data = (await res.json()) as { rendered: string };
      setPreviewResult(data.rendered || '');
    } catch (error) {
      console.error('Preview failed:', error);
      setPreviewResult('Error: Failed to connect to server');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [selectedTemplate, previewData, toast]);

  const addVariable = useCallback(() => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;

      const nextVariables = addVariableToTemplate(prev.variables || []);
      const addedVariable = nextVariables[nextVariables.length - 1];
      if (addedVariable) {
        setPreviewData((prevPreviewData) => ({
          ...prevPreviewData,
          [addedVariable.name]: addedVariable.defaultValue ?? '',
        }));
      }
      setHasChanges(true);

      return { ...prev, variables: nextVariables };
    });
  }, []);

  const updateVariable = useCallback((index: number, field: keyof TemplateVariable, value: TemplateVariable[keyof TemplateVariable]) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;

      const currentVariables = prev.variables || [];
      const previousName = currentVariables[index]?.name;
      const nextVariables = updateVariableInTemplate(currentVariables, index, field, value);
      if (nextVariables === currentVariables) {
        return prev;
      }

      if (field === 'name' && typeof value === 'string' && previousName && previousName !== value) {
        setPreviewData((prevPreviewData) => {
          const nextPreviewData = { ...prevPreviewData };
          if (Object.prototype.hasOwnProperty.call(nextPreviewData, previousName)) {
            nextPreviewData[value] = nextPreviewData[previousName] as TemplateVariableValue;
            delete nextPreviewData[previousName];
          } else if (!Object.prototype.hasOwnProperty.call(nextPreviewData, value)) {
            nextPreviewData[value] = '';
          }
          return nextPreviewData;
        });
      }

      setHasChanges(true);
      return { ...prev, variables: nextVariables };
    });
  }, []);

  const removeVariable = useCallback((index: number) => {
    setSelectedTemplate((prev) => {
      if (!prev) return prev;

      const currentVariables = prev.variables || [];
      const variableName = currentVariables[index]?.name;
      const nextVariables = removeVariableFromTemplate(currentVariables, index);
      if (nextVariables === currentVariables) {
        return prev;
      }

      if (variableName) {
        setPreviewData((prevPreviewData) => {
          const nextPreviewData = { ...prevPreviewData };
          delete nextPreviewData[variableName];
          return nextPreviewData;
        });
      }

      setHasChanges(true);
      return { ...prev, variables: nextVariables };
    });
  }, []);

  const insertVariableToContent = useCallback((varName: string) => {
    const tag = `{{ ${varName} }}`;
    void navigator.clipboard.writeText(tag).catch((error) => {
      console.error('Failed to copy variable tag:', error);
    });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setTemplates((prev) => {
      if (draggedIndex === null) return prev;
      const reordered = reorderTemplatesByIndex(prev, draggedIndex, index);
      if (reordered === prev) return prev;
      setDraggedIndex(index);
      return reordered;
    });
  }, [draggedIndex]);

  const handleDragEnd = useCallback(async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);

    const orderData = templates.map((template, index) => ({ id: template.id, order: index }));

    try {
      const res = await fetch('/api/templates/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderData }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, '保存排序失败'));
      }
    } catch (error) {
      console.error('Failed to save order:', error);
      void fetchTemplates();
    }
  }, [draggedIndex, templates, fetchTemplates]);

  const updatePreviewValue = useCallback((key: string, value: TemplateVariableValue) => {
    setPreviewData((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    templates,
    selectedTemplate,
    isLoading,
    previewData,
    previewResult,
    isPreviewLoading,
    isSaving,
    hasChanges,
    discardConfirmOpen: pendingAction !== null,
    discardConfirmMessage:
      pendingAction?.type === 'select'
        ? `当前模板有未保存更改，确定放弃并切换到「${pendingAction.template.name}」吗？`
        : '当前模板有未保存更改，确定放弃并新建模板吗？',
    draggedIndex,
    charCount,
    handleCreateNew,
    handleSelectTemplate,
    handleSave,
    handleRunPreview,
    addVariable,
    updateVariable,
    removeVariable,
    insertVariableToContent,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    updateTemplateName,
    updateTemplateContent,
    updatePreviewValue,
    confirmDiscardChanges,
    cancelDiscardChanges,
  };
}
