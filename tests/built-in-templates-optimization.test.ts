import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  optimizeBuiltInTemplateContent,
} from '@/src/server/services/templates';

describe('built-in template optimization', () => {
  it('injects optimization marker into all built-in templates', () => {
    const templates = Object.values(BUILT_IN_TEMPLATES);
    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      expect(template.content).toContain('【内置提示词内容增强 v3】');
    }
  });

  it('applies strict json guard when template asks for json output', () => {
    const optimized = optimizeBuiltInTemplateContent('请输出 JSON 格式结果', '一致性检查');
    expect(optimized).toContain('仅输出合法 JSON');
    expect(optimized).toContain('JSON 字段名必须与要求完全一致');
  });

  it('injects template-specific enhancement rules', () => {
    const chapterPrompt = BUILT_IN_TEMPLATES.CHAPTER_GENERATE.content;
    const outlinePrompt = BUILT_IN_TEMPLATES.OUTLINE_DETAILED.content;
    const reviewPrompt = BUILT_IN_TEMPLATES.REVIEW_SCORE.content;

    expect(chapterPrompt).toContain('叙事必须连续');
    expect(outlinePrompt).toContain('大纲层级必须清晰');
    expect(reviewPrompt).toContain('结论→证据→建议');
  });

  it('does not duplicate optimization header when already optimized', () => {
    const once = optimizeBuiltInTemplateContent('请输出正文', '章节写作');
    const twice = optimizeBuiltInTemplateContent(once, '章节写作');
    expect(twice).toBe(once);
  });
});
