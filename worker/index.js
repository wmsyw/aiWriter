import 'dotenv/config';
import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { createAdapter, ProviderError } from '../src/server/adapters/providers.js';
import { decryptApiKey } from '../src/server/crypto.js';
import { renderTemplateString } from '../src/server/services/templates.js';
import { buildMaterialContext } from '../src/server/services/materials.js';
import { saveVersion, saveBranchVersions } from '../src/server/services/versioning.js';
import { commitChapter, ensureNovelRepo } from '../src/server/services/git-backup.js';
import { webSearch, formatSearchResultsForContext, shouldSearchForTopic, extractSearchQueries, WEB_SEARCH_TOOL } from '../src/server/services/web-search.js';

const prisma = new PrismaClient();

const MAX_CONCURRENT_AI_CALLS = 4;
let activeAICalls = 0;
const aiCallQueue = [];

async function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeAICalls++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeAICalls--;
        if (aiCallQueue.length > 0) {
          const next = aiCallQueue.shift();
          next();
        }
      }
    };

    if (activeAICalls < MAX_CONCURRENT_AI_CALLS) {
      execute();
    } else {
      aiCallQueue.push(execute);
    }
  });
}

const JobType = {
  OUTLINE_GENERATE: 'OUTLINE_GENERATE',
  CHAPTER_GENERATE: 'CHAPTER_GENERATE',
  CHAPTER_GENERATE_BRANCHES: 'CHAPTER_GENERATE_BRANCHES',
  REVIEW_SCORE: 'REVIEW_SCORE',
  DEAI_REWRITE: 'DEAI_REWRITE',
  MEMORY_EXTRACT: 'MEMORY_EXTRACT',
  CONSISTENCY_CHECK: 'CONSISTENCY_CHECK',
  EMBEDDINGS_BUILD: 'EMBEDDINGS_BUILD',
  IMAGE_GENERATE: 'IMAGE_GENERATE',
  GIT_BACKUP: 'GIT_BACKUP',
  CHARACTER_CHAT: 'CHARACTER_CHAT',
  ARTICLE_ANALYZE: 'ARTICLE_ANALYZE',
  BATCH_ARTICLE_ANALYZE: 'BATCH_ARTICLE_ANALYZE',
};

const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  RETRYING: 'retrying',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
};

async function getProviderAndAdapter(userId, providerConfigId) {
  const config = await prisma.providerConfig.findFirst({
    where: providerConfigId ? { id: providerConfigId, userId } : { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!config) throw new Error('No provider configured');
  const apiKey = decryptApiKey(config.apiKeyCiphertext);
  const adapter = await createAdapter(config.providerType, apiKey, config.baseURL || undefined);
  return { config, adapter };
}

async function trackUsage(userId, jobId, provider, model, usage) {
  if (!usage) return;
  const price = await prisma.modelPrice.findUnique({
    where: { provider_model: { provider, model } },
  });
  const estimatedCost = price
    ? (usage.promptTokens * price.promptTokenPrice + usage.completionTokens * price.completionTokenPrice) / 1000000
    : null;
  
  try {
    await prisma.usageRecord.create({
      data: { userId, jobId, provider, model, ...usage, estimatedCost },
    });
  } catch (err) {
    if (err.code === 'P2002') return;
    throw err;
  }
}

async function getUserSearchConfig(userId) {
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

async function performWebSearchIfNeeded(userId, content, novelTitle) {
  const searchConfig = await getUserSearchConfig(userId);
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

async function handleChapterGenerate(job, { jobId, userId, input }) {
  const { chapterId, agentId, outline, enableWebSearch } = input;
  
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error('Agent not found');

  const template = agent.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(userId, agent.providerConfigId);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');

  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding']);

  let webSearchResult = null;
  let useModelSearch = false;
  if (enableWebSearch !== false) {
    const searchContent = outline || chapter.title || '';
    webSearchResult = await performWebSearchIfNeeded(userId, searchContent, chapter.novel.title);
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
  };

  let prompt = template
    ? renderTemplateString(template.content, context)
    : `Write chapter ${chapter.order} of "${chapter.novel.title}".`;

  if (webSearchResult?.context) {
    prompt = `【参考资料（来自网络搜索）】\n${webSearchResult.context}\n\n---\n\n${prompt}`;
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
      data: { content: response.content },
    });
    await saveVersion(chapterId, response.content, tx);
  });
  await trackUsage(userId, jobId, config.providerType, agent.model || config.defaultModel, response.usage);

  return { 
    content: response.content, 
    wordCount: response.content.split(/\s+/).length,
    webSearchUsed: useModelSearch || !!webSearchResult?.context,
  };
}

async function handleChapterGenerateBranches(job, { jobId, userId, input }) {
  const { chapterId, agentId, outline, branchCount = 3, selectedVersionId, selectedContent, feedback, iterationRound = 1, enableWebSearch } = input;
  
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '章节写手' }, orderBy: { createdAt: 'desc' } });
  if (!agent) throw new Error('Agent not found');

  const template = agent.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(userId, agent.providerConfigId);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');
  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding']);

  let webSearchResult = null;
  let useModelSearch = false;
  if (enableWebSearch !== false) {
    const searchContent = outline || selectedContent || chapter.title || '';
    webSearchResult = await performWebSearchIfNeeded(userId, searchContent, chapter.novel.title);
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
  };

  let basePrompt = template
    ? renderTemplateString(template.content, context)
    : `Write chapter ${chapter.order} of "${chapter.novel.title}".`;

  if (webSearchResult?.context) {
    basePrompt = `【参考资料（来自网络搜索）】\n${webSearchResult.context}\n\n---\n\n${basePrompt}`;
  }

  // If this is an iteration with feedback, modify the prompt
  if (feedback && selectedContent) {
    basePrompt = `你正在进行第${iterationRound}轮迭代创作。

【上一轮选中的版本内容】
${selectedContent}

【用户反馈意见】
${feedback}

【任务要求】
请根据用户的反馈意见，在上一轮选中版本的基础上进行改进和优化。
保持原文的优点，同时针对反馈中提到的问题进行修改。
生成新的章节内容。

${basePrompt}`;
  }

  const params = agent.params || {};
  const temperatures = [0.7, 0.8, 0.9];
  const branches = [];

  for (let i = 0; i < branchCount; i++) {
    const response = await withConcurrencyLimit(() => adapter.generate(config, {
      messages: [{ role: 'user', content: basePrompt }],
      model: agent.model || config.defaultModel || 'gpt-4',
      temperature: temperatures[i] || 0.8,
      maxTokens: params.maxTokens || 4000,
      webSearch: useModelSearch,
    }));
    
    branches.push({
      content: response.content,
      branchNumber: i + 1,
    });
    
    await trackUsage(userId, jobId, config.providerType, agent.model || config.defaultModel, response.usage);
  }

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

