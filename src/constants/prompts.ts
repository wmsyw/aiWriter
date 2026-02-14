export const FALLBACK_PROMPTS = {
  CHAPTER_GENERATE: (chapterNumber: number, novelTitle: string) =>
    `Write chapter ${chapterNumber} of "${novelTitle}".`,

  REVIEW_SCORE: (chapterContent: string) =>
    `Review this chapter and provide a score from 1-10:\n\n${chapterContent}`,

  MEMORY_EXTRACT: (chapterContent: string) =>
    `请根据以下章节提取钩子、伏笔、情节、人物关系、职业等信息，并输出JSON结构：\n\n${chapterContent}`,

  DEAI_REWRITE: (chapterContent: string) =>
    `请将以下文字改写得更自然、更有文采，消除AI写作的痕迹：\n\n${chapterContent}`,

  CHARACTER_CHAT: (characterName: string, userMessage: string) =>
    `You are ${characterName}. Respond to: ${userMessage}`,

  NOVEL_SEED: (title: string, theme: string, genre: string) =>
    `请生成简介、世界观和金手指设定（JSON）：\n书名：${title}\n主题：${theme}\n类型：${genre}`,

  OUTLINE_ROUGH: (keywords: string, theme: string, genre: string, targetWords: number | string) =>
    `请生成“粗纲（单卷级）”（JSON 输出）：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}\n目标字数：${targetWords || '未知'}万字\n要求：只输出整卷级主线规划（卷目标/主冲突/阶段里程碑/卷末钩子），禁止逐章内容。`,

  OUTLINE_DETAILED: (roughOutlinePayload: string) =>
    `请基于粗纲生成“细纲（事件簇级）”（JSON 输出）：\n${roughOutlinePayload || '无'}\n要求：每个细纲节点覆盖连续多章（建议10-30章），禁止退化成单章。`,

  OUTLINE_CHAPTERS: (detailedPayload: string) =>
    `请基于细纲生成“章节纲（单章级）”（JSON 输出）：\n${detailedPayload || '无'}\n要求：每个节点仅对应1章，单章计划字数2000-3000字，必须包含开场承接、冲突推进与章末钩子。`,

  OUTLINE_GENERATE: (keywords: string, theme: string, genre: string) =>
    `请根据以下要求生成小说大纲：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}`,

  CHARACTER_BIOS: (charactersBrief: string) =>
    `请为这些角色生成完整传记（JSON）：\n${charactersBrief}`,

  WIZARD_WORLD_BUILDING: (context: {
    theme: string;
    genre: string;
    keywords: string;
    protagonist: string;
    worldSetting: string;
    specialRequirements: string;
  }) =>
    `请根据以下信息生成小说世界观设定，并返回 JSON：\n\n字段：world_time_period, world_location, world_atmosphere, world_rules, world_setting\n\n主题：${context.theme || '无'}\n类型：${context.genre || '无'}\n关键词：${context.keywords || '无'}\n主角：${context.protagonist || '无'}\n已有设定：${context.worldSetting || '无'}\n特殊要求：${context.specialRequirements || '无'}`,

  WIZARD_CHARACTERS: (context: {
    theme: string;
    genre: string;
    keywords: string;
    protagonist: string;
    worldSetting: string;
    characterCount: number;
  }) =>
    `请根据以下信息生成角色设定，返回 JSON 数组，每项包含 name, role, description, traits, goals：\n\n主题：${context.theme || '无'}\n类型：${context.genre || '无'}\n关键词：${context.keywords || '无'}\n主角：${context.protagonist || '无'}\n世界观：${context.worldSetting || '无'}\n角色数量：${context.characterCount}`,

  CONSISTENCY_CHECK: (chapterContent: string) =>
    `请检查以下章节与设定的一致性，输出JSON格式结果：\n\n${chapterContent}`,

  CANON_CHECK: (chapterContent: string, originalWork: string) =>
    `你是一位资深的同人文编辑，请对以下章节进行原作符合度检查，输出JSON格式结果：

## 待检查章节
${chapterContent}

## 原作信息
${originalWork || '未指定'}

请从角色人设、世界观、剧情逻辑、风格氛围等维度检查是否符合原作设定。`,
} as const;

export const WEB_SEARCH_PREFIX = '【参考资料（来自网络搜索）】\n';

export const ITERATION_PROMPT_TEMPLATE = (
  iterationRound: number,
  selectedContent: string,
  feedback: string,
  basePrompt: string
) => `你正在进行第${iterationRound}轮迭代创作。

【上一轮选中的版本内容】
${selectedContent}

【用户反馈意见】
${feedback}

【任务要求】
请根据用户的反馈意见，在上一轮选中版本的基础上进行改进和优化。
保持原文的优点，同时针对反馈中提到的问题进行修改。
生成新的章节内容。

${basePrompt}`;
