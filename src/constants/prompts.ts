export const FALLBACK_PROMPTS = {
  CHAPTER_GENERATE: (chapterNumber: number, novelTitle: string) =>
    `你是资深网文作者，请为《${novelTitle}》创作第${chapterNumber}章。
要求：
1. 只输出正文，不要标题、注释或解释。
2. 延续既有人设与世界观，不得出现突兀设定。
3. 本章必须有冲突推进，并以明确钩子收尾。
4. 语言自然流畅，避免重复句式与AI腔。`,

  REVIEW_SCORE: (chapterContent: string) =>
    `请评审以下章节，并仅输出 JSON：
{
  "overall_score": 0-10,
  "verdict": "approve|minor_revision|major_revision|reject",
  "highlights": ["优点1", "优点2"],
  "issues": [{"severity":"high|medium|low","problem":"问题","suggestion":"建议"}],
  "summary": "一句话结论"
}
章节内容：
${chapterContent}`,

  MEMORY_EXTRACT: (chapterContent: string) =>
    `请从以下章节提取结构化记忆，并仅输出 JSON：
{
  "hooks": [{"id":"可空","description":"钩子内容","status":"new|ongoing|resolved"}],
  "foreshadows": [{"description":"伏笔","payoff_hint":"回收方向"}],
  "plot_progress": [{"event":"事件","impact":"影响"}],
  "character_relations": [{"a":"角色A","b":"角色B","relation":"关系变化"}],
  "entities": [{"name":"实体","type":"person|organization|location|item","state":"active|pending"}]
}
章节内容：
${chapterContent}`,

  DEAI_REWRITE: (chapterContent: string) =>
    `请对以下文本做“去AI化润色”：
1. 保留原意、剧情事实和人物关系。
2. 优化语感、节奏和细节，减少机械重复。
3. 字数控制在原文±15%以内。
4. 只输出改写后的正文。

原文：
${chapterContent}`,

  CHARACTER_CHAT: (characterName: string, userMessage: string) =>
    `你正在扮演角色「${characterName}」。
请以该角色的世界观、语气和价值观回应用户，不要跳出角色设定。
用户消息：${userMessage}`,

  NOVEL_SEED: (title: string, theme: string, genre: string) =>
    `请基于以下信息生成小说种子，并仅输出 JSON：
{
  "synopsis": "200-300字简介",
  "world_setting": "世界观核心设定",
  "golden_finger": "主角核心外挂",
  "core_conflict": "主冲突"
}
书名：${title}
主题：${theme}
类型：${genre}`,

  OUTLINE_ROUGH: (keywords: string, theme: string, genre: string, targetWords: number | string) =>
    `请生成“粗纲（单卷级）”，仅输出 JSON，禁止逐章拆解。
关键词：${keywords || '无'}
主题：${theme || '无'}
类型：${genre || '无'}
目标字数：${targetWords || '未知'}万字
要求：给出卷目标、核心冲突、阶段里程碑、卷末钩子。`,

  OUTLINE_DETAILED: (roughOutlinePayload: string) =>
    `请基于粗纲生成“细纲（事件簇级）”，仅输出 JSON。
输入粗纲：
${roughOutlinePayload || '无'}
要求：每个节点覆盖连续多章（建议10-30章），包含目标、冲突、转折与结果。`,

  OUTLINE_CHAPTERS: (detailedPayload: string) =>
    `请基于细纲生成“章节纲（单章级）”，仅输出 JSON。
输入细纲：
${detailedPayload || '无'}
要求：每章都包含开场承接、冲突推进、章末钩子，单章计划字数 2000-3000。`,

  OUTLINE_GENERATE: (keywords: string, theme: string, genre: string) =>
    `请根据以下要求生成完整小说大纲，并仅输出 JSON：
关键词：${keywords || '无'}
主题：${theme || '无'}
类型：${genre || '无'}`,

  CHARACTER_BIOS: (charactersBrief: string) =>
    `请为以下角色生成完整传记，并仅输出 JSON：
${charactersBrief}`,

  WIZARD_WORLD_BUILDING: (context: {
    theme: string;
    genre: string;
    keywords: string;
    protagonist: string;
    worldSetting: string;
    specialRequirements: string;
  }) =>
    `请根据以下信息生成小说世界观设定，并仅返回 JSON。
字段：world_time_period, world_location, world_atmosphere, world_rules, world_setting
主题：${context.theme || '无'}
类型：${context.genre || '无'}
关键词：${context.keywords || '无'}
主角：${context.protagonist || '无'}
已有设定：${context.worldSetting || '无'}
特殊要求：${context.specialRequirements || '无'}`,

  WIZARD_CHARACTERS: (context: {
    theme: string;
    genre: string;
    keywords: string;
    protagonist: string;
    worldSetting: string;
    characterCount: number;
  }) =>
    `请根据以下信息生成角色设定，返回 JSON 数组。
每项字段：name, role, description, traits, goals
主题：${context.theme || '无'}
类型：${context.genre || '无'}
关键词：${context.keywords || '无'}
主角：${context.protagonist || '无'}
世界观：${context.worldSetting || '无'}
角色数量：${context.characterCount}`,

  CONSISTENCY_CHECK: (chapterContent: string) =>
    `请检查以下章节与既有设定的一致性，并仅输出 JSON：
{
  "consistency_score": 0-10,
  "isConsistent": true/false,
  "score_explanation": "评分说明",
  "dimension_scores": {
    "character_consistency": {"score": 0-10, "comment": "角色一致性评语"},
    "timeline_consistency": {"score": 0-10, "comment": "时间线一致性评语"},
    "world_consistency": {"score": 0-10, "comment": "世界观一致性评语"},
    "power_system_consistency": {"score": 0-10, "comment": "力量体系一致性评语"},
    "plot_logic_consistency": {"score": 0-10, "comment": "剧情逻辑一致性评语"}
  },
  "highlights": ["优点1", "优点2"],
  "improvement_suggestions": [{"priority":"high|medium|low","category":"分类","suggestion":"改进建议"}],
  "issues": [{"category":"设定|人设|时间线|能力体系|剧情逻辑","severity":"critical|major|minor|nitpick","title":"问题标题","description":"问题描述","evidence":"证据","suggestion":"建议","location":"原文位置"}],
  "summary": {"overall_assessment":"结论","recommendation":"可发布|建议修改后发布|需要重点修改","strongest_aspect":"最佳表现","weakest_aspect":"最需改进"},
  "next_actions": ["下一步建议1","下一步建议2"]
}
章节内容：
${chapterContent}`,

  CANON_CHECK: (chapterContent: string, originalWork: string) =>
    `你是一位资深同人文编辑，请对以下章节进行原作符合度检查，并仅输出 JSON：

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
只输出新的章节正文，不要解释修改过程。

${basePrompt}`;
