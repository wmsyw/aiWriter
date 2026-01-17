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
  WORLD_BUILDING_GENERATOR: {
    name: '世界观生成器',
    description: '根据主题和关键词生成详细的世界观设定',
    category: 'writing',
    templateName: '世界观生成',
    defaultParams: { temperature: 0.7, maxTokens: 4000, topP: 0.9 },
  },
  CHARACTER_GENERATOR: {
    name: '角色生成器',
    description: '根据设定批量生成角色人设',
    category: 'writing',
    templateName: '角色生成',
    defaultParams: { temperature: 0.7, maxTokens: 4000, topP: 0.9 },
  },
  OUTLINE_ROUGH_GENERATOR: {
    name: '粗纲生成器',
    description: '生成分段粗略大纲与故事主线（通用版）',
    category: 'writing',
    templateName: '粗略大纲生成（100万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 4000, topP: 0.95 },
  },
  OUTLINE_ROUGH_100W: {
    name: '粗纲生成器 (100万字)',
    description: '适用于100万字以内小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（100万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 6000, topP: 0.95 },
  },
  OUTLINE_ROUGH_200W: {
    name: '粗纲生成器 (200万字)',
    description: '适用于100-200万字小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（200万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 8000, topP: 0.95 },
  },
  OUTLINE_ROUGH_300W: {
    name: '粗纲生成器 (300万字)',
    description: '适用于200-300万字小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（300万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 10000, topP: 0.95 },
  },
  OUTLINE_ROUGH_400W: {
    name: '粗纲生成器 (400万字)',
    description: '适用于300-400万字小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（400万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 12000, topP: 0.95 },
  },
  OUTLINE_ROUGH_500W: {
    name: '粗纲生成器 (500万字)',
    description: '适用于400-500万字小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（500万字内）',
    defaultParams: { temperature: 0.7, maxTokens: 16000, topP: 0.95 },
  },
  OUTLINE_ROUGH_MEGA: {
    name: '粗纲生成器 (500万字以上)',
    description: '适用于500万字以上超长篇小说的粗略大纲生成',
    category: 'writing',
    templateName: '粗略大纲生成（500万字以上）',
    defaultParams: { temperature: 0.7, maxTokens: 20000, topP: 0.95 },
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
  CANON_CHECKER: {
    name: '原作符合度检查',
    description: '针对同人文检查章节内容是否符合原作设定，识别人设偏离、剧情矛盾等问题',
    category: 'review',
    templateName: '原作符合度检查',
    defaultParams: { temperature: 0.2, maxTokens: 6000 },
  },
};

export const REVIEW_AGENTS = Object.entries(BUILT_IN_AGENTS)
  .filter(([_, agent]) => agent.category === 'review')
  .map(([key]) => key);
