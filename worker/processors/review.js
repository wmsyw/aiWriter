import { renderTemplateString } from '../../src/server/services/templates.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseModelJson, truncateText, resolveModel } from '../utils/helpers.js';


export async function handleReviewScore(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '章节评审' }, orderBy: { createdAt: 'desc' } });

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const context = { chapter_content: chapter.content };
  const basePrompt = template
    ? renderTemplateString(template.content, context)
    : `Review this chapter and provide a score from 1-10:\n\n${chapter.content}`;

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: basePrompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.3,
    maxTokens: params.maxTokens || 2000,
  }));

  const result = parseModelJson(response.content);

  await prisma.chapter.update({
    where: { id: chapterId },
    data: { generationStage: 'reviewed' },
  });

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);
  return result;
}

export async function handleConsistencyCheck(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '一致性检查',
    templateName: '一致性检查',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding', 'plotPoint']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const context = {
    chapter_content: chapterContent,
    chapter_number: chapter.order,
    materials: materials,
    outline: chapter.novel.outline || '',
  };

  const fallbackPrompt = `请检查以下章节与设定的一致性，输出JSON格式结果：\n\n${chapterContent}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 4000,
  }));

  const result = parseModelJson(response.content);

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);
  return result;
}

export async function handleCanonCheck(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, originalWork, canonSettings, characterProfiles, worldRules } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '原作符合度检查',
    templateName: '原作符合度检查',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');

  const context = {
    chapter_content: chapterContent,
    chapter_number: chapter.order,
    original_work: originalWork || chapter.novel.originalWork || '',
    canon_settings: canonSettings || chapter.novel.canonSettings || materials || '',
    character_profiles: characterProfiles || '',
    world_rules: worldRules || chapter.novel.worldRules || '',
    previous_chapters: previousSummary,
  };

  const fallbackPrompt = `你是一位资深的同人文编辑，请对以下章节进行原作符合度检查，输出JSON格式结果：

## 待检查章节
${chapterContent}

## 原作信息
${context.original_work || '未指定'}

请从角色人设、世界观、剧情逻辑、风格氛围等维度检查是否符合原作设定。`;

  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 6000,
  }));

  const result = parseModelJson(response.content);

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);
  return result;
}
