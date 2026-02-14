import { assembleContextAsString, assembleTruncatedContext } from '../../src/server/services/context-assembly.js';
import { upsertChapterSummary } from '../../src/server/services/chapter-summary.js';
import { processExtractedHooks, formatHooksForContext, getOverdueHooks } from '../../src/server/services/hooks.js';
import { batchProcessExtractedEntities, checkBlockingPendingEntities } from '../../src/server/services/pending-entities.js';
import { buildAdherenceCheckPrompt, parseAdherenceResponse, formatAdherenceResultForReview } from '../../src/server/services/outline-adherence.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson, truncateText } from '../utils/helpers.js';
import { breakChapterIntoScenes, generateActSummary, detectActBoundaries, syncActSummaries } from '../../src/server/services/hierarchical-summary.js';
import { generatePlotBranches, simulatePlotForward } from '../../src/server/services/plot-mcts.js';

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function getNovelCreativeIntent(novel) {
  const workflowConfig = novel?.workflowConfig;
  if (workflowConfig && typeof workflowConfig === 'object' && !Array.isArray(workflowConfig)) {
    const fromWorkflow = normalizeText(workflowConfig.creativeIntent);
    if (fromWorkflow) return fromWorkflow;
  }
  return normalizeText(novel?.specialRequirements);
}

export async function handleContextAssemble(prisma, job, { jobId, userId, input }) {
  const { novelId, currentChapterOrder, maxTokens } = input;

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel || novel.userId !== userId) throw new Error('Novel not found');

  if (maxTokens) {
    const result = await assembleTruncatedContext(novelId, currentChapterOrder, maxTokens);
    return {
      context: result.context,
      tokens: result.tokens,
      warnings: result.warnings,
      truncated: result.truncated,
    };
  }

  const result = await assembleContextAsString(novelId, currentChapterOrder);
  return {
    context: result.context,
    tokens: result.tokens,
    warnings: result.warnings,
    truncated: false,
  };
}

export async function handleChapterSummaryGenerate(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节摘要',
    templateName: '章节摘要',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const prompt = `请为以下章节生成一个结构化摘要，返回JSON格式：

## 章节内容
${chapter.content}

请返回以下格式的JSON：
{
  "oneLine": "一句话总结本章核心内容（50字以内）",
  "keyEvents": ["关键事件1", "关键事件2"],
  "characterDevelopments": ["角色发展1", "角色发展2"],
  "plotAdvancement": "剧情推进描述",
  "emotionalArc": "情感基调",
  "newCharacters": ["新出场角色名"],
  "newOrganizations": ["新出场组织名"]
}`;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 2000,
  });

  const parsed = parseModelJson(response.content);

  const summary = await upsertChapterSummary({
    chapterId,
    novelId: chapter.novelId,
    chapterNumber: chapter.order,
    oneLine: parsed.oneLine || '',
    keyEvents: parsed.keyEvents || [],
    characterDevelopments: parsed.characterDevelopments || [],
    plotAdvancement: parsed.plotAdvancement || null,
    emotionalArc: parsed.emotionalArc || null,
    newCharacters: parsed.newCharacters || [],
    newOrganizations: parsed.newOrganizations || [],
  });

  return { summaryId: summary.id, ...parsed };
}

export async function handleHooksExtract(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '钩子提取',
    templateName: '钩子提取',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const existingHooksContext = await formatHooksForContext(chapter.novelId, chapter.order);

  const prompt = `请分析以下章节中的叙事钩子（伏笔、悬念、契诃夫之枪、承诺、铺垫），返回JSON格式：

## 现有未解决的钩子
${existingHooksContext || '（暂无）'}

## 本章内容
${chapter.content}

请返回以下格式的JSON：
{
  "planted": [
    {
      "type": "foreshadowing|chekhov_gun|mystery|promise|setup",
      "description": "钩子描述",
      "context": "埋设的具体文本",
      "importance": "critical|major|minor",
      "relatedCharacters": ["相关角色名"]
    }
  ],
  "referenced": [
    {
      "hookDescription": "被引用的钩子描述（匹配现有钩子）",
      "referenceContext": "引用的具体文本"
    }
  ],
  "resolved": [
    {
      "hookDescription": "被解决的钩子描述（匹配现有钩子）",
      "resolutionContext": "解决的具体文本"
    }
  ]
}`;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 3000,
  });

  const extracted = parseModelJson(response.content);

  const results = await processExtractedHooks(chapter.novelId, chapter.order, {
    planted: extracted.planted || [],
    referenced: extracted.referenced || [],
    resolved: extracted.resolved || [],
  });

  const overdueHooks = await getOverdueHooks(chapter.novelId, chapter.order);

  return {
    extracted,
    processed: results,
    overdueWarnings: overdueHooks,
  };
}

