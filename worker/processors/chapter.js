import { renderTemplateString } from '../../src/server/services/templates.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { saveVersion, saveBranchVersions, deleteUnusedBranches } from '../../src/server/services/versioning.js';
import { webSearch, formatSearchResultsForContext, shouldSearchForTopic, extractSearchQueries } from '../../src/server/services/web-search.js';
import { decryptApiKey } from '../../src/core/crypto.js';
import { FALLBACK_PROMPTS, WEB_SEARCH_PREFIX, ITERATION_PROMPT_TEMPLATE } from '../../src/constants/prompts.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime } from '../utils/helpers.js';
import { checkBlockingPendingEntities } from '../../src/server/services/pending-entities.js';
import { formatHooksForContext } from '../../src/server/services/hooks.js';
import { assembleContextAsString } from '../../src/server/services/context-assembly.js';
import { enqueuePostGenerationJobs } from '../../src/server/services/post-generation-jobs.js';

function toCleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeChapterCard(rawCard) {
  if (!rawCard || typeof rawCard !== 'object') return null;

  const card = {
    must: toCleanList(rawCard.must),
    should: toCleanList(rawCard.should),
    mustNot: toCleanList(rawCard.mustNot),
    hooks: toCleanList(rawCard.hooks),
    styleGuidance: typeof rawCard.styleGuidance === 'string' ? rawCard.styleGuidance.trim() : '',
    sceneObjective: typeof rawCard.sceneObjective === 'string' ? rawCard.sceneObjective.trim() : '',
  };

  const hasContent = (
    card.must.length ||
    card.should.length ||
    card.mustNot.length ||
    card.hooks.length ||
    card.styleGuidance ||
    card.sceneObjective
  );

  return hasContent ? card : null;
}

function extractChapterOutlineFromNovel(chapter) {
  const chapterOutlines = chapter?.novel?.outlineChapters;
  if (!Array.isArray(chapterOutlines)) return '';

  const item = chapterOutlines[chapter.order - 1];
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object') {
    const candidate = item.summary || item.content || item.title;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    try {
      return JSON.stringify(item);
    } catch {
      return '';
    }
  }

  return '';
}

function deriveChapterCardFromOutline(outline) {
  if (!outline) return null;

  const must = outline
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*•\d.、\s]+/, ''))
    .filter(Boolean)
    .slice(0, 4);

  if (!must.length) {
    const fallback = outline.trim().slice(0, 120);
    return fallback ? { must: [fallback], should: [], mustNot: [], hooks: [] } : null;
  }

  return {
    must,
    should: [],
    mustNot: [],
    hooks: [],
  };
}

function formatChapterCardForPrompt(card) {
  if (!card) return '';

  const lines = ['## 章节任务卡（必须遵循）'];

  const pushList = (title, items) => {
    if (!items || items.length === 0) return;
    lines.push(title);
    items.forEach((item) => lines.push(`- ${item}`));
  };

  pushList('Must（本章必须发生）', card.must);
  pushList('Should（优先覆盖）', card.should);
  pushList('MustNot（禁止偏离）', card.mustNot);
  pushList('Hooks（本章需触及钩子）', card.hooks);

  if (card.sceneObjective) {
    lines.push(`场景目标：${card.sceneObjective}`);
  }
  if (card.styleGuidance) {
    lines.push(`风格指导：${card.styleGuidance}`);
  }

  return lines.join('\n');
}

function resolveOutlineAndChapterCard(chapter, rawOutline, rawChapterCard) {
  const resolvedOutline = (rawOutline || extractChapterOutlineFromNovel(chapter) || '').trim();
  const normalizedCard = normalizeChapterCard(rawChapterCard);
  const chapterCard = normalizedCard || deriveChapterCardFromOutline(resolvedOutline);

  return {
    outline: resolvedOutline,
    chapterCard,
    chapterCardSection: formatChapterCardForPrompt(chapterCard),
  };
}

async function getUserSearchConfig(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = user?.preferences || {};
  
  let apiKey = process.env.WEB_SEARCH_API_KEY || null;
  if (prefs.webSearchApiKeyCiphertext) {
    try {
      apiKey = decryptApiKey(prefs.webSearchApiKeyCiphertext);
    } catch {
      apiKey = null;
    }
  }
  
  return {
    enabled: prefs.webSearchEnabled || false,
    provider: prefs.webSearchProvider || 'model',
    apiKey,
  };
}

