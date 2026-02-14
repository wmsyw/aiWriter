import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson } from '../utils/helpers.js';
import { generateCharacterBios } from './character.js';
import { getOutlineRoughTemplateName, TEMPLATE_NAMES } from '../../src/shared/template-names.js';
import { calculateOutlineParams } from '../../src/shared/outline-calculator.js';

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

function resolveSpecialRequirements(specialRequirements, creativeIntent) {
  if (typeof specialRequirements === 'string' && specialRequirements.trim()) {
    return specialRequirements;
  }
  if (typeof creativeIntent === 'string' && creativeIntent.trim()) {
    return creativeIntent.trim();
  }
  return '';
}

export async function handleOutlineRough(prisma, job, { jobId, userId, input }) {
  const { 
    novelId, 
    keywords, 
    theme, 
    genre, 
    targetWords, 
    chapterCount, 
    protagonist, 
    worldSetting, 
    specialRequirements, 
    creativeIntent,
    agentId, 
    prev_volume_summary,
    user_guidance 
  } = input;

  // 使用单卷模板
  const selectedTemplateName = 'OUTLINE_ROUGH_SINGLE';

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_ROUGH_OUTLINE,
    fallbackAgentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName: selectedTemplateName,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const calculatedParams = calculateOutlineParams(targetWords || 100, chapterCount);
  const effectiveNodesPerVolume = calculatedParams.nodesPerVolume;
  const effectiveChaptersPerNode = calculatedParams.chaptersPerNode;
  
  const context = {
    keywords: keywords || '',
    theme: theme || '',
    genre: genre || '',
    target_words: targetWords || null,
    chapter_count: chapterCount || calculatedParams.totalChapters,
    protagonist: protagonist || '',
    world_setting: worldSetting || '',
    special_requirements: resolveSpecialRequirements(specialRequirements, creativeIntent),
    prev_volume_summary: prev_volume_summary || '无（这是第一卷）',
    user_guidance: user_guidance || '无',
    nodes_per_volume: effectiveNodesPerVolume,
    chapters_per_node: effectiveChaptersPerNode,
  };

  const fallbackPrompt = `请生成小说的一卷粗略大纲（JSON 输出）：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n前卷概要：${prev_volume_summary || '无'}\n用户指引：${user_guidance || '无'}`;
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
    maxTokens: 4000,
  });

  let roughOutline = parseModelJson(response.content);
  if (roughOutline.raw) {
    roughOutline = response.content;
  }

  // 单卷模式下，我们不再全量更新 outlineRough，而是返回生成的单卷数据
  // 前端负责将其追加到现有的 outline tree 中
  
  return roughOutline;
}

