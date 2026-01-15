export type AgentCategory = 'writing' | 'review' | 'utility';

export interface BuiltInAgentDefinition {
  name: string;
  description: string;
  category: AgentCategory;
  templateName: string;
  defaultParams: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export const BUILT_IN_AGENTS: Record<string, BuiltInAgentDefinition> = {
  CHAPTER_WRITER: {
    name: '章节写手',
    description: '根据大纲和上下文生成小说章节，支持多种网文类型',
    category: 'writing',
    templateName: '章节写作',
    defaultParams: { temperature: 0.8, maxTokens: 8000, topP: 0.95, frequencyPenalty: 0.1, presencePenalty: 0.1 },
  },
  REVIEWER: {
    name: '章节评审',
    description: '从多个维度专业评审章节质量，给出评分和改进建议',
    category: 'review',
    templateName: '章节评审',
    defaultParams: { temperature: 0.3, maxTokens: 4000 },
  },
  HUMANIZER: {
    name: '去AI化润色',
    description: '改写AI生成的内容，使其更自然、更有"人味"',
    category: 'writing',
    templateName: '去AI化改写',
    defaultParams: { temperature: 0.9, maxTokens: 8000, frequencyPenalty: 0.4, presencePenalty: 0.4 },
  },
  MEMORY_EXTRACTOR: {
    name: '记忆提取器',
    description: '从章节中提取结构化信息，维护故事连贯性',
    category: 'utility',
    templateName: '记忆提取',
    defaultParams: { temperature: 0.2, maxTokens: 4000 },
  },
  CONSISTENCY_CHECKER: {
    name: '一致性检查',
    description: '检查章节与已有设定的一致性，发现矛盾和漏洞',
    category: 'review',
    templateName: '一致性检查',
    defaultParams: { temperature: 0.2, maxTokens: 4000 },
  },
  CHARACTER_CHAT: {
    name: '角色对话',
    description: '与小说中的角色进行对话，测试角色设定和性格',
    category: 'utility',
    templateName: '角色对话',
    defaultParams: { temperature: 0.8, maxTokens: 2000, topP: 0.9 },
  },
  OUTLINE_GENERATOR: {
    name: '大纲生成器',
    description: '根据关键词、主题、风格等要求自动生成完整小说大纲',
    category: 'writing',
    templateName: '大纲生成',
    defaultParams: { temperature: 0.7, maxTokens: 8000, topP: 0.95 },
  },
  NOVEL_SEEDER: {
    name: '小说引导生成器',
    description: '生成简介、世界观、金手指等核心设定',
    category: 'writing',
    templateName: '小说引导生成',
    defaultParams: { temperature: 0.7, maxTokens: 3000, topP: 0.9 },
  },
  OUTLINE_ROUGH_GENERATOR: {
    name: '粗纲生成器',
    description: '生成分段粗略大纲与故事主线',
    category: 'writing',
    templateName: '粗略大纲生成',
    defaultParams: { temperature: 0.7, maxTokens: 4000, topP: 0.95 },
  },
  OUTLINE_DETAILED_GENERATOR: {
    name: '细纲生成器',
    description: '基于粗略大纲扩展细纲',
    category: 'writing',
    templateName: '细纲生成',
    defaultParams: { temperature: 0.7, maxTokens: 6000, topP: 0.95 },
  },
  OUTLINE_CHAPTER_GENERATOR: {
    name: '章节大纲生成器',
    description: '生成逐章大纲与剧情节奏',
    category: 'writing',
    templateName: '章节大纲生成',
    defaultParams: { temperature: 0.6, maxTokens: 8000, topP: 0.95 },
  },
  CHARACTER_BIO_GENERATOR: {
    name: '角色传记生成器',
    description: '生成角色完整传记与设定',
    category: 'writing',
    templateName: '角色传记生成',
    defaultParams: { temperature: 0.7, maxTokens: 6000, topP: 0.9 },
  },
  ARTICLE_ANALYZER: {
    name: '文章分析器',
    description: '分析上传的文章，提取要素、写作技巧和总结，存入专属素材库',
    category: 'utility',
    templateName: '文章分析',
    defaultParams: { temperature: 0.3, maxTokens: 6000 },
  },
};

export const REVIEW_AGENTS = Object.entries(BUILT_IN_AGENTS)
  .filter(([_, agent]) => agent.category === 'review')
  .map(([key]) => key);