async function performWebSearchIfNeeded(prisma, userId, content, novelTitle) {
  const searchConfig = await getUserSearchConfig(prisma, userId);
  if (!searchConfig.enabled) return null;
  
  if (searchConfig.provider === 'model') {
    return { useModelSearch: true };
  }
  
  if (!searchConfig.apiKey) return null;
  if (!shouldSearchForTopic(content)) return null;
  
  const queries = extractSearchQueries(content, novelTitle);
  if (queries.length === 0) return null;
  
  const allResults = [];
  for (const query of queries) {
    try {
      const response = await webSearch(searchConfig.provider, searchConfig.apiKey, query, 3);
      allResults.push(...response.results);
    } catch (err) {
      console.error(`Web search failed for query "${query}":`, err.message);
    }
  }
  
  if (allResults.length === 0) return null;
  return { context: formatSearchResultsForContext(allResults.slice(0, 5)) };
}

export async function handleChapterGenerate(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, outline, chapterCard, enableWebSearch } = input;
  
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');
  if (!['chapters', 'drafting'].includes(chapter.novel.generationStage || '')) {
    throw new Error('请先完成大纲生成');
  }
  if (chapter.order > 1) {
    const incompleteCount = await prisma.chapter.count({
      where: {
        novelId: chapter.novelId,
        order: { lt: chapter.order },
        generationStage: { not: 'completed' },
      },
    });
    if (incompleteCount > 0) {
      throw new Error('请先完成前序章节');
    }
  }

  const blockingCheck = await checkBlockingPendingEntities(chapter.novelId, chapter.order);
  if (blockingCheck.blocked) {
    const pendingNames = blockingCheck.pendingEntities.map(e => e.name).join(', ');
    throw new Error(`生成被阻塞：前序章节有${blockingCheck.pendingEntities.length}个待确认实体 (${pendingNames})。请先确认后继续。`);
  }

  const resolved = resolveOutlineAndChapterCard(chapter, outline, chapterCard);

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节写手',
    templateName: '章节写作',
  });
  if (!agent) throw new Error('Agent not found');

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  let enhancedContext = null;
  
  try {
    enhancedContext = await assembleContextAsString(chapter.novelId, chapter.order);
  } catch (err) {
    console.warn('Context assembly failed, using fallback:', err.message);
  }

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = enhancedContext?.context || previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');

  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding', 'plotPoint']);

  let hooksContext = '';
  try {
    hooksContext = await formatHooksForContext(chapter.novelId, chapter.order);
  } catch (err) {
    console.warn('Failed to get hooks context:', err.message);
  }

  let webSearchResult = null;
  let useModelSearch = false;
  if (enableWebSearch !== false) {
    const searchContent = resolved.outline || chapter.title || '';
    webSearchResult = await performWebSearchIfNeeded(prisma, userId, searchContent, chapter.novel.title);
    if (webSearchResult?.useModelSearch) {
      useModelSearch = true;
    }
  }

  const context = {
    chapter_number: chapter.order,
    novel_title: chapter.novel.title,
    previous_summary: previousSummary,
    characters: materials,
    outline: resolved.outline,
    chapter_card_json: resolved.chapterCard ? JSON.stringify(resolved.chapterCard, null, 2) : '',
    chapter_card_brief: resolved.chapterCardSection,
    word_count_target: 2000,
    web_search_results: webSearchResult?.context || '',
    unresolved_hooks: hooksContext,
  };

  let prompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHAPTER_GENERATE(chapter.order, chapter.novel.title);

  if (resolved.outline) {
    prompt += `\n\n## 本章大纲\n${resolved.outline}`;
  }

  if (resolved.chapterCardSection) {
    prompt += `\n\n${resolved.chapterCardSection}`;
  }

  if (hooksContext) {
    prompt = `${prompt}\n\n---\n\n${hooksContext}`;
  }

  if (webSearchResult?.context) {
    prompt = `${WEB_SEARCH_PREFIX}${webSearchResult.context}\n\n---\n\n${prompt}`;
  }

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    webSearch: useModelSearch,
    temperature: 0.8,
  });

  await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapterId },
      data: { content: response.content, generationStage: 'generated' },
    });

    await saveVersion(chapterId, response.content, tx);
  });
  const postProcessSummary = await enqueuePostGenerationJobs(userId, chapterId);
  const analysisQueueError = postProcessSummary.failed.length
    ? postProcessSummary.failed.map((item) => `${item.type}: ${item.error}`).join('; ')
    : null;
  if (analysisQueueError) {
    console.error('Failed to enqueue some post-generation jobs', analysisQueueError);
  }
 
  return { 
    content: response.content, 
    wordCount: response.content.split(/\s+/).length,
    webSearchUsed: useModelSearch || !!webSearchResult?.context,
    analysisQueued: postProcessSummary.allQueued,
    analysisQueueError,
    postProcess: postProcessSummary,
    pendingEntitiesBlocking: false,
  };
}

