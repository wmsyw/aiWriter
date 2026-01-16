import { renderTemplateString } from '../../src/server/services/templates.js';
import { FALLBACK_PROMPTS } from '../../src/constants/prompts.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseModelJson } from '../utils/helpers.js';

export async function generateCharacterBios(prisma, { userId, novelId, characters, outlineContext, agentId, jobId }) {
  if (!characters || characters.length === 0) return { characters: [], materialIds: [] };

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '角色传记生成器',
    fallbackAgentName: '角色生成器',
    templateName: '角色传记生成',
  });

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);
  const context = {
    characters_brief: JSON.stringify(characters, null, 2),
    outline_context: outlineContext || '',
  };

  const fallbackPrompt = `请为这些角色生成完整传记（JSON）：\n${context.characters_brief}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 6000,
  }));

  const parsed = parseModelJson(response.content);
  const bioCharacters = Array.isArray(parsed.characters) ? parsed.characters : [];

  const existingNames = await prisma.material.findMany({
    where: { novelId, userId, type: 'character', name: { in: bioCharacters.map(c => c.name).filter(Boolean) } },
    select: { name: true },
  });
  const existingSet = new Set(existingNames.map(item => item.name));

  const materialIds = [];
  await prisma.$transaction(async (tx) => {
    for (const char of bioCharacters) {
      if (!char?.name || existingSet.has(char.name)) continue;
      const material = await tx.material.create({
        data: {
          novelId,
          userId,
          type: 'character',
          name: char.name,
          genre: '通用',
          data: {
            role: char.role || '',
            age: char.age || null,
            appearance: char.appearance || '',
            personality: char.personality || '',
            backstory: char.backstory || '',
            motivation: char.motivation || '',
            abilities: char.abilities || [],
            relationships: char.relationships || [],
            characterArc: char.character_arc || '',
            tags: char.tags || [],
          },
        },
      });
      materialIds.push(material.id);
    }
  });

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return { characters: bioCharacters, materialIds, raw: parsed.raw || null };
}

export async function handleCharacterBios(prisma, job, { jobId, userId, input }) {
  const { novelId, characters, outlineContext, agentId } = input;
  const result = await generateCharacterBios(prisma, { userId, novelId, characters, outlineContext, agentId, jobId });
  return result;
}

export async function handleCharacterChat(prisma, job, { jobId, userId, input }) {
  const { novelId, characterId, userMessage, conversationHistory, agentId } = input;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');
  
  const character = await prisma.material.findFirst({ where: { id: characterId, novelId, type: 'character' } });
  if (!character) throw new Error('Character not found');
  
  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '角色对话' }, orderBy: { createdAt: 'desc' } });
  
  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;
  
  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);
  
  const charData = character.data || {};
  const context = {
    novel_title: novel.title,
    character_name: character.name,
    character_profile: charData.description || '',
    character_backstory: charData.backstory || '',
    conversation_history: conversationHistory || '',
    user_message: userMessage,
  };
  
  const prompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHARACTER_CHAT(character.name, userMessage);
  
  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.8,
    maxTokens: params.maxTokens || 2000,
  }));
  
  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  
  return {
    characterName: character.name,
    response: response.content,
  };
}

export async function handleWizardCharacters(prisma, job, { jobId, userId, input }) {
  const { novelId, theme, genre, keywords, protagonist, worldSetting, characterCount = 5, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '角色生成器',
    templateName: '角色生成',
  });

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    theme: theme || novel.theme || '',
    genre: genre || novel.genre || '',
    keywords: (keywords || novel.keywords || []).join(', '),
    protagonist: protagonist || novel.protagonist || '',
    world_setting: worldSetting || novel.worldSetting || '',
    character_count: characterCount,
  };

  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请根据以下信息生成角色设定，返回 JSON 数组，每项包含 name, role, description, traits, goals：\n\n主题：${context.theme || '无'}\n类型：${context.genre || '无'}\n关键词：${context.keywords || '无'}\n主角：${context.protagonist || '无'}\n世界观：${context.world_setting || '无'}\n角色数量：${context.character_count}`;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 4000,
  }));

  let parsedCharacters = [];
  const parsed = parseModelJson(response.content);
  if (Array.isArray(parsed)) {
    parsedCharacters = parsed;
  } else if (parsed && Array.isArray(parsed.characters)) {
    parsedCharacters = parsed.characters;
  }

  const characterMaterials = [];
  const characterErrors = [];

  await prisma.$transaction(async (tx) => {
    for (const char of parsedCharacters) {
      if (!char?.name) continue;
      try {
        const material = await tx.material.create({
          data: {
            novelId,
            userId,
            type: 'character',
            name: char.name,
            genre: novel.genre || '通用',
            data: {
              role: char.role || '',
              description: char.description || '',
              traits: char.traits || '',
              goals: char.goals || '',
            },
          },
        });
        characterMaterials.push(material.id);
      } catch (error) {
        characterErrors.push({ name: char.name, error: error.message });
      }
    }

    await tx.novel.update({
      where: { id: novelId },
      data: {
        wizardStatus: 'in_progress',
        wizardStep: Math.max(novel.wizardStep || 0, 2),
      },
    });
  });

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return {
    characters: parsedCharacters,
    materialIds: characterMaterials,
    raw: parsedCharacters.length === 0 ? response.content : null,
    errors: characterErrors.length > 0 ? characterErrors : null,
  };
}
