import { renderTemplateString } from '../../src/server/services/templates.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson } from '../utils/helpers.js';
import { generateCharacterBios } from './character.js';
import { getOutlineRoughTemplateName, TEMPLATE_NAMES } from '../../src/shared/template-names.js';
import { calculateOutlineParams } from '../../src/shared/outline-calculator.js';

const CHAPTER_WORD_MIN = 2000;
const CHAPTER_WORD_MAX = 3000;
const CHAPTER_WORD_DEFAULT = 2500;

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

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function computeVolumeChapterRange(totalChapters, volumeCount) {
  const safeVolumes = Math.max(1, Number(volumeCount) || 1);
  const base = Math.max(1, Math.round((Number(totalChapters) || 0) / safeVolumes));
  const min = Math.max(20, Math.round(base * 0.8));
  const max = Math.max(min + 10, Math.round(base * 1.2));
  return { min, max };
}

function trimOutlineDepth(raw, maxDepth) {
  const childCollectionKeys = ['children', 'blocks', 'story_arcs', 'events', 'chapters', 'nodes', 'scenes'];

  const visit = (value, depth) => {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item, depth));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const next = { ...value };
    for (const key of childCollectionKeys) {
      if (!Array.isArray(next[key])) continue;

      const childDepth = depth + 1;
      if (childDepth > maxDepth) {
        delete next[key];
        continue;
      }
      next[key] = next[key].map((item) => visit(item, childDepth));
    }

    return next;
  };

  return visit(raw, 0);
}

function buildRoughHierarchyGuard({ chapterRangeMin, chapterRangeMax, targetWords, userGuidance, isContinuation = false }) {
  return `\n【分层约束（必须遵守）】\n- 本次任务是“粗纲（单卷）”，不是细纲/章节纲。\n- 输出粒度：仅输出“这一整卷”的宏观蓝图，不得输出逐章列表、逐章标题、逐章剧情。\n- 本卷应覆盖约 ${chapterRangeMin}-${chapterRangeMax} 章的主线推进（允许合理浮动）。\n- 必须包含：卷目标、主线矛盾升级、3-6个阶段里程碑、关键伏笔、卷末钩子。\n- 若出现“第1章/第2章/章节1”等逐章表达，视为不合格并改写为卷级阶段描述。\n- 保持与“前卷概要”和“用户指引”连续，禁止重置世界观和人物动机。\n${isContinuation ? '- 当前是“续写模式”：仅输出新增卷级节点，禁止重写或复制已有分卷内容。' : ''}\n${targetWords ? `- 目标体量：约 ${targetWords} 万字。` : ''}\n${userGuidance ? `- 用户指引优先级最高：${userGuidance}` : ''}`;
}

function buildDetailedHierarchyGuard({ chaptersPerNode, userGuidance, isContinuation = false }) {
  const chapterSpan = Math.max(10, chaptersPerNode);
  const chapterSpanMax = Math.max(chapterSpan + 6, 20);
  return `\n【分层约束（必须遵守）】\n- 本次任务是“细纲（事件簇级）”，不是粗纲/章节纲。\n- 每个细纲节点必须覆盖连续的多章区间（建议 ${chapterSpan}-${chapterSpanMax} 章），不得退化为单章剧情。\n- 每个节点应写清：阶段目标、核心冲突、关键转折、结果变化、对后续节点的钩子。\n- 请显式标注章节区间（示例：第021-032章），并确保区间连续且不重叠。\n- 保持与前置粗纲节点及已生成细纲节点的因果连续。\n${isContinuation ? '- 当前是“续写模式”：仅输出新增细纲节点，禁止重写、复制或回填已有细纲节点。' : ''}\n${userGuidance ? `- 用户指引优先级最高：${userGuidance}` : ''}`;
}