async function handleReviewScore(job, { jobId, userId, input }) {
  const { chapterId, agentId, reviewerModels } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '章节评审' }, orderBy: { createdAt: 'desc' } });

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const context = { chapter_content: chapter.content };
  const basePrompt = template
    ? renderTemplateString(template.content, context)
    : `Review this chapter and provide a score from 1-10:\n\n${chapter.content}`;

  // Multi-model review support
  if (reviewerModels && reviewerModels.length > 1) {
    const reviews = await Promise.all(
      reviewerModels.map(async (reviewer, index) => {
        const { config, adapter } = await getProviderAndAdapter(userId, reviewer.providerConfigId);
        
        // Add persona to prompt if specified
        let prompt = basePrompt;
        if (reviewer.persona) {
          prompt = `你现在扮演的是：${reviewer.persona}\n\n请从你的视角对以下章节进行评审，给出你独特的见解和评分。\n\n${basePrompt}`;
        }
        
        const params = agent?.params || {};
        const response = await withConcurrencyLimit(() => adapter.generate(config, {
          messages: [{ role: 'user', content: prompt }],
          model: reviewer.model || config.defaultModel || 'gpt-4',
          temperature: params.temperature || 0.3,
          maxTokens: params.maxTokens || 4000,
        }));
        
        await trackUsage(userId, jobId, config.providerType, reviewer.model || config.defaultModel, response.usage);
        
        let parsedReview;
        try {
          parsedReview = JSON.parse(response.content);
        } catch {
          parsedReview = { raw: response.content, overall_score: null };
        }
        
        return {
          reviewerIndex: index + 1,
          persona: reviewer.persona || `读者${index + 1}`,
          model: reviewer.model,
          review: parsedReview,
        };
      })
    );
    
    // Aggregate scores from all reviewers
    const validScores = reviews
      .map(r => r.review?.overall_score)
      .filter(s => typeof s === 'number');
    
    const aggregated = {
      averageScore: validScores.length > 0 
        ? Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2))
        : null,
      reviewCount: reviews.length,
      scoreRange: validScores.length > 0 
        ? { min: Math.min(...validScores), max: Math.max(...validScores) }
        : null,
    };
    
    return { reviews, aggregated, isMultiReview: true };
  }

  // Single model review (existing logic)
  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: basePrompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.3,
    maxTokens: params.maxTokens || 2000,
  }));

  let result;
  try {
    result = JSON.parse(response.content);
  } catch {
    result = { raw: response.content, overall_score: null };
  }

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}

