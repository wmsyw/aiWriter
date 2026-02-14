import { describe, expect, it } from 'vitest';
import {
  NEW_TEMPLATE_ID,
  addVariableToTemplate,
  buildPreviewData,
  createTemplateDraft,
  removeVariableFromTemplate,
  reorderTemplatesByIndex,
  updateVariableInTemplate,
} from '@/src/shared/template-editor';

describe('template editor helpers', () => {
  it('creates a new template draft with default values', () => {
    const draft = createTemplateDraft(new Date('2026-01-01T00:00:00.000Z'));

    expect(draft.id).toBe(NEW_TEMPLATE_ID);
    expect(draft.name).toBe('未命名模板');
    expect(draft.content).toBe('');
    expect(draft.variables).toEqual([]);
    expect(draft.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('builds preview data from variable defaults', () => {
    const preview = buildPreviewData([
      { name: 'title', type: 'string', defaultValue: '测试标题' },
      { name: 'count', type: 'number', defaultValue: 3 },
      { name: 'flag', type: 'boolean' },
    ]);

    expect(preview).toEqual({
      title: '测试标题',
      count: 3,
      flag: '',
    });
  });

  it('adds and mutates variables without side effects', () => {
    const afterAdd = addVariableToTemplate([{ name: 'variable_1', type: 'string' }]);
    expect(afterAdd.map((item) => item.name)).toEqual(['variable_1', 'variable_2']);

    const afterUpdate = updateVariableInTemplate(afterAdd, 1, 'name', 'username');
    expect(afterUpdate[1]?.name).toBe('username');

    const afterRemove = removeVariableFromTemplate(afterUpdate, 0);
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0]?.name).toBe('username');
  });

  it('reorders templates by index', () => {
    const templates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const reordered = reorderTemplatesByIndex(templates, 0, 2);

    expect(reordered.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});
