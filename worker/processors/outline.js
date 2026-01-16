import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseJsonOutput } from '../utils/helpers.js';
import { generateCharacterBios } from './character.js';

function extractCharactersFromMarkdown(content) {
  const characters = [];
  // Pattern: - **Name**: Role, Description
  // Matches: - **李逍遥**: 主角，性格机智...
  // Matches: - **赵灵儿** (女主角): 温柔善良...
  const regex = /-\s*\*\*([^*]+)\*\*[:：]?\s*(?:[\(（]([^)）]+)[\)）])?[:：]?\s*([^\n]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    if (name.length > 50) continue;
    
    characters.push({
      name: name,
      role: match[2] ? match[2].trim() : '配角',
      brief: match[3] ? match[3].trim() : '',
    });
  }
  return characters;
}

export async function handleOutlineRough(prisma, job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '粗纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '粗略大纲生成',
  });

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    keywords: keywords || '',
    theme: theme || '',
    genre: genre || '',
    target_words: targetWords || null,
    chapter_count: chapterCount || null,
    protagonist: protagonist || '',
    world_setting: worldSetting || '',
    special_requirements: specialRequirements || '',
  };

  const fallbackPrompt = `请生成粗略大纲，分段描述故事主线（JSON 输出）：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}\n目标字数：${targetWords || '未知'}万字`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 4000,
  }));

  let roughOutline = parseJsonOutput(response.content);
  // Support both JSON and raw string (Markdown)
  if (roughOutline.raw) {
    roughOutline = response.content;
  }

  if (novelId) {
    await prisma.novel.updateMany({
      where: { id: novelId, userId },
      data: {
        outlineRough: roughOutline,
        outlineStage: 'rough',
        generationStage: 'rough',
      },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return roughOutline;
}

export async function handleOutlineDetailed(prisma, job, { jobId, userId, input }) {
  const { novelId, roughOutline, targetWords, chapterCount, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '细纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '细纲生成',
  });

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const roughOutlinePayload = roughOutline
    ? (typeof roughOutline === 'string' ? roughOutline : JSON.stringify(roughOutline, null, 2))
    : '';

  const context = {
    rough_outline: roughOutlinePayload,
    target_words: targetWords || null,
    chapter_count: chapterCount || null,
  };

  const fallbackPrompt = `请基于粗略大纲生成细纲（JSON 输出）：\n${roughOutlinePayload || '无'}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 6000,
  }));

  let detailedOutline = parseJsonOutput(response.content);
  // Support Markdown raw output
  if (detailedOutline.raw) {
    detailedOutline = response.content;
  }

  // Extract characters (supports both JSON and Markdown)
  let uniqueCharacters = new Map();
  
  if (typeof detailedOutline === 'string') {
    const chars = extractCharactersFromMarkdown(detailedOutline);
    for (const char of chars) {
      if (!uniqueCharacters.has(char.name)) {
        uniqueCharacters.set(char.name, char);
      }
    }
  } else if (Array.isArray(detailedOutline.story_arcs)) {
    const charactersFromArcs = detailedOutline.story_arcs.flatMap(arc => Array.isArray(arc.new_characters) ? arc.new_characters : []);
    for (const char of charactersFromArcs) {
      if (char?.name && !uniqueCharacters.has(char.name)) {
        uniqueCharacters.set(char.name, { name: char.name, role: char.role || '', brief: char.brief || '' });
      }
    }
  }

  let characterBiosResult = { characters: [], materialIds: [] };
  if (novelId && uniqueCharacters.size > 0) {
    characterBiosResult = await generateCharacterBios(prisma, {
      userId,
      novelId,
      characters: Array.from(uniqueCharacters.values()),
      outlineContext: roughOutlinePayload,
      agentId,
      jobId,
    });
  }

  if (novelId) {
    await prisma.novel.updateMany({
      where: { id: novelId, userId },
      data: {
        outlineDetailed: detailedOutline,
        outlineStage: 'detailed',
        generationStage: 'detailed',
      },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  if (typeof detailedOutline === 'string') {
    return detailedOutline;
  }

  return {
    ...detailedOutline,
    characterBios: characterBiosResult.characters,
    characterMaterialIds: characterBiosResult.materialIds,
  };
}

export async function handleOutlineChapters(prisma, job, { jobId, userId, input }) {
  const { novelId, detailedOutline, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节大纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '章节大纲生成',
  });

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const detailedPayload = detailedOutline
    ? (typeof detailedOutline === 'string' ? detailedOutline : JSON.stringify(detailedOutline, null, 2))
    : '';

  const context = {
    detailed_outline: detailedPayload,
  };

  const fallbackPrompt = `请基于细纲生成章节大纲（JSON 输出）：\n${detailedPayload || '无'}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.6,
    maxTokens: params.maxTokens || 8000,
  }));

  let chapterOutlines = parseJsonOutput(response.content);
  // Support Markdown raw output
  if (chapterOutlines.raw) {
    chapterOutlines = response.content;
  }

  if (novelId) {
    await prisma.novel.updateMany({
      where: { id: novelId, userId },
      data: {
        outlineChapters: chapterOutlines,
        outline: typeof chapterOutlines === 'string' ? chapterOutlines : JSON.stringify(chapterOutlines, null, 2),
        outlineStage: 'chapters',
        generationStage: 'chapters',
        wizardStatus: 'in_progress',
        wizardStep: 3,
      },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return chapterOutlines;
}

export async function handleOutlineGenerate(prisma, job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;
  
  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '大纲生成器' }, orderBy: { createdAt: 'desc' } });
  
  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;
  
  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);
  
  const context = {
    keywords: keywords || '',
    theme: theme || '',
    genre: genre || '',
    target_words: targetWords || null,
    chapter_count: chapterCount || null,
    protagonist: protagonist || '',
    world_setting: worldSetting || '',
    special_requirements: specialRequirements || '',
  };
  
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请根据以下要求生成小说大纲：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}`;
  
  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 8000,
  }));
  
  const output = parseJsonOutput(response.content);
  // Support raw output
  const result = output.raw ? response.content : output;
  
  await trackUsage(prisma, userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}