export async function handleOutlineDetailed(prisma, job, { jobId, userId, input }) {
  const { 
    novelId, 
    roughOutline, 
    targetWords, 
    chapterCount,
    detailedNodeCount,
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
    parent_rough_node, // 新增：父粗纲节点对象
    prev_detailed_node, // 新增：前一个细纲节点对象
    user_guidance, // 新增：用户指引
  } = input;

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_DETAILED_OUTLINE,
    fallbackAgentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName: TEMPLATE_NAMES.OUTLINE_DETAILED,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const isEmptyObject = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length === 0;
  const hasValidRoughOutline = roughOutline && !isEmptyObject(roughOutline);
  
  const roughOutlinePayload = hasValidRoughOutline
    ? (typeof roughOutline === 'string' ? roughOutline : JSON.stringify(roughOutline, null, 2))
    : '';

  const calculatedParams = calculateOutlineParams(targetWords || 100, chapterCount);
  const effectiveNodesPerVolume = detailedNodeCount || calculatedParams.nodesPerVolume;

  const isSingleBlockMode = target_id && target_title && !roughOutlinePayload;
  
  let context;
  if (regenerate_single) {
    context = {
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
    };
  } else if (isSingleBlockMode) {
    context = {
      target_id: target_id || '',
      target_title: target_title || '',
      target_content: target_content || '',
      rough_outline_context: rough_outline_context || '',
      prev_block_title: prev_block_title || '',
      prev_block_content: prev_block_content || '',
      next_block_title: next_block_title || '',
      next_block_content: next_block_content || '',
      target_words: targetWords || null,
      detailed_node_count: effectiveNodesPerVolume,
      expected_node_words: calculatedParams.expectedNodeWords,
      chapters_per_node: calculatedParams.chaptersPerNode,
      // 新增上下文
      parent_rough_node: parent_rough_node ? JSON.stringify(parent_rough_node) : '',
      prev_detailed_node: prev_detailed_node ? JSON.stringify(prev_detailed_node) : '',
      user_guidance: user_guidance || '',
    };
  } else {
    // 批量模式：传递完整粗纲，同时确保模板所有变量都有值（避免模板条件失败时显示空）
    context = {
      rough_outline: roughOutlinePayload,
      target_words: targetWords || null,
      chapter_count: chapterCount || calculatedParams.totalChapters,
      detailed_node_count: effectiveNodesPerVolume,
      expected_node_words: calculatedParams.expectedNodeWords,
      chapters_per_node: calculatedParams.chaptersPerNode,
      prev_block_title: prev_block_title || '',
      prev_block_content: prev_block_content || '',
      next_block_title: next_block_title || '',
      next_block_content: next_block_content || '',
      // 确保单块模式变量也存在（即使为空），避免模板渲染错误
      target_id: target_id || '',
      target_title: target_title || '',
      target_content: target_content || '',
      rough_outline_context: rough_outline_context || '',
      parent_rough_node: parent_rough_node ? JSON.stringify(parent_rough_node) : '',
      prev_detailed_node: prev_detailed_node ? JSON.stringify(prev_detailed_node) : '',
      user_guidance: user_guidance || '',
      regenerate_single: false,
    };
  }

  const fallbackPrompt = regenerate_single || isSingleBlockMode
    ? `请为以下分卷生成细纲节点（JSON 输出）：\n分卷标题：${target_title || '未知'}\n分卷内容：${target_content || '无'}\n全文大纲背景：${rough_outline_context || '无'}\n用户指引：${user_guidance || '无'}`
    : `请基于粗略大纲生成细纲（JSON 输出）：\n${roughOutlinePayload || '无'}`;
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
    maxTokens: 6000,
  });

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

  if (novelId && !regenerate_single && !isSingleBlockMode) {
    await prisma.novel.updateMany({
      where: { id: novelId, userId },
      data: {
        outlineDetailed: detailedOutline,
        outlineStage: 'detailed',
        generationStage: 'detailed',
      },
    });
  }

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
    chaptersPerNode,
    targetWords,
    chapterCount,
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
    parent_rough_title,
    parent_rough_content,
    prev_chapters_summary, // 新增：前10章总结
    recent_chapters_content, // 新增：前3章详细内容
    user_guidance, // 新增：用户指引
    parent_detailed_node // 新增：父细纲节点
  } = input;

  const isEmptyObject = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length === 0;
  const hasValidDetailedOutline = detailedOutline && !isEmptyObject(detailedOutline);

  const detailedPayload = hasValidDetailedOutline
    ? (typeof detailedOutline === 'string' ? detailedOutline : JSON.stringify(detailedOutline, null, 2))
    : '';

  const isSingleBlockMode = target_id && target_title && !detailedPayload;

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

  const calculatedParams = calculateOutlineParams(targetWords || 100, chapterCount);
  const effectiveChaptersPerNode = chaptersPerNode || calculatedParams.chaptersPerNode;

  let context;
  if (regenerate_single) {
    context = {
      target_id: target_id || '',
      target_title: target_title || '',
      target_content: target_content || '',
      detailed_outline_context: detailed_outline_context || '',
      prev_chapter_title: prev_chapter_title || '',
      prev_chapter_content: prev_chapter_content || '',
      next_chapter_title: next_chapter_title || '',
      next_chapter_content: next_chapter_content || '',
      original_chapter_title: original_chapter_title || '',
    };
  } else if (isSingleBlockMode) {
    context = {
      target_id: target_id || '',
      target_title: target_title || '',
      target_content: target_content || '',
      detailed_outline_context: detailed_outline_context || '',
      parent_rough_title: parent_rough_title || '',
      parent_rough_content: parent_rough_content || '',
      chapters_per_node: effectiveChaptersPerNode,
      words_per_chapter: calculatedParams.wordsPerChapter,
      // 新增上下文
      prev_chapters_summary: prev_chapters_summary || '',
      recent_chapters_content: recent_chapters_content || '',
      user_guidance: user_guidance || '',
      parent_detailed_node: parent_detailed_node ? JSON.stringify(parent_detailed_node) : '',
    };
  } else {
    context = {
      detailed_outline: detailedPayload,
      chapters_per_node: effectiveChaptersPerNode,
      words_per_chapter: calculatedParams.wordsPerChapter,
      target_id: target_id || '',
      target_title: target_title || '',
      target_content: target_content || '',
      detailed_outline_context: detailed_outline_context || '',
      parent_rough_title: parent_rough_title || '',
      parent_rough_content: parent_rough_content || '',
      prev_chapter_title: prev_chapter_title || '',
      prev_chapter_content: prev_chapter_content || '',
      next_chapter_title: next_chapter_title || '',
      next_chapter_content: next_chapter_content || '',
      original_chapter_title: original_chapter_title || '',
      prev_chapters_summary: prev_chapters_summary || '',
      recent_chapters_content: recent_chapters_content || '',
      user_guidance: user_guidance || '',
      parent_detailed_node: parent_detailed_node ? JSON.stringify(parent_detailed_node) : '',
      regenerate_single: false,
    };
  }

  const fallbackPrompt = (regenerate_single || isSingleBlockMode)
    ? `请为以下细纲事件生成章节大纲（JSON 输出）：\n事件标题：${target_title || '未知'}\n事件内容：${target_content || '无'}\n所属分卷：${parent_rough_title || '无'}\n全文细纲背景：${detailed_outline_context || '无'}\n用户指引：${user_guidance || '无'}`
    : `请基于细纲生成章节大纲（JSON 输出）：\n${detailedPayload || '无'}`;
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
    temperature: 0.6,
    maxTokens: 8000,
  });

  let chapterOutlines = parseModelJson(response.content);
  if (chapterOutlines.raw) {
    chapterOutlines = response.content;
  }

  if (novelId && !regenerate_single && !isSingleBlockMode) {
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

  return chapterOutlines;
}

export async function handleOutlineGenerate(prisma, job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, creativeIntent, agentId } = input;
  
  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: TEMPLATE_NAMES.AGENT_OUTLINE,
    templateName: TEMPLATE_NAMES.OUTLINE_GENERATE,
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
    special_requirements: resolveSpecialRequirements(specialRequirements, creativeIntent),
  };
  
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请根据以下要求生成小说大纲：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}`;
  
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
    maxTokens: 8000,
  });
  
  const output = parseModelJson(response.content);
  const result = output.raw ? response.content : output;
  
  return result;
}