async function handleDeaiRewrite(job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: 'De-AI Humanizer' }, orderBy: { createdAt: 'desc' } });

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const context = { original_content: chapter.content };
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `Rewrite this text to feel more natural and human:\n\n${chapter.content}`;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.9,
    maxTokens: params.maxTokens || 4000,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapterId },
      data: { content: response.content },
    });
    await saveVersion(chapterId, response.content, tx);
  });
  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return { content: response.content };
}

async function handleMemoryExtract(job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: 'Memory Extractor' }, orderBy: { createdAt: 'desc' } });

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const context = { chapter_content: chapter.content };
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `Extract structured information from this chapter as JSON:\n\n${chapter.content}`;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 2000,
  }));

  let data;
  try {
    data = JSON.parse(response.content);
  } catch {
    data = { raw: response.content };
  }

  await prisma.memorySnapshot.create({
    data: { chapterId, novelId: chapter.novelId, data },
  });

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return data;
}

async function handleConsistencyCheck(job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: 'Consistency Checker' }, orderBy: { createdAt: 'desc' } });

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId);
  const memories = await prisma.memorySnapshot.findMany({
    where: { novelId: chapter.novelId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const previousMemories = memories.map(m => JSON.stringify(m.data)).join('\n---\n');

  const context = { chapter_content: chapter.content, materials, previous_memories: previousMemories };
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `Check this chapter for consistency issues:\n\n${chapter.content}`;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 2000,
  }));

  let result;
  try {
    result = JSON.parse(response.content);
  } catch {
    result = { raw: response.content };
  }

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}

async function handleGitBackup(job, { jobId, userId, input }) {
  const { novelId, novelTitle, chapterNumber, chapterTitle, content } = input;
  
  if (process.env.GIT_BACKUP_ENABLED !== 'true') {
    return { skipped: true, reason: 'Git backup disabled' };
  }
  
  const result = await commitChapter(novelId, novelTitle, chapterNumber, chapterTitle, content);
  return result;
}

async function handleCharacterChat(job, { jobId, userId, input }) {
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
  
  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);
  
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
    : `You are ${character.name}. Respond to: ${userMessage}`;
  
  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.8,
    maxTokens: params.maxTokens || 2000,
  }));
  
  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  
  return {
    characterName: character.name,
    response: response.content,
  };
}

async function handleOutlineGenerate(job, { jobId, userId, input }) {
  const { keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;
  
  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '大纲生成器' }, orderBy: { createdAt: 'desc' } });
  
  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;
  
  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);
  
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
  
  let outline;
  try {
    const parsed = JSON.parse(response.content);
    outline = typeof parsed === 'object' && parsed !== null ? parsed : { raw: response.content, parseError: 'Not an object' };
  } catch (e) {
    outline = { raw: response.content, parseError: e.message };
  }
  
  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  
  return outline;
}