export async function handlePendingEntityExtract(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '实体提取',
    templateName: '实体提取',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const existingMaterials = await prisma.material.findMany({
    where: { novelId: chapter.novelId },
    select: { name: true, type: true },
  });
  const existingNames = existingMaterials.map(m => m.name);

  const prompt = `请从以下章节中提取新出场的角色和组织，返回JSON格式：

## 已有的角色/组织
${existingNames.join(', ') || '（暂无）'}

## 本章内容
${chapter.content}

请返回以下格式的JSON（只提取新出场的、尚未在"已有的角色/组织"中的实体）：
{
  "characters": [
    {
      "name": "角色名",
      "identity": "身份描述",
      "description": "外貌/特征描述",
      "personality": "性格特点",
      "roleType": "主角|配角|龙套|反派",
      "firstImpression": "初次登场的印象",
      "relationshipsHint": [{"targetName": "与谁", "relationship": "什么关系"}]
    }
  ],
  "organizations": [
    {
      "name": "组织名",
      "type": "组织类型",
      "description": "组织描述",
      "members": ["成员名"],
      "influence": "势力范围",
      "roleInChapter": "本章中的作用"
    }
  ]
}`;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 3000,
  });

  const extracted = parseModelJson(response.content);

  const results = await batchProcessExtractedEntities(
    chapter.novelId,
    chapterId,
    chapter.order,
    extracted.characters || [],
    extracted.organizations || []
  );

  return {
    extracted,
    pendingEntityIds: results,
  };
}

export async function handleOutlineAdherenceCheck(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, chapterOutline } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '大纲符合度检查',
    templateName: '大纲符合度检查',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const previousChapter = await prisma.chapter.findFirst({
    where: { novelId: chapter.novelId, order: chapter.order - 1 },
    include: { summary: true },
  });

  const prompt = buildAdherenceCheckPrompt({
    chapterOutline: chapterOutline || '',
    chapterContent: chapter.content,
    novelOutline: chapter.novel.outline || undefined,
    previousChapterSummary: previousChapter?.summary?.oneLine || undefined,
  });

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 3000,
  });

  const result = parseAdherenceResponse(response.content);

  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outlineAdherence: result.score },
  });

  return {
    ...result,
    formattedReport: formatAdherenceResultForReview(result),
  };
}

