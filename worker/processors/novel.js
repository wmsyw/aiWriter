import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseJsonOutput, parseModelJson, resolveModel } from '../utils/helpers.js';

/**
 * @typedef {import('@prisma/client').PrismaClient} PrismaClient
 * @typedef {{ id: string }} Job
 * @typedef {{ jobId: string, userId: string, input: Record<string, unknown> }} JobContext
 */

/**
 * @typedef {Object} Inspiration
 * @property {string} name
 * @property {string} theme
 * @property {string[]} keywords
 * @property {string} protagonist
 * @property {string} worldSetting
 * @property {string} [hook]
 * @property {string} [potential]
 */

/**
 * @param {PrismaClient} prisma
 * @param {Job} job
 * @param {JobContext} context
 * @returns {Promise<Object>}
 */
export async function handleNovelSeed(prisma, job, { jobId, userId, input }) {
  const { novelId, title, theme, genre, keywords, protagonist, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '小说引导生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '小说引导生成',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    title: title || novel.title,
    theme: theme || novel.theme || '',
    genre: genre || novel.genre || '',
    keywords: keywords || '',
    protagonist: protagonist || novel.protagonist || '',
    special_requirements: specialRequirements || novel.specialRequirements || '',
  };

  const fallbackPrompt = `请生成简介、世界观和金手指设定（JSON）：\n书名：${context.title}\n主题：${context.theme}\n类型：${context.genre}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 3000,
  }));

  const seedResult = parseModelJson(response.content);
  const world = seedResult.world || {};

  await prisma.novel.update({
    where: { id: novelId },
    data: {
      description: seedResult.synopsis || novel.description || null,
      protagonist: seedResult.protagonist || novel.protagonist || null,
      goldenFinger: seedResult.golden_finger || novel.goldenFinger || null,
      worldSetting: world.world_setting || novel.worldSetting || null,
      worldTimePeriod: world.time_period || novel.worldTimePeriod || null,
      worldLocation: world.location || novel.worldLocation || null,
      worldAtmosphere: world.atmosphere || novel.worldAtmosphere || null,
      worldRules: world.rules || novel.worldRules || null,
      generationStage: 'seeded',
      wizardStatus: 'in_progress',
      wizardStep: Math.max(novel.wizardStep || 0, 1),
    },
  });

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return seedResult;
}

export async function handleWizardWorldBuilding(prisma, job, { jobId, userId, input }) {
  const { novelId, theme, genre, keywords, protagonist, worldSetting, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '世界观生成器',
    templateName: '世界观生成',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    theme: theme || novel.theme || '',
    genre: genre || novel.genre || '',
    keywords: (keywords || novel.keywords || []).join(', '),
    protagonist: protagonist || novel.protagonist || '',
    world_setting: worldSetting || novel.worldSetting || '',
    special_requirements: specialRequirements || novel.specialRequirements || '',
  };

  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请根据以下信息生成小说世界观设定，并返回 JSON：\n\n字段：world_time_period, world_location, world_atmosphere, world_rules, world_setting\n\n主题：${context.theme || '无'}\n类型：${context.genre || '无'}\n关键词：${context.keywords || '无'}\n主角：${context.protagonist || '无'}\n已有设定：${context.world_setting || '无'}\n特殊要求：${context.special_requirements || '无'}`;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.6,
    maxTokens: params.maxTokens || 3000,
  }));

  const parsed = parseModelJson(response.content);

  const worldData = parsed && typeof parsed === 'object' ? parsed : { raw: response.content };
  const hasStructuredWorld = !!(
    worldData &&
    (worldData.world_time_period || worldData.world_location || worldData.world_atmosphere || worldData.world_rules || worldData.world_setting)
  );

  await prisma.$transaction(async (tx) => {
    await tx.novel.update({
      where: { id: novelId },
      data: {
        ...(hasStructuredWorld
          ? {
              worldTimePeriod: worldData.world_time_period ?? novel.worldTimePeriod ?? null,
              worldLocation: worldData.world_location ?? novel.worldLocation ?? null,
              worldAtmosphere: worldData.world_atmosphere ?? novel.worldAtmosphere ?? null,
              worldRules: worldData.world_rules ?? novel.worldRules ?? null,
              worldSetting: worldData.world_setting ?? novel.worldSetting ?? null,
            }
          : {}),
        wizardStatus: 'in_progress',
        wizardStep: Math.max(novel.wizardStep || 0, 1),
      },
    });

    await tx.material.create({
      data: {
        novelId,
        userId,
        type: 'worldbuilding',
        name: '世界观设定',
        genre: novel.genre || '通用',
        data: {
          timePeriod: worldData.world_time_period || '',
          location: worldData.world_location || '',
          atmosphere: worldData.world_atmosphere || '',
          rules: worldData.world_rules || '',
          worldSetting: worldData.world_setting || '',
          raw: worldData.raw || null,
        },
      },
    });
  });


  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return worldData;
}

