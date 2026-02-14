export type TemplateVariableValue = string | number | boolean | string[];

export type TemplateVariableType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface TemplateVariable {
  name: string;
  type: TemplateVariableType;
  description?: string;
  required?: boolean;
  defaultValue?: TemplateVariableValue;
}

export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  variables: TemplateVariable[] | null;
  updatedAt: string;
}

export interface TemplatePayload {
  name: string;
  content: string;
  variables: TemplateVariable[];
}

export const NEW_TEMPLATE_ID = 'new';

function deepClone<T>(value: T): T {
  const nativeClone = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (typeof nativeClone === 'function') {
    return nativeClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneTemplate(template: TemplateItem): TemplateItem {
  return deepClone(template);
}

export function createTemplateDraft(date: Date = new Date()): TemplateItem {
  return {
    id: NEW_TEMPLATE_ID,
    name: '未命名模板',
    content: '',
    variables: [],
    updatedAt: date.toISOString(),
  };
}

export function isPersistedTemplate(template: TemplateItem): boolean {
  return template.id !== NEW_TEMPLATE_ID;
}

export function buildPreviewData(variables: TemplateVariable[] | null | undefined): Record<string, TemplateVariableValue> {
  if (!Array.isArray(variables) || variables.length === 0) {
    return {};
  }

  return variables.reduce<Record<string, TemplateVariableValue>>((acc, variable) => {
    acc[variable.name] = variable.defaultValue ?? '';
    return acc;
  }, {});
}

export function toTemplatePayload(template: TemplateItem): TemplatePayload {
  return {
    name: template.name,
    content: template.content,
    variables: template.variables || [],
  };
}

function nextVariableName(variables: TemplateVariable[]): string {
  const existingNames = new Set(variables.map((variable) => variable.name));
  let index = variables.length + 1;
  let candidate = `variable_${index}`;

  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `variable_${index}`;
  }

  return candidate;
}

export function createVariableDraft(variables: TemplateVariable[]): TemplateVariable {
  return {
    name: nextVariableName(variables),
    type: 'string',
    description: '',
    required: false,
  };
}

export function addVariableToTemplate(variables: TemplateVariable[]): TemplateVariable[] {
  return [...variables, createVariableDraft(variables)];
}

export function updateVariableInTemplate(
  variables: TemplateVariable[],
  index: number,
  field: keyof TemplateVariable,
  value: TemplateVariable[keyof TemplateVariable]
): TemplateVariable[] {
  if (index < 0 || index >= variables.length) {
    return variables;
  }

  const nextVariables = [...variables];
  nextVariables[index] = { ...nextVariables[index], [field]: value };
  return nextVariables;
}

export function removeVariableFromTemplate(variables: TemplateVariable[], index: number): TemplateVariable[] {
  if (index < 0 || index >= variables.length) {
    return variables;
  }

  const nextVariables = [...variables];
  nextVariables.splice(index, 1);
  return nextVariables;
}

export function reorderTemplatesByIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (movedItem === undefined) {
    return items;
  }

  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function getTemplateCharCount(template: TemplateItem | null): number {
  if (!template) return 0;
  return template.content.length;
}