export async function handleChapterGenerateBranches(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, outline, chapterCard, branchCount = 3, selectedVersionId, selectedContent, feedback, iterationRound = 1, enableWebSearch } = input;
  
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');
  if (!['chapters', 'drafting'].includes(chapter.novel.generationStage || '')) {
    throw new Error('请先完成大纲生成');
  }
  if (chapter.order > 1) {
    const incompleteCount = await prisma.chapter.count({
      where: {
        novelId: chapter.novelId,
        order: { lt: chapter.order },
        generationStage: { not: 'completed' },
      },
    });
    if (incompleteCount > 0) {
      throw new Error('请先完成前序章节');
    }
  }

  const blockingCheck = await checkBlockingPendingEntities(chapter.novelId, chapter.order);
  if (blockingCheck.blocked) {
    const pendingNames = blockingCheck.pendingEntities.map(e => e.name).join(', ');
    throw new Error(`生成被阻塞：前序章节有${blockingCheck.pendingEntities.length}个待确认实体 (${pendingNames})。请先确认后继续。`);
  }

  const resolved = resolveOutlineAndChapterCard(chapter, outline, chapterCard);

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节写手',
    templateName: '章节写作',
  });
  if (!agent) throw new Error('Agent not found');

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  let enhancedContext;
  try {
    enhancedContext = await assembleContextAsString(chapter.novelId, chapter.order);
  } catch (err) {
    console.warn('Failed to assemble enhanced context for branches, falling back to basic:', err.message);
    enhancedContext = null;
  }

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = enhancedContext?.context || previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');
  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding', 'plotPoint']);

  let hooksContext = '';
  try {
    hooksContext = await formatHooksForContext(chapter.novelId, chapter.order);
  } catch (err) {
    console.warn('Failed to get hooks context for branches:', err.message);
  }

  let webSearchResult = null;
  let useModelSearch = false;
  if (enableWebSearch !== false) {
    const searchContent = resolved.outline || selectedContent || chapter.title || '';
    webSearchResult = await performWebSearchIfNeeded(prisma, userId, searchContent, chapter.novel.title);
    if (webSearchResult?.useModelSearch) {
      useModelSearch = true;
    }
  }

  const context = {
    chapter_number: chapter.order,
    novel_title: chapter.novel.title,
    previous_summary: previousSummary,
    characters: materials,
    outline: resolved.outline,
    chapter_card_json: resolved.chapterCard ? JSON.stringify(resolved.chapterCard, null, 2) : '',
    chapter_card_brief: resolved.chapterCardSection,
    word_count_target: 2000,
    iteration_round: iterationRound,
    has_feedback: !!feedback,
    feedback: feedback || '',
    selected_content: selectedContent || '',
    web_search_results: webSearchResult?.context || '',
    hooks_context: hooksContext || '',
  };

  let basePrompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHAPTER_GENERATE(chapter.order, chapter.novel.title);

  if (resolved.outline) {
    basePrompt += `\n\n## 本章大纲\n${resolved.outline}`;
  }

  if (resolved.chapterCardSection) {
    basePrompt += `\n\n${resolved.chapterCardSection}`;
  }

  if (hooksContext) {
    basePrompt += `\n\n## 未解决的叙事钩子（请适当引用或推进）\n${hooksContext}`;
  }

  if (webSearchResult?.context) {
    basePrompt = `${WEB_SEARCH_PREFIX}${webSearchResult.context}\n\n---\n\n${basePrompt}`;
  }

  if (feedback && selectedContent) {
    basePrompt = ITERATION_PROMPT_TEMPLATE(iterationRound, selectedContent, feedback, basePrompt);
  }

  const temperatures = [0.7, 0.8, 0.9];

  const branchPromises = Array.from({ length: branchCount }, (_, i) => 
    (async () => {
      const { response } = await generateWithAgentRuntime({
        prisma,
        userId,
        jobId,
        config,
        adapter,
        agent,
        defaultModel,
        messages: [{ role: 'user', content: basePrompt }],
        temperature: temperatures[i] || 0.8,
        webSearch: useModelSearch,
      });
      
      return {
        content: response.content,
        branchNumber: i + 1,
      };
    })()
  );

  const branches = await Promise.all(branchPromises);

  await deleteUnusedBranches(chapterId, chapter.currentVersionId);

  const parentVersion = selectedVersionId || chapter.currentVersionId || null;
  await saveBranchVersions(chapterId, branches, parentVersion);

  return {
    branches: branches.map(b => ({
      branchNumber: b.branchNumber,
      preview: b.content.slice(0, 500),
      wordCount: b.content.split(/\s+/).length,
    })),
  };
}