/**
 * @param {PrismaClient} prisma
 * @param {Job} job
 * @param {JobContext} context
 * @returns {Promise<Inspiration[]>}
 */
export async function handleWizardInspiration(prisma, job, { jobId, userId, input }) {
  const { genre, targetWords, targetAudience, keywords, count, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '灵感生成器',
    templateName: '灵感生成',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const sanitizedKeywords = typeof keywords === 'string' 
    ? keywords.replace(/[<>]/g, '').slice(0, 200) 
    : '';

  const context = {
    genre: genre || '玄幻',
    target_words: targetWords || 100,
    target_audience: targetAudience || '男性读者',
    keywords: sanitizedKeywords,
    count: Math.min(Math.max(count || 5, 1), 10),
  };

  const fallbackPrompt = `请生成${context.count}个${context.genre}类型小说灵感，目标字数${context.target_words}万字，目标读者${context.target_audience}。

<user_keywords>${context.keywords || '无'}</user_keywords>

每个灵感包含：name（书名风格标题）、theme（核心主题）、keywords（关键词数组）、protagonist（主角设定）、worldSetting（世界观）、hook（核心卖点）。

返回JSON数组格式。`;

  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.9,
    maxTokens: params.maxTokens || 4000,
  }));

  const inspirations = parseModelJson(response.content, { throwOnError: true });

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  const result = Array.isArray(inspirations) ? inspirations : [inspirations];
  
  if (result.length === 0 || result[0]?.parseError) {
    throw new Error('AI 返回的灵感格式无效，请重试');
  }

  return result;
}

export async function handleWizardSynopsis(prisma, job, { jobId, userId, input }) {
  const { novelId, title, genre, theme, keywords, protagonist, worldSetting, goldenFinger, existingSynopsis, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '简介生成器',
    templateName: '简介生成',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    title: title || novel.title,
    genre: genre || novel.genre || '',
    theme: theme || novel.theme || '',
    keywords: keywords || '',
    protagonist: protagonist || novel.protagonist || '',
    world_setting: worldSetting || novel.worldSetting || '',
    golden_finger: goldenFinger || novel.goldenFinger || '',
    existing_synopsis: existingSynopsis || '',
    special_requirements: specialRequirements || '',
  };

  const fallbackPrompt = `请为小说《${context.title}》生成吸引人的简介（200-350字），返回JSON格式：{"synopsis": "简介内容", "hooks": ["钩子1", "钩子2"], "selling_points": ["卖点1", "卖点2"]}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.8,
    maxTokens: params.maxTokens || 2000,
  }));

  const result = parseModelJson(response.content, { throwOnError: true });

  if (result.synopsis) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { description: result.synopsis },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return result;
}

export async function handleWizardGoldenFinger(prisma, job, { jobId, userId, input }) {
  const { novelId, title, genre, theme, keywords, protagonist, worldSetting, targetWords, existingGoldenFinger, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '金手指生成器',
    templateName: '金手指生成',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    title: title || novel.title,
    genre: genre || novel.genre || '',
    theme: theme || novel.theme || '',
    keywords: keywords || '',
    protagonist: protagonist || novel.protagonist || '',
    world_setting: worldSetting || novel.worldSetting || '',
    target_words: targetWords || novel.targetWordCount || 100,
    existing_golden_finger: existingGoldenFinger || '',
    special_requirements: specialRequirements || '',
  };

  const fallbackPrompt = `请为小说《${context.title}》设计金手指系统，返回JSON格式：{"golden_finger": "金手指描述", "name": "名称", "core_ability": "核心能力", "growth_stages": [], "limitations": [], "highlight_moments": []}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.8,
    maxTokens: params.maxTokens || 3000,
  }));

  const result = parseModelJson(response.content, { throwOnError: true });

  if (result.golden_finger) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { goldenFinger: result.golden_finger },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return result;
}
