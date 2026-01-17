import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseModelJson, resolveModel } from '../utils/helpers.js';
import { generateCharacterBios } from './character.js';
import { getOutlineRoughTemplateName, TEMPLATE_NAMES } from '../../src/shared/template-names.js';

function extractCharactersFromMarkdown(content) {
  const characters = [];
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

  const selectedTemplateName = getOutlineRoughTemplateName(targetWords);

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_ROUGH_OUTLINE,
    fallbackAgentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName: selectedTemplateName,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

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
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 4000,
  }));

  let roughOutline = parseModelJson(response.content);
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

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return roughOutline;
}

export async function handleOutlineDetailed(prisma, job, { jobId, userId, input }) {
  const { 
    novelId, 
    roughOutline, 
    targetWords, 
    chapterCount, 
    agentId, 
    prev_block_title, 
    prev_block_content, 
    next_block_title, 
    next_block_content,
    regenerate_single,
    target_id,
    target_title,
    target_content,
    rough_outline_context,
    original_node_title,
  } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_DETAILED_OUTLINE,
    fallbackAgentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName: TEMPLATE_NAMES.OUTLINE_DETAILED,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const roughOutlinePayload = roughOutline
    ? (typeof roughOutline === 'string' ? roughOutline : JSON.stringify(roughOutline, null, 2))
    : '';

  const context = regenerate_single ? {
    target_id: target_id || '',
    target_title: target_title || '',
    target_content: target_content || '',
    rough_outline_context: rough_outline_context || '',
    prev_block_title: prev_block_title || '',
    prev_block_content: prev_block_content || '',
    next_block_title: next_block_title || '',
    next_block_content: next_block_content || '',
    original_node_title: original_node_title || '',
    regenerate_single: true,
  } : {
    rough_outline: roughOutlinePayload,
    target_words: targetWords || null,
    chapter_count: chapterCount || null,
    prev_block_title: prev_block_title || '',
    prev_block_content: prev_block_content || '',
    next_block_title: next_block_title || '',
    next_block_content: next_block_content || '',
  };

  const fallbackPrompt = regenerate_single
    ? `请重新生成细纲节点（JSON 输出）：\n当前节点：${target_title || '未知'}\n上下文：${rough_outline_context || '无'}`
    : `请基于粗略大纲生成细纲（JSON 输出）：\n${roughOutlinePayload || '无'}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 6000,
  }));

  let detailedOutline = parseModelJson(response.content);
  if (detailedOutline.raw) {
    detailedOutline = response.content;
  }

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
  if (novelId && uniqueCharacters.size > 0 && !regenerate_single) {
    characterBiosResult = await generateCharacterBios(prisma, {
      userId,
      novelId,
      characters: Array.from(uniqueCharacters.values()),
      outlineContext: roughOutlinePayload,
      agentId,
      jobId,
    });
  }

  if (novelId && !regenerate_single) {
    await prisma.novel.updateMany({
      where: { id: novelId, userId },
      data: {
        outlineDetailed: detailedOutline,
        outlineStage: 'detailed',
        generationStage: 'detailed',
      },
    });
  }

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

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
  const { 
    novelId, 
    detailedOutline, 
    agentId,
    regenerate_single,
    target_id,
    target_title,
    target_content,
    detailed_outline_context,
    prev_chapter_title,
    prev_chapter_content,
    next_chapter_title,
    next_chapter_content,
    original_chapter_title,
  } = input;

  const templateName = regenerate_single 
    ? TEMPLATE_NAMES.OUTLINE_CHAPTER_SINGLE 
    : TEMPLATE_NAMES.OUTLINE_CHAPTERS;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_CHAPTER_OUTLINE,
    fallbackAgentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const detailedPayload = detailedOutline
    ? (typeof detailedOutline === 'string' ? detailedOutline : JSON.stringify(detailedOutline, null, 2))
    : '';

  const context = regenerate_single ? {
    target_id: target_id || '',
    target_title: target_title || '',
    target_content: target_content || '',
    detailed_outline_context: detailed_outline_context || '',
    prev_chapter_title: prev_chapter_title || '',
    prev_chapter_content: prev_chapter_content || '',
    next_chapter_title: next_chapter_title || '',
    next_chapter_content: next_chapter_content || '',
    original_chapter_title: original_chapter_title || '',
  } : {
    detailed_outline: detailedPayload,
  };

  const fallbackPrompt = regenerate_single
    ? `请重新生成章节大纲（JSON 输出）：\n当前章节：${target_title || '未知'}\n上下文：${detailed_outline_context || '无'}`
    : `请基于细纲生成章节大纲（JSON 输出）：\n${detailedPayload || '无'}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.6,
    maxTokens: params.maxTokens || 8000,
  }));

  let chapterOutlines = parseModelJson(response.content);
  if (chapterOutlines.raw) {
    chapterOutlines = response.content;
  }

  if (novelId && !regenerate_single) {
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

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return chapterOutlines;
}

export async function handleOutlineGenerate(prisma, job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;
  
  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: TEMPLATE_NAMES.AGENT_OUTLINE }, orderBy: { createdAt: 'desc' } });
  
  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;
  
  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);
  
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
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 8000,
  }));
  
  const output = parseModelJson(response.content);
  const result = output.raw ? response.content : output;
  
  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);
  return result;
}
