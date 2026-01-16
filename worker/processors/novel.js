import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseJsonOutput, parseModelJson } from '../utils/helpers.js';

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

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

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
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 3000,
  }));

  const seedResult = parseJsonOutput(response.content);
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

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

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

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

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
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
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


  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return worldData;
}