function buildChapterHierarchyGuard({ wordsPerChapter, wordMin = CHAPTER_WORD_MIN, wordMax = CHAPTER_WORD_MAX, userGuidance, isContinuation = false }) {
  const chapterWords = clampNumber(wordsPerChapter, wordMin, wordMax, CHAPTER_WORD_DEFAULT);
  return `\n【分层约束（必须遵守）】\n- 本次任务是“章节纲（单章级）”。每个 children 节点必须对应“1章”，禁止一个节点覆盖多章。\n- 单章规划目标字数：${wordMin}-${wordMax} 字（建议 ${chapterWords} 字）。\n- 每章必须包含：本章看点、开场承接、冲突推进、阶段结果、章末钩子。\n- 新生成章节需与上一批章节自然衔接，角色状态、时间线与伏笔回收必须连续。\n${isContinuation ? '- 当前是“续写模式”：仅输出新增章节纲节点，禁止重写、复制或回填已有章节节点。' : ''}\n${userGuidance ? `- 用户指引优先级最高：${userGuidance}` : ''}`;
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
  const totalChaptersForPlan = chapterCount || calculatedParams.totalChapters;
  const volumeChapterRange = computeVolumeChapterRange(totalChaptersForPlan, calculatedParams.volumeCount);
  const normalizedPrevVolumeSummary = typeof prev_volume_summary === 'string' ? prev_volume_summary.trim() : '';
  const isContinuation = Boolean(
    normalizedPrevVolumeSummary &&
      normalizedPrevVolumeSummary !== '无' &&
      normalizedPrevVolumeSummary !== '无（这是第一卷）'
  );
  
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
    volume_chapter_range_min: volumeChapterRange.min,
    volume_chapter_range_max: volumeChapterRange.max,
  };

  const fallbackPrompt = `请生成小说的一卷粗略大纲（JSON 输出）：\n任务模式：${isContinuation ? '续写下一卷' : '首卷规划'}\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n前卷概要：${prev_volume_summary || '无'}\n用户指引：${user_guidance || '无'}\n本卷目标章节规模：约${volumeChapterRange.min}-${volumeChapterRange.max}章`;
  const roughGuard = buildRoughHierarchyGuard({
    chapterRangeMin: volumeChapterRange.min,
    chapterRangeMax: volumeChapterRange.max,
    targetWords: targetWords || 0,
    userGuidance: user_guidance || '',
    isContinuation,
  });
  const promptBase = template ? renderTemplateString(template.content, context) : fallbackPrompt;
  const prompt = `${promptBase}\n${roughGuard}`;

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
  } else {
    roughOutline = trimOutlineDepth(roughOutline, 1);
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
  const effectiveChaptersPerNode = Math.max(10, calculatedParams.chaptersPerNode);

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
      target_words: targetWords || null,
      chapter_count: chapterCount || calculatedParams.totalChapters,
      detailed_node_count: effectiveNodesPerVolume,
      expected_node_words: calculatedParams.expectedNodeWords,
      chapters_per_node: effectiveChaptersPerNode,
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
      chapters_per_node: effectiveChaptersPerNode,
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
      chapters_per_node: effectiveChaptersPerNode,
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

  const isContinuationMode = Boolean(isSingleBlockMode && !regenerate_single);
  const prevDetailedNodeText = prev_detailed_node
    ? (typeof prev_detailed_node === 'string' ? prev_detailed_node : JSON.stringify(prev_detailed_node, null, 2))
    : '无（当前为首批细纲）';
  const fallbackPrompt = regenerate_single
    ? `请重新生成以下细纲节点（JSON 输出）：\n分卷标题：${target_title || '未知'}\n分卷内容：${target_content || '无'}\n全文大纲背景：${rough_outline_context || '无'}\n用户指引：${user_guidance || '无'}`
    : isContinuationMode
      ? `请为以下分卷续写细纲（仅输出新增节点，JSON 输出）：\n分卷标题：${target_title || '未知'}\n分卷内容：${target_content || '无'}\n前一个细纲节点：${prevDetailedNodeText}\n全文大纲背景：${rough_outline_context || '无'}\n要求：每个新增细纲节点覆盖连续10-30章，且与前序节点因果衔接。\n用户指引：${user_guidance || '无'}`
      : `请基于粗略大纲生成细纲（JSON 输出）：\n${roughOutlinePayload || '无'}`;
  const detailedGuard = buildDetailedHierarchyGuard({
    chaptersPerNode: effectiveChaptersPerNode,
    userGuidance: user_guidance || '',
    isContinuation: isContinuationMode,
  });
  const promptBase = template ? renderTemplateString(template.content, context) : fallbackPrompt;
  const prompt = `${promptBase}\n${detailedGuard}`;

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
  } else {
    detailedOutline = trimOutlineDepth(detailedOutline, 2);
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
    targetWordsPerChapterMin,
    targetWordsPerChapterMax,
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
  const chapterWordMin = clampNumber(targetWordsPerChapterMin, 500, 10000, CHAPTER_WORD_MIN);
  const chapterWordMax = clampNumber(targetWordsPerChapterMax, chapterWordMin, 12000, CHAPTER_WORD_MAX);
  const effectiveWordsPerChapter = clampNumber(
    calculatedParams.wordsPerChapter,
    chapterWordMin,
    chapterWordMax,
    CHAPTER_WORD_DEFAULT
  );

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
      words_per_chapter: effectiveWordsPerChapter,
      words_per_chapter_min: chapterWordMin,
      words_per_chapter_max: chapterWordMax,
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
      words_per_chapter: effectiveWordsPerChapter,
      words_per_chapter_min: chapterWordMin,
      words_per_chapter_max: chapterWordMax,
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
      words_per_chapter: effectiveWordsPerChapter,
      words_per_chapter_min: chapterWordMin,
      words_per_chapter_max: chapterWordMax,
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

  const isContinuationMode = Boolean(isSingleBlockMode && !regenerate_single);
  const fallbackPrompt = regenerate_single
    ? `请重新生成以下章节纲节点（JSON 输出）：\n事件标题：${target_title || '未知'}\n事件内容：${target_content || '无'}\n所属分卷：${parent_rough_title || '无'}\n全文细纲背景：${detailed_outline_context || '无'}\n用户指引：${user_guidance || '无'}`
    : isContinuationMode
      ? `请为以下细纲事件续写章节纲（仅输出新增章节节点，JSON 输出）：\n事件标题：${target_title || '未知'}\n事件内容：${target_content || '无'}\n所属分卷：${parent_rough_title || '无'}\n前10章摘要：${prev_chapters_summary || '无'}\n最近3章内容：${recent_chapters_content || '无'}\n要求：每个新增节点仅对应1章，单章计划字数${chapterWordMin}-${chapterWordMax}字，并与上一章自然衔接。\n用户指引：${user_guidance || '无'}`
      : `请基于细纲生成章节大纲（JSON 输出）：\n${detailedPayload || '无'}\n要求：每章规划字数${chapterWordMin}-${chapterWordMax}字`;
  const chapterGuard = buildChapterHierarchyGuard({
    wordsPerChapter: effectiveWordsPerChapter,
    wordMin: chapterWordMin,
    wordMax: chapterWordMax,
    userGuidance: user_guidance || '',
    isContinuation: isContinuationMode,
  });
  const promptBase = template ? renderTemplateString(template.content, context) : fallbackPrompt;
  const prompt = `${promptBase}\n${chapterGuard}`;

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
  } else {
    chapterOutlines = trimOutlineDepth(chapterOutlines, 3);
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
