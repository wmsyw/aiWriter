import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson } from '../utils/helpers.js';

function normalizeCreativeIntent(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function resolveCreativeIntent(inputCreativeIntent, novel) {
  const inputIntent = normalizeCreativeIntent(inputCreativeIntent);
  if (inputIntent) return inputIntent;

  const config = novel?.workflowConfig;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const workflowIntent = normalizeCreativeIntent(config.creativeIntent);
    if (workflowIntent) return workflowIntent;
  }

  return '';
}

function resolveSpecialRequirements(inputSpecialRequirements, creativeIntent, novel) {
  return inputSpecialRequirements || creativeIntent || novel.specialRequirements || '';
}

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
  const { novelId, title, theme, genre, keywords, protagonist, specialRequirements, creativeIntent, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');
  const resolvedCreativeIntent = resolveCreativeIntent(creativeIntent, novel);

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
    special_requirements: resolveSpecialRequirements(specialRequirements, resolvedCreativeIntent, novel),
  };

  const fallbackPrompt = `请生成简介、世界观和金手指设定（JSON）：\n书名：${context.title}\n主题：${context.theme}\n类型：${context.genre}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    maxTokens: 3000,
  });

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

  return seedResult;
}

export async function handleWizardWorldBuilding(prisma, job, { jobId, userId, input }) {
  const { novelId, theme, genre, keywords, protagonist, worldSetting, specialRequirements, creativeIntent, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');
  const resolvedCreativeIntent = resolveCreativeIntent(creativeIntent, novel);

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
    special_requirements: resolveSpecialRequirements(specialRequirements, resolvedCreativeIntent, novel),
  };

  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请根据以下信息生成小说世界观设定，并返回 JSON：\n\n字段：world_time_period, world_location, world_atmosphere, world_rules, world_setting\n\n主题：${context.theme || '无'}\n类型：${context.genre || '无'}\n关键词：${context.keywords || '无'}\n主角：${context.protagonist || '无'}\n已有设定：${context.world_setting || '无'}\n特殊要求：${context.special_requirements || '无'}`;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    maxTokens: 3000,
  });

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

  return worldData;
}

/**
 * @param {PrismaClient} prisma
 * @param {Job} job
 * @param {JobContext} context
 * @returns {Promise<Inspiration[]>}
 */
export async function handleWizardInspiration(prisma, job, { jobId, userId, input }) {
  const { genre, targetWords, targetAudience, targetPlatform, keywords, count, agentId } = input;

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
    target_words: Number.isFinite(targetWords) ? targetWords : 100,
    target_platform: targetPlatform || '通用网文平台',
    target_audience: targetAudience || '男性读者',
    keywords: sanitizedKeywords,
    count: Math.min(Math.max(count || 5, 1), 10),
  };

  const fallbackPrompt = `你是资深网文策划。请基于以下约束生成 ${context.count} 个可直接开书的高质量灵感方案。

【硬性约束】
- 类型：${context.genre}
- 目标字数：${context.target_words} 万字
- 目标平台：${context.target_platform}
- 目标读者：${context.target_audience}
- 用户关键词：${context.keywords || '无'}

【内容质量要求】
1. 不能用一句话敷衍，每个字段都要有信息密度和可写性。
2. 每个灵感都要可支撑长篇连载，包含成长空间与持续冲突。
3. 灵感之间必须明显差异化（主角路径、金手指机制、世界规则至少两项不同）。

【每个灵感必须包含以下字段】
- name：书名风格标题，12-24字，强记忆点。
- theme：核心主题与主冲突，80-140字，写清“主角想要什么、对手/阻力是什么、故事长期驱动力是什么”。
- synopsis：小说简介，约 200 字（建议 180-230 字），需包含开场钩子、主线冲突、阶段目标与悬念收束。
- keywords：6-10个关键词，避免泛词。
- protagonist：主角详细设定，180-260字，至少包含 身份背景/性格缺陷/核心目标/成长弧线/关键关系。
- worldSetting：世界观详细设定，180-260字，至少包含 时代与地理格局/力量或规则体系/主要势力结构/核心矛盾。
- goldenFinger：金手指详细描写，220-320字，必须包含 机制说明/升级路径/触发条件/限制与代价/中后期天花板与反制风险。
- hook：开篇钩子与追读驱动，120-180字，写清第一章抓手与前三卷持续爽点。
- potential：商业潜力分析，80-140字，结合目标平台与目标读者说明卖点与风险点。

【输出格式要求】
- 只返回 JSON 数组，不要 Markdown，不要注释，不要额外说明。
- 严格使用字段名：name, theme, synopsis, keywords, protagonist, worldSetting, goldenFinger, hook, potential。
- keywords 必须是字符串数组。
`;

  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    maxTokens: 4000,
  });

  const inspirations = parseModelJson(response.content, { throwOnError: true });

  const result = Array.isArray(inspirations) ? inspirations : [inspirations];
  
  if (result.length === 0 || result[0]?.parseError) {
    throw new Error('AI 返回的灵感格式无效，请重试');
  }

  return result;
}

export async function handleWizardSynopsis(prisma, job, { jobId, userId, input }) {
  const { novelId, title, genre, theme, keywords, protagonist, worldSetting, goldenFinger, existingSynopsis, specialRequirements, creativeIntent, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');
  const resolvedCreativeIntent = resolveCreativeIntent(creativeIntent, novel);

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
    special_requirements: resolveSpecialRequirements(specialRequirements, resolvedCreativeIntent, novel),
  };

  const fallbackPrompt = `请为小说《${context.title}》生成吸引人的简介（200-350字），返回JSON格式：{"synopsis": "简介内容", "hooks": ["钩子1", "钩子2"], "selling_points": ["卖点1", "卖点2"]}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    maxTokens: 2000,
  });

  const result = parseModelJson(response.content, { throwOnError: true });

  if (result.synopsis) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { description: result.synopsis },
    });
  }
  return result;
}

export async function handleWizardGoldenFinger(prisma, job, { jobId, userId, input }) {
  const { novelId, title, genre, theme, keywords, protagonist, worldSetting, targetWords, existingGoldenFinger, specialRequirements, creativeIntent, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');
  const resolvedCreativeIntent = resolveCreativeIntent(creativeIntent, novel);

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
    special_requirements: resolveSpecialRequirements(specialRequirements, resolvedCreativeIntent, novel),
  };

  const fallbackPrompt = `请为小说《${context.title}》设计金手指系统，返回JSON格式：{"golden_finger": "金手指描述", "name": "名称", "core_ability": "核心能力", "growth_stages": [], "limitations": [], "highlight_moments": []}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    maxTokens: 3000,
  });

  const result = parseModelJson(response.content, { throwOnError: true });

  if (result.golden_finger) {
    await prisma.novel.update({
      where: { id: novelId },
      data: { goldenFinger: result.golden_finger },
    });
  }
  return result;
}