export async function handleReviewScore5Dim(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, chapterOutline } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '5维度评审',
    templateName: '5维度评审',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 2,
    include: { summary: true },
  });
  const previousContext = previousChapters
    .map(c => `Ch.${c.order}: ${c.summary?.oneLine || c.title}`)
    .join('\n');

  const hooksContext = await formatHooksForContext(chapter.novelId, chapter.order);
  const overdueHooks = await getOverdueHooks(chapter.novelId, chapter.order);

  let effectiveChapterOutline = chapterOutline || '';
  if (!effectiveChapterOutline && chapter.novel.outlineChapters) {
    const outlineChapters = chapter.novel.outlineChapters;
    if (Array.isArray(outlineChapters) && outlineChapters[chapter.order - 1]) {
      const chapterOutlineData = outlineChapters[chapter.order - 1];
      effectiveChapterOutline = typeof chapterOutlineData === 'string' 
        ? chapterOutlineData 
        : chapterOutlineData?.summary || chapterOutlineData?.content || JSON.stringify(chapterOutlineData);
    }
  }

  const creativeIntent = getNovelCreativeIntent(chapter.novel);
  const creativeIntentContext = [
    creativeIntent ? `创作意图文档：${creativeIntent}` : '',
    chapter.novel.theme ? `主题方向：${chapter.novel.theme}` : '',
    chapter.novel.description ? `作品简介：${chapter.novel.description}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `请对以下章节进行5维度深度评审，返回JSON格式结果：

## 本章内容
${chapterContent}

## 素材设定
${materials || '（暂无）'}

## 前文摘要
${previousContext || '（第一章）'}

## 本章大纲（预期）
${effectiveChapterOutline || '（未提供本章大纲，请仅评估章节本身的质量和连贯性）'}

## 创作意图（作者目标）
${creativeIntentContext || '（未提供创作意图文档，请按通用网文质量标准评审）'}

## 叙事钩子状态
${hooksContext || '（暂无）'}

请从以下5个维度评审，每个维度1-10分：

1. **章节独立质量** (standalone_quality): 文笔、节奏、情节张力
2. **前文连贯性** (continuity): 与前文时间线、角色状态、剧情逻辑的一致性
3. **大纲符合度** (outline_adherence): 是否按照大纲推进（0-1分数）
4. **人物一致性** (character_consistency): 角色言行是否符合设定
5. **钩子管理** (hook_management): 伏笔/悬念的埋设、引用、解决是否合理

返回JSON格式：
{
  "overallScore": 7.5,
  "dimensions": {
    "standaloneQuality": {
      "score": 8,
      "strengths": ["优点1", "优点2"],
      "weaknesses": ["缺点1"]
    },
    "continuity": {
      "score": 7,
      "issues": [
        {"type": "timeline|character_state|plot_logic|setting", "description": "...", "severity": "critical|major|minor"}
      ]
    },
    "outlineAdherence": {
      "score": 0.85,
      "deviations": [{"expected": "...", "actual": "...", "severity": "minor|major|critical"}],
      "verdict": "acceptable|needs_revision|reject"
    },
    "characterConsistency": {
      "score": 8,
      "inconsistencies": [{"character": "...", "issue": "...", "expectedBehavior": "...", "observedBehavior": "..."}]
    },
    "hookManagement": {
      "score": 7,
      "hooksPlanted": ["新埋设的钩子描述"],
      "hooksReferenced": ["引用的钩子描述"],
      "hooksResolved": ["解决的钩子描述"],
      "overdueWarnings": []
    }
  },
  "issues": [
    {"type": "plot_hole|character_inconsistency|pacing_issue|outline_deviation|unresolved_hook|ai_taste|continuity_error", "severity": "critical|major|minor", "description": "...", "suggestion": "..."}
  ],
  "verdict": "approve|minor_revision|major_revision|reject",
  "regenerationInstructions": "如果需要重写，这里是具体指导",
  "summary": "总体评价",
  "intentAlignment": {
    "score": 0,
    "gaps": ["与创作意图不一致的点"],
    "notes": "创作意图对齐评价"
  }
}`;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 6000,
  });

  const parsed = parseModelJson(response.content);

  if (overdueHooks.length > 0 && parsed.dimensions?.hookManagement) {
    parsed.dimensions.hookManagement.overdueWarnings = overdueHooks.map(h => ({
      hookDescription: h.description,
      plantedChapter: h.plantedChapter,
      chaptersOverdue: h.chaptersOverdue,
      importance: h.importance,
    }));
  }

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      reviewFeedback: parsed,
      outlineAdherence: parsed.dimensions?.outlineAdherence?.score || null,
      generationStage: 'reviewed',
      pendingReview: true,
      approvedAt: null,
      lastReviewAt: new Date(),
      reviewIterations: { increment: 1 },
    },
  });

  return parsed;
}

export async function handleSceneBreakdown(prisma, job, { jobId, userId, input }) {
  const { chapterId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const existingCharacters = await prisma.material.findMany({
    where: { novelId: chapter.novelId, type: 'character' },
    select: { name: true },
  });
  const characterNames = existingCharacters.map(c => c.name);

  const scenes = await breakChapterIntoScenes(chapter.content, characterNames);

  await prisma.chapterSummary.upsert({
    where: { chapterId },
    create: {
      chapterId,
      novelId: chapter.novelId,
      chapterNumber: chapter.order,
      oneLine: scenes[0]?.summary || 'Scene breakdown',
      keyEvents: [],
      sceneBreakdown: scenes,
    },
    update: { sceneBreakdown: scenes },
  });

  return { scenes, count: scenes.length };
}

export async function handleActSummaryGenerate(prisma, job, { jobId, userId, input }) {
  const { novelId, actNumber, startChapter, endChapter, autoDetect } = input;

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel || novel.userId !== userId) throw new Error('Novel not found');

  if (autoDetect) {
    const count = await syncActSummaries(novelId);
    return { synced: count, autoDetected: true };
  }

  const actSummaryId = await generateActSummary(novelId, actNumber, startChapter, endChapter);
  return { actSummaryId, actNumber };
}

export async function handlePlotSimulate(prisma, job, { jobId, userId, input }) {
  const { novelId, currentChapter, steps, iterations, agentId } = input;

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel || novel.userId !== userId) throw new Error('Novel not found');

  const { agent } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '剧情策划',
    templateName: '剧情策划',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const generator = async (prompt, options) => {
    const { response } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return response.content;
  };

  const result = await simulatePlotForward(
    novelId,
    currentChapter,
    {
      steps: steps || 5,
      iterations: iterations || 100,
      branchCount: input.branchCount || 4,
      focusHooks: input.focusHooks !== false,
    },
    generator
  );

  return result;
}

export async function handlePlotBranchGenerate(prisma, job, { jobId, userId, input }) {
  const { novelId, currentChapter, branchCount, focusHooks, agentId } = input;

  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel || novel.userId !== userId) throw new Error('Novel not found');

  const { agent } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '剧情策划',
    templateName: '剧情策划',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const generator = async (prompt, options) => {
    const { response } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return response.content;
  };

  const branches = await generatePlotBranches(novelId, currentChapter, {
    branchCount: branchCount || 3,
    focusHooks: focusHooks !== false,
  }, generator);

  return { branches };
}