async function handleArticleAnalyze(job, { jobId, userId, input }) {
  const { title, content, genre, analysisFocus, agentId, saveToMaterials, novelId, templateId } = input;
  
  const agent = agentId
    ? await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } })
    : await prisma.agentDefinition.findFirst({ where: { userId, name: '文章分析器' }, orderBy: { createdAt: 'desc' } });
  
  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : null;
  
  let analysisTemplate = null;
  if (templateId) {
    analysisTemplate = await prisma.$queryRaw`SELECT * FROM "AnalysisTemplate" WHERE id = ${templateId} AND "userId" = ${userId} LIMIT 1`;
    analysisTemplate = analysisTemplate?.[0] || null;
  }
  
  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);
  
  let aspectsPrompt = '';
  if (analysisTemplate?.aspects) {
    const enabledAspects = analysisTemplate.aspects.filter(a => a.enabled);
    aspectsPrompt = `\n\n请重点分析以下维度：\n${enabledAspects.map(a => `- ${a.label}${a.description ? `: ${a.description}` : ''}`).join('\n')}`;
  }
  
  const context = {
    article_title: title,
    article_content: content,
    genre: genre || '',
    analysis_focus: analysisFocus || '',
    custom_aspects: aspectsPrompt,
  };
  
  const prompt = template
    ? renderTemplateString(template.content, context)
    : `请分析以下文章，提取要素、写作技巧和总结：\n\n标题：${title}\n\n${content}${aspectsPrompt}`;
  
  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.3,
    maxTokens: params.maxTokens || 6000,
  }));
  
  let analysis;
  try {
    analysis = JSON.parse(response.content);
  } catch (e) {
    analysis = { raw: response.content, parseError: e.message };
  }
  
  const articleAnalysis = await prisma.articleAnalysis.create({
    data: {
      userId,
      title,
      content,
      genre: genre || null,
      analysis,
    },
  });
  
  if (saveToMaterials && novelId && analysis.material_suggestions) {
    const materialPromises = [];
    
    if (analysis.material_suggestions.character_materials) {
      for (const char of analysis.material_suggestions.character_materials) {
        materialPromises.push(
          prisma.material.create({
            data: {
              novelId,
              userId,
              type: 'character',
              name: char.name,
              genre: '通用',
              data: char.data || {},
            },
          })
        );
      }
    }
    
    if (analysis.material_suggestions.technique_materials) {
      for (const tech of analysis.material_suggestions.technique_materials) {
        materialPromises.push(
          prisma.material.create({
            data: {
              novelId,
              userId,
              type: 'custom',
              name: tech.name,
              genre: '通用',
              data: { category: tech.category, content: tech.content },
            },
          })
        );
      }
    }
    
    if (analysis.material_suggestions.worldbuilding_materials) {
      for (const wb of analysis.material_suggestions.worldbuilding_materials) {
        materialPromises.push(
          prisma.material.create({
            data: {
              novelId,
              userId,
              type: 'worldbuilding',
              name: wb.name,
              genre: '通用',
              data: { category: wb.category, content: wb.content },
            },
          })
        );
      }
    }
    
    await Promise.all(materialPromises);
  }
  
  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  
  return {
    analysisId: articleAnalysis.id,
    analysis,
    materialsSaved: saveToMaterials && novelId ? true : false,
  };
}

async function handleBatchArticleAnalyze(job, { jobId, userId, input }) {
  const { articles, analysisFocus, agentId, saveToMaterials, novelId, templateId } = input;
  
  const results = [];
  
  for (const article of articles) {
    const singleResult = await handleArticleAnalyze(job, {
      jobId,
      userId,
      input: {
        title: article.title,
        content: article.content,
        genre: article.genre,
        analysisFocus,
        agentId,
        saveToMaterials,
        novelId,
        templateId,
      },
    });
    results.push({ title: article.title, ...singleResult });
  }
  
  return {
    totalAnalyzed: results.length,
    results,
  };
}

const handlers = {
  [JobType.OUTLINE_GENERATE]: handleOutlineGenerate,
  [JobType.CHAPTER_GENERATE]: handleChapterGenerate,
  [JobType.CHAPTER_GENERATE_BRANCHES]: handleChapterGenerateBranches,
  [JobType.REVIEW_SCORE]: handleReviewScore,
  [JobType.DEAI_REWRITE]: handleDeaiRewrite,
  [JobType.MEMORY_EXTRACT]: handleMemoryExtract,
  [JobType.CONSISTENCY_CHECK]: handleConsistencyCheck,
  [JobType.GIT_BACKUP]: handleGitBackup,
  [JobType.CHARACTER_CHAT]: handleCharacterChat,
  [JobType.ARTICLE_ANALYZE]: handleArticleAnalyze,
  [JobType.BATCH_ARTICLE_ANALYZE]: handleBatchArticleAnalyze,
};

const RETRY_LIMIT = 3;

async function processJob(job) {
  const { jobId, userId, input } = job.data;

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob || dbJob.status === JobStatus.CANCELED) {
    console.log(`Job ${jobId} was canceled, skipping`);
    return;
  }

  const attemptCount = (dbJob.attemptCount || 0) + 1;
  
  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.RUNNING, attemptCount },
  });

  try {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`Unknown job type: ${job.name}`);

    const output = await handler(job, { jobId, userId, input });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.SUCCEEDED, output },
    });
  } catch (error) {
    console.error(`Job ${jobId} failed (attempt ${attemptCount}):`, error.message);
    
    const isRetryable = !(error instanceof ProviderError) || error.retryable;
    const hasRetriesLeft = attemptCount < RETRY_LIMIT;
    
    if (isRetryable && hasRetriesLeft) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.RETRYING, error: error.message },
      });
    } else {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, error: error.message },
      });
    }
    
    if (isRetryable && hasRetriesLeft) {
      throw error;
    }
  }
}

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL);
  await boss.start();
  console.log('Worker started');

  for (const jobType of Object.values(JobType)) {
    if (handlers[jobType]) {
      boss.work(jobType, { teamSize: 1, teamConcurrency: 1 }, processJob);
      console.log(`Registered handler for ${jobType}`);
    }
  }

  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await boss.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
