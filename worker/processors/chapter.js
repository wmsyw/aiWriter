import { renderTemplateString } from '../../src/server/services/templates.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { createJob } from '../../src/server/services/jobs.js';
import { saveVersion, saveBranchVersions } from '../../src/server/services/versioning.js';
import { webSearch, formatSearchResultsForContext, shouldSearchForTopic, extractSearchQueries } from '../../src/server/services/web-search.js';
import { decryptApiKey } from '../../src/server/crypto.js';
import { FALLBACK_PROMPTS, WEB_SEARCH_PREFIX, ITERATION_PROMPT_TEMPLATE } from '../../src/constants/prompts.js';
import { getProviderAndAdapter, withConcurrencyLimit, trackUsage } from '../utils/helpers.js';
import { JobType } from '../types.js';
import { checkBlockingPendingEntities, formatPendingEntitiesForContext } from '../../src/server/services/pending-entities.js';
import { formatHooksForContext } from '../../src/server/services/hooks.js';
import { assembleContextAsString } from '../../src/server/services/context-assembly.js';

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
  const { chapterId, agentId, outline, enableWebSearch } = input;
  
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

  const agent = await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error('Agent not found');

  const template = agent.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent.providerConfigId);

  let enhancedContext = null;
  let contextAssemblyAttempts = 0;
  const maxContextRetries = 2;
  
  while (contextAssemblyAttempts < maxContextRetries && !enhancedContext) {
    try {
      enhancedContext = await assembleContextAsString(chapter.novelId, chapter.order);
    } catch (err) {
      contextAssemblyAttempts++;
      if (contextAssemblyAttempts < maxContextRetries) {
        console.warn(`Context assembly attempt ${contextAssemblyAttempts} failed, retrying:`, err.message);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn('Context assembly failed after retries, using fallback:', err.message);
      }
    }
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
    const searchContent = outline || chapter.title || '';
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
    outline: outline || '',
    word_count_target: 2000,
    web_search_results: webSearchResult?.context || '',
    unresolved_hooks: hooksContext,
  };

  let prompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHAPTER_GENERATE(chapter.order, chapter.novel.title);

  if (hooksContext) {
    prompt = `${prompt}\n\n---\n\n${hooksContext}`;
  }

  if (webSearchResult?.context) {
    prompt = `${WEB_SEARCH_PREFIX}${webSearchResult.context}\n\n---\n\n${prompt}`;
  }

  const params = agent.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.8,
    maxTokens: params.maxTokens || 4000,
    webSearch: useModelSearch,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapterId },
      data: { content: response.content, generationStage: 'generated' },
    });

    await saveVersion(chapterId, response.content, tx);
  });
  await trackUsage(prisma, userId, jobId, config.providerType, agent.model || config.defaultModel, response.usage);

  let analysisQueued = true;
  let analysisQueueError = null;
  try {
    await createJob(userId, JobType.MEMORY_EXTRACT, { chapterId });
  } catch (error) {
    analysisQueued = false;
    analysisQueueError = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to enqueue memory extract', analysisQueueError);
  }
 
  return { 
    content: response.content, 
    wordCount: response.content.split(/\s+/).length,
    webSearchUsed: useModelSearch || !!webSearchResult?.context,
    analysisQueued,
    analysisQueueError,
    pendingEntitiesBlocking: false,
  };
}

export async function handleChapterGenerateBranches(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, outline, branchCount = 3, selectedVersionId, selectedContent, feedback, iterationRound = 1, enableWebSearch } = input;
  
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

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '章节写手' }, orderBy: { createdAt: 'desc' } });
  if (!agent) throw new Error('Agent not found');

  const template = agent.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(prisma, userId, agent.providerConfigId);

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
    const searchContent = outline || selectedContent || chapter.title || '';
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
    outline: outline || '',
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

  if (hooksContext) {
    basePrompt += `\n\n## 未解决的叙事钩子（请适当引用或推进）\n${hooksContext}`;
  }

  if (webSearchResult?.context) {
    basePrompt = `${WEB_SEARCH_PREFIX}${webSearchResult.context}\n\n---\n\n${basePrompt}`;
  }

  if (feedback && selectedContent) {
    basePrompt = ITERATION_PROMPT_TEMPLATE(iterationRound, selectedContent, feedback, basePrompt);
  }

  const params = agent.params || {};
  const temperatures = [0.7, 0.8, 0.9];

  const branchPromises = Array.from({ length: branchCount }, (_, i) => 
    withConcurrencyLimit(async () => {
      const response = await adapter.generate(config, {
        messages: [{ role: 'user', content: basePrompt }],
        model: agent.model || config.defaultModel || 'gpt-4',
        temperature: temperatures[i] || 0.8,
        maxTokens: params.maxTokens || 4000,
        webSearch: useModelSearch,
      });
      
      await trackUsage(prisma, userId, jobId, config.providerType, agent.model || config.defaultModel, response.usage);
      
      return {
        content: response.content,
        branchNumber: i + 1,
      };
    })
  );

  const branches = await Promise.all(branchPromises);

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
