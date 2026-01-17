/**
 * Template Name Constants
 * 
 * Single source of truth for template names used across the application.
 * This prevents hard-coded Chinese strings from causing lookup failures
 * when template names are modified.
 * 
 * Usage:
 * - In TypeScript: import { TEMPLATE_NAMES } from '@/shared/template-names';
 * - In Worker JS: import { TEMPLATE_NAMES } from '../../src/shared/template-names.js';
 */

/**
 * Outline template name mappings based on target word count (in 万字)
 */
export const OUTLINE_ROUGH_TEMPLATES = [
  { maxWan: 100, name: '粗略大纲生成（100万字内）' },
  { maxWan: 200, name: '粗略大纲生成（200万字内）' },
  { maxWan: 300, name: '粗略大纲生成（300万字内）' },
  { maxWan: 400, name: '粗略大纲生成（400万字内）' },
  { maxWan: 500, name: '粗略大纲生成（500万字内）' },
  { maxWan: Infinity, name: '粗略大纲生成（500万字以上）' },
] as const;

/**
 * Get the appropriate rough outline template name based on target word count
 * @param targetWordsInWan Target word count in 万字 (10,000 words)
 * @returns Template name string
 */
export function getOutlineRoughTemplateName(targetWordsInWan: number): string {
  if (!targetWordsInWan || targetWordsInWan <= 0) {
    return OUTLINE_ROUGH_TEMPLATES[0].name;
  }
  
  const template = OUTLINE_ROUGH_TEMPLATES.find(t => targetWordsInWan <= t.maxWan);
  return template?.name ?? OUTLINE_ROUGH_TEMPLATES[OUTLINE_ROUGH_TEMPLATES.length - 1].name;
}

/**
 * All template names used in the system
 * Organized by category for easy reference
 */
export const TEMPLATE_NAMES = {
  // Outline generation templates
  OUTLINE_ROUGH_100W: '粗略大纲生成（100万字内）',
  OUTLINE_ROUGH_200W: '粗略大纲生成（200万字内）',
  OUTLINE_ROUGH_300W: '粗略大纲生成（300万字内）',
  OUTLINE_ROUGH_400W: '粗略大纲生成（400万字内）',
  OUTLINE_ROUGH_500W: '粗略大纲生成（500万字内）',
  OUTLINE_ROUGH_MEGA: '粗略大纲生成（500万字以上）',
  OUTLINE_DETAILED: '细纲生成',
  OUTLINE_CHAPTERS: '章节大纲生成',
  OUTLINE_CHAPTERS_BATCH: '批量章节大纲生成',
  OUTLINE_CHAPTER_SINGLE: '单章节大纲生成',
  OUTLINE_GENERATE: '大纲生成',
  
  // Novel creation templates
  NOVEL_SEED: '小说引导生成',
  WIZARD_WORLD_BUILDING: '世界观生成',
  WIZARD_CHARACTERS: '角色生成',
  INSPIRATION_GENERATOR: '灵感生成',
  
  // Chapter templates
  CHAPTER_GENERATE: '章节写作',
  REVIEW_SCORE: '章节评审',
  DEAI_REWRITE: '去AI化改写',
  MEMORY_EXTRACT: '记忆提取',
  CONSISTENCY_CHECK: '一致性检查',
  CHARACTER_CHAT: '角色对话',
  CHARACTER_BIOS: '角色小传生成',
  
  // Agent names (for fallback lookups)
  AGENT_ROUGH_OUTLINE: '粗纲生成器',
  AGENT_OUTLINE: '大纲生成器',
  AGENT_DETAILED_OUTLINE: '细纲生成器',
  AGENT_CHAPTER_OUTLINE: '章节大纲生成器',
} as const;

export type TemplateNameKey = keyof typeof TEMPLATE_NAMES;
export type TemplateName = typeof TEMPLATE_NAMES[TemplateNameKey];
