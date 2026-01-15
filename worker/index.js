import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createAdapter, ProviderError } from '../src/server/adapters/providers.js';
import { decryptApiKey } from '../src/server/crypto.js';
import { renderTemplateString } from '../src/server/services/templates.js';
import { buildMaterialContext } from '../src/server/services/materials.js';
import { createJob } from '../src/server/services/jobs.js';
import { saveVersion, saveBranchVersions } from '../src/server/services/versioning.js';
import { commitChapter } from '../src/server/services/git-backup.js';
import { webSearch, formatSearchResultsForContext, shouldSearchForTopic, extractSearchQueries } from '../src/server/services/web-search.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
  NOVEL_SEED: 'NOVEL_SEED',
  OUTLINE_GENERATE: 'OUTLINE_GENERATE',
  OUTLINE_ROUGH: 'OUTLINE_ROUGH',
  OUTLINE_DETAILED: 'OUTLINE_DETAILED',
  OUTLINE_CHAPTERS: 'OUTLINE_CHAPTERS',
  CHARACTER_BIOS: 'CHARACTER_BIOS',
  CHAPTER_GENERATE: 'CHAPTER_GENERATE',
  CHAPTER_GENERATE_BRANCHES: 'CHAPTER_GENERATE_BRANCHES',
  REVIEW_SCORE: 'REVIEW_SCORE',
  DEAI_REWRITE: 'DEAI_REWRITE',
  MEMORY_EXTRACT: 'MEMORY_EXTRACT',
  CONSISTENCY_CHECK: 'CONSISTENCY_CHECK',
  CANON_CHECK: 'CANON_CHECK',
  EMBEDDINGS_BUILD: 'EMBEDDINGS_BUILD',
  IMAGE_GENERATE: 'IMAGE_GENERATE',
  GIT_BACKUP: 'GIT_BACKUP',
  CHARACTER_CHAT: 'CHARACTER_CHAT',
  ARTICLE_ANALYZE: 'ARTICLE_ANALYZE',
  BATCH_ARTICLE_ANALYZE: 'BATCH_ARTICLE_ANALYZE',
  MATERIAL_SEARCH: 'MATERIAL_SEARCH',
  WIZARD_WORLD_BUILDING: 'WIZARD_WORLD_BUILDING',
  WIZARD_CHARACTERS: 'WIZARD_CHARACTERS',
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

  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding', 'plotPoint']);

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
      data: { content: response.content, generationStage: 'generated' },
    });

    await saveVersion(chapterId, response.content, tx);
  });
  await trackUsage(userId, jobId, config.providerType, agent.model || config.defaultModel, response.usage);

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
  };
}

async function handleChapterGenerateBranches(job, { jobId, userId, input }) {
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

  const { config, adapter } = await getProviderAndAdapter(userId, agent.providerConfigId);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');
  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding', 'plotPoint']);

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

    await prisma.chapter.update({
      where: { id: chapterId },
      data: { generationStage: 'reviewed' },
    });
    
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

  await prisma.chapter.update({
    where: { id: chapterId },
    data: { generationStage: 'reviewed' },
  });

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
 
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function mergeRelationshipEntries(existing = [], incoming = []) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  if (!Array.isArray(incoming)) return merged;

  for (const rel of incoming) {
    if (!rel || !rel.targetId) continue;
    const matchIndex = merged.findIndex(item => item.targetId === rel.targetId);
    if (matchIndex >= 0) {
      const existing = merged[matchIndex];
      merged[matchIndex] = {
        ...existing,
        type: rel.type || existing.type,
        description: rel.description || existing.description,
      };
      continue;
    }
    merged.push(rel);
  }
  return merged;
}

function mergeMaterialData(existingData = {}, nextData = {}) {
  const merged = { ...existingData, ...nextData };
  if (existingData.attributes || nextData.attributes) {
    merged.attributes = { ...(existingData.attributes || {}), ...(nextData.attributes || {}) };
  }
  if (existingData.relationships || nextData.relationships) {
    merged.relationships = mergeRelationshipEntries(existingData.relationships || [], nextData.relationships || []);
  }
  return merged;
}

async function upsertMaterialByName({ novelId, userId, type, name, data, genre, tx }) {
  if (!name) return { record: null, created: false };
  const client = tx || prisma;
  const existing = await client.material.findFirst({ where: { novelId, userId, type, name } });
  if (existing) {
    const merged = mergeMaterialData(existing.data || {}, data || {});
    const record = await client.material.update({
      where: { id: existing.id },
      data: {
        genre: genre || existing.genre || '通用',
        data: merged,
      },
    });
    return { record, created: false };
  }

  const record = await client.material.create({
    data: {
      novelId,
      userId,
      type,
      name,
      genre: genre || '通用',
      data: data || {},
    },
  });
  return { record, created: true };
}

function mapImportanceLevel(level) {
  if (typeof level !== 'string') return undefined;
  if (level.includes('伏笔')) return 'foreshadowing';
  if (level.includes('核心') || level.includes('重要')) return 'major';
  if (level.includes('日常')) return 'minor';
  return undefined;
}

async function syncMaterialsFromAnalysis({ analysis, novelId, userId, chapterNumber, genre, tx }) {
  if (!analysis || analysis.raw || analysis.parseError) {
    return { created: 0, updated: 0, skipped: true };
  }

  const client = tx || prisma;
  let created = 0;
  let updated = 0;

  const characterDrafts = new Map();
  const addCharacterDraft = (name, payload) => {
    const trimmed = normalizeString(name);
    if (!trimmed) return;
    const current = characterDrafts.get(trimmed) || { name: trimmed, data: { attributes: {} } };
    const merged = mergeMaterialData(current.data || {}, payload || {});
    characterDrafts.set(trimmed, { name: trimmed, data: merged });
  };

  const characters = analysis.characters || {};
  const newly = Array.isArray(characters.newly_introduced) ? characters.newly_introduced : [];
  const appearing = Array.isArray(characters.appearing) ? characters.appearing : [];
  const mentioned = Array.isArray(characters.mentioned_only) ? characters.mentioned_only : [];

  for (const char of newly) {
    const descriptionParts = [char.description, char.personality].filter(Boolean);
    addCharacterDraft(char.name, {
      description: descriptionParts.join('；') || undefined,
      attributes: {
        identity: char.identity || '',
        occupation: char.identity || '',
        role_type: char.role_type || '',
        first_impression: char.first_impression || '',
        personality: char.personality || '',
      },
    });
  }

  for (const char of appearing) {
    addCharacterDraft(char.name, {
      attributes: {
        actions: char.actions || '',
        development: char.development || '',
        new_info: char.new_info || '',
      },
    });
  }

  for (const name of mentioned) {
    addCharacterDraft(name, { attributes: { note: '仅提及' } });
  }

  const relationships = Array.isArray(analysis.relationships) ? analysis.relationships : [];
  for (const relation of relationships) {
    addCharacterDraft(relation.character1, {});
    addCharacterDraft(relation.character2, {});
  }

  const characterMap = new Map();
  for (const draft of characterDrafts.values()) {
    const { record, created: wasCreated } = await upsertMaterialByName({
      novelId,
      userId,
      type: 'character',
      name: draft.name,
      data: draft.data,
      genre,
      tx,
    });
    if (!record) continue;
    characterMap.set(draft.name, record);
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  if (relationships.length > 0 && characterMap.size > 0) {
    const relationshipMap = new Map();
    const relationshipNotes = new Map();
    for (const relation of relationships) {
      const name1 = normalizeString(relation.character1);
      const name2 = normalizeString(relation.character2);
      if (!name1 || !name2 || !characterMap.has(name1) || !characterMap.has(name2)) continue;
      const relType = relation.relationship || '关系';
      const description = relation.change || '';
      const id1 = characterMap.get(name1).id;
      const id2 = characterMap.get(name2).id;

      const relEntry1 = { targetId: id2, type: relType, description };
      const relEntry2 = { targetId: id1, type: relType, description };
      const note1 = description ? `${name2}:${relType}(${description})` : `${name2}:${relType}`;
      const note2 = description ? `${name1}:${relType}(${description})` : `${name1}:${relType}`;

      relationshipMap.set(id1, [...(relationshipMap.get(id1) || []), relEntry1]);
      relationshipMap.set(id2, [...(relationshipMap.get(id2) || []), relEntry2]);
      relationshipNotes.set(id1, [...(relationshipNotes.get(id1) || []), note1]);
      relationshipNotes.set(id2, [...(relationshipNotes.get(id2) || []), note2]);
    }

    for (const [materialId, rels] of relationshipMap.entries()) {
      const record = Array.from(characterMap.values()).find(item => item.id === materialId);
      if (!record) continue;
      const notes = relationshipNotes.get(materialId) || [];
      const merged = mergeMaterialData(record.data || {}, {
        relationships: rels,
        ...(notes.length > 0 ? { attributes: { relationships: notes.join('；') } } : {}),
      });
      await client.material.update({ where: { id: materialId }, data: { data: merged } });
      updated += 1;
    }
  }

  const organizations = Array.isArray(analysis.organizations) ? analysis.organizations : [];
  for (const org of organizations) {
    const { record, created: wasCreated } = await upsertMaterialByName({
      novelId,
      userId,
      type: 'worldbuilding',
      name: normalizeString(org.name),
      genre,
      data: {
        description: org.description || '',
        attributes: {
          category: '组织',
          type: org.type || '',
          members: Array.isArray(org.members) ? org.members.join('、') : '',
          influence: org.influence || '',
          chapter: chapterNumber || null,
        },
      },
      tx,
    });
    if (!record) continue;
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const plotEvents = Array.isArray(analysis.plot_events) ? analysis.plot_events : [];
  for (const event of plotEvents) {
    const eventName = normalizeString(event.event);
    if (!eventName) continue;
    const importance = mapImportanceLevel(event.importance);
    const { record, created: wasCreated } = await upsertMaterialByName({
      novelId,
      userId,
      type: 'plotPoint',
      name: eventName,
      genre,
      data: {
        description: event.event || '',
        importance,
        chapter: chapterNumber || null,
        attributes: {
          importance: event.importance || '',
          characters: Array.isArray(event.characters_involved) ? event.characters_involved.join('、') : '',
          consequences: event.consequences || '',
        },
      },
      tx,
    });
    if (!record) continue;
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return { created, updated };
}

async function handleMemoryExtract(job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '记忆提取器',
    templateName: '记忆提取',
  });

  if (agentId && !agent) {
    throw new Error('Agent not found');
  }

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);
  const context = {
    chapter_content: chapter.content || '',
    chapter_number: chapter.order,
    genre: chapter.novel.genre || '',
  };

  const fallbackPrompt = `请根据以下章节提取钩子、伏笔、情节、人物关系、职业等信息，并输出JSON结构：\n\n${chapter.content || ''}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 4000,
  }));

  const analysis = await parseJsonOutput(response.content);
  const invalidAnalysis = !analysis || typeof analysis !== 'object' || Array.isArray(analysis) || analysis?.raw || analysis?.parseError;
  if (invalidAnalysis) {
    const message = analysis?.parseError
      ? `Invalid memory extract response: ${analysis.parseError}`
      : 'Invalid memory extract response';
    throw new Error(message);
  }

  const materialStats = await prisma.$transaction(async (tx) => {
    await tx.memorySnapshot.deleteMany({ where: { chapterId } });
    await tx.memorySnapshot.create({
      data: {
        chapterId,
        novelId: chapter.novelId,
        data: analysis,
      },
    });

    return await syncMaterialsFromAnalysis({
      analysis,
      novelId: chapter.novelId,
      userId,
      chapterNumber: chapter.order,
      genre: chapter.novel.genre || '通用',
      tx,
    });
  });

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return { analysis, materials: materialStats };
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

async function handleWizardWorldBuilding(job, { jobId, userId, input }) {
  const { novelId, theme, genre, keywords, protagonist, worldSetting, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '世界观生成器',
    templateName: '世界观生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

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

  let parsed = null;
  try {
    parsed = JSON.parse(response.content);
  } catch (e) {
    parsed = { raw: response.content, parseError: e.message };
  }

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


  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return worldData;
}

async function handleWizardCharacters(job, { jobId, userId, input }) {
  const { novelId, theme, genre, keywords, protagonist, worldSetting, characterCount = 5, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '角色生成器',
    templateName: '角色生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

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
  try {
    const parsed = JSON.parse(response.content);
    parsedCharacters = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    parsedCharacters = [];
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return {
    characters: parsedCharacters,
    materialIds: characterMaterials,
    raw: parsedCharacters.length === 0 ? response.content : null,
    errors: characterErrors.length > 0 ? characterErrors : null,
  };
}

async function resolveAgentAndTemplate({ userId, agentId, agentName, fallbackAgentName, templateName }) {
  let agent = null;
  if (agentId) {
    agent = await prisma.agentDefinition.findFirst({ where: { id: agentId, userId } });
  }
  if (!agent && agentName) {
    agent = await prisma.agentDefinition.findFirst({ where: { userId, name: agentName }, orderBy: { createdAt: 'desc' } });
  }
  if (!agent && fallbackAgentName) {
    agent = await prisma.agentDefinition.findFirst({ where: { userId, name: fallbackAgentName }, orderBy: { createdAt: 'desc' } });
  }

  const template = agent?.templateId
    ? await prisma.promptTemplate.findFirst({ where: { id: agent.templateId, userId } })
    : templateName
      ? await prisma.promptTemplate.findFirst({ where: { userId, name: templateName } })
      : null;

  return { agent, template };
}

async function parseJsonOutput(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    return { raw: content, parseError: error.message };
  }
}

function extractJsonCandidate(content) {
  if (typeof content !== 'string') return '';
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fenceMatch ? fenceMatch[1] : content).trim();
  const braceIndex = cleaned.indexOf('{');
  const bracketIndex = cleaned.indexOf('[');
  const startCandidates = [braceIndex, bracketIndex].filter(index => index >= 0);
  if (startCandidates.length === 0) return cleaned;
  const start = Math.min(...startCandidates);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endCandidates = [lastBrace, lastBracket].filter(index => index >= 0);
  const end = endCandidates.length > 0 ? Math.max(...endCandidates) : cleaned.length - 1;
  return cleaned.slice(start, end + 1).trim();
}

function parseModelJson(content) {
  const candidate = extractJsonCandidate(content);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return { raw: content, parseError: error.message };
  }
}

function truncateText(content, maxChars) {
  if (typeof content !== 'string') return '';
  if (!maxChars || maxChars <= 0) return content;
  return content.length > maxChars ? content.slice(0, maxChars) : content;
}

async function handleNovelSeed(job, { jobId, userId, input }) {
  const { novelId, title, theme, genre, keywords, protagonist, specialRequirements, agentId } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '小说引导生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '小说引导生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

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

  const seedResult = await parseJsonOutput(response.content);
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return seedResult;
}

async function handleOutlineRough(job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '粗纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '粗略大纲生成',
  });

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

  const fallbackPrompt = `请生成粗略大纲，分段描述故事主线（JSON 输出）：\n关键词：${keywords || '无'}\n主题：${theme || '无'}\n类型：${genre || '无'}\n目标字数：${targetWords || '未知'}万字`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.7,
    maxTokens: params.maxTokens || 4000,
  }));

  let roughOutline = await parseJsonOutput(response.content);
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return roughOutline;
}

async function generateCharacterBios({ userId, novelId, characters, outlineContext, agentId, jobId }) {
  if (!characters || characters.length === 0) return { characters: [], materialIds: [] };

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '角色传记生成器',
    fallbackAgentName: '角色生成器',
    templateName: '角色传记生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);
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

  const parsed = await parseJsonOutput(response.content);
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return { characters: bioCharacters, materialIds, raw: parsed.raw || null };
}

function extractCharactersFromMarkdown(content) {
  const characters = [];
  // Pattern: - **Name**: Role, Description
  // Matches: - **李逍遥**: 主角，性格机智...
  // Matches: - **赵灵儿** (女主角): 温柔善良...
  const regex = /-\s*\*\*([^*]+)\*\*[:：]?\s*(?:[\(（]([^)）]+)[\)）])?[:：]?\s*([^\n]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    if (name.length > 20) continue; // Safety check
    
    characters.push({
      name: name,
      role: match[2] ? match[2].trim() : '配角',
      brief: match[3] ? match[3].trim() : '',
    });
  }
  return characters;
}

async function handleOutlineDetailed(job, { jobId, userId, input }) {
  const { novelId, roughOutline, targetWords, chapterCount, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '细纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '细纲生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

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

  let detailedOutline = await parseJsonOutput(response.content);
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
    characterBiosResult = await generateCharacterBios({
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  if (typeof detailedOutline === 'string') {
    return detailedOutline;
  }

  return {
    ...detailedOutline,
    characterBios: characterBiosResult.characters,
    characterMaterialIds: characterBiosResult.materialIds,
  };
}

async function handleOutlineChapters(job, { jobId, userId, input }) {
  const { novelId, detailedOutline, agentId } = input;

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '章节大纲生成器',
    fallbackAgentName: '大纲生成器',
    templateName: '章节大纲生成',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

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

  let chapterOutlines = await parseJsonOutput(response.content);
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

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);

  return chapterOutlines;
}

async function handleCharacterBios(job, { jobId, userId, input }) {
  const { novelId, characters, outlineContext, agentId } = input;
  const result = await generateCharacterBios({ userId, novelId, characters, outlineContext, agentId, jobId });
  return result;
}

async function handleOutlineGenerate(job, { jobId, userId, input }) {
  const { novelId, keywords, theme, genre, targetWords, chapterCount, protagonist, worldSetting, specialRequirements, agentId } = input;
  
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
  
  const output = await parseJsonOutput(response.content);
  // Support raw output
  const result = output.raw ? response.content : output;
  
  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}

async function handleBatchArticleAnalyze(job, { jobId, userId, input }) {
  // Implementation of batch analysis not shown in provided code snippet, placeholder
  return { status: 'not_implemented' };
}

async function handleArticleAnalyze(job, { jobId, userId, input }) {
  // Implementation of single analysis not shown in provided code snippet, placeholder
  return { status: 'not_implemented' };
}

async function handleMaterialSearch(job, { jobId, userId, input }) {
  // Implementation not shown in provided code snippet, placeholder
  return { status: 'not_implemented' };
}

async function handleConsistencyCheck(job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '一致性检查',
    templateName: '一致性检查',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding', 'plotPoint']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const context = {
    chapter_content: chapterContent,
    chapter_number: chapter.order,
    materials: materials,
    outline: chapter.novel.outline || '',
  };

  const fallbackPrompt = `请检查以下章节与设定的一致性，输出JSON格式结果：\n\n${chapterContent}`;
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 4000,
  }));

  const result = parseModelJson(response.content);

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}

async function handleCanonCheck(job, { jobId, userId, input }) {
  const { chapterId, agentId, originalWork, canonSettings, characterProfiles, worldRules } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate({
    userId,
    agentId,
    agentName: '原作符合度检查',
    templateName: '原作符合度检查',
  });

  const { config, adapter } = await getProviderAndAdapter(userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, ['character', 'worldbuilding']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const previousChapters = await prisma.chapter.findMany({
    where: { novelId: chapter.novelId, order: { lt: chapter.order } },
    orderBy: { order: 'desc' },
    take: 3,
  });
  const previousSummary = previousChapters.map(c => `Chapter ${c.order}: ${c.title}`).join('\n');

  const context = {
    chapter_content: chapterContent,
    chapter_number: chapter.order,
    original_work: originalWork || chapter.novel.originalWork || '',
    canon_settings: canonSettings || chapter.novel.canonSettings || materials || '',
    character_profiles: characterProfiles || '',
    world_rules: worldRules || chapter.novel.worldRules || '',
    previous_chapters: previousSummary,
  };

  const fallbackPrompt = `你是一位资深的同人文编辑，请对以下章节进行原作符合度检查，输出JSON格式结果：

## 待检查章节
${chapterContent}

## 原作信息
${context.original_work || '未指定'}

请从角色人设、世界观、剧情逻辑、风格氛围等维度检查是否符合原作设定。`;

  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const params = agent?.params || {};
  const response = await withConcurrencyLimit(() => adapter.generate(config, {
    messages: [{ role: 'user', content: prompt }],
    model: agent?.model || config.defaultModel || 'gpt-4',
    temperature: params.temperature || 0.2,
    maxTokens: params.maxTokens || 6000,
  }));

  const result = parseModelJson(response.content);

  await trackUsage(userId, jobId, config.providerType, agent?.model || config.defaultModel, response.usage);
  return result;
}

async function handleEmbeddingsBuild(job, { jobId, userId, input }) {
  // Implementation not shown in provided code snippet, placeholder
  return { status: 'not_implemented' };
}

async function handleImageGenerate(job, { jobId, userId, input }) {
  // Implementation not shown in provided code snippet, placeholder
  return { status: 'not_implemented' };
}

async function handleJob(job) {
  const { id: jobId, name: jobType, data: input } = job;
  const { userId } = input;

  try {
    if (jobType === JobType.CHAPTER_GENERATE) return await handleChapterGenerate(job, { jobId, userId, input });
    if (jobType === JobType.CHAPTER_GENERATE_BRANCHES) return await handleChapterGenerateBranches(job, { jobId, userId, input });
    if (jobType === JobType.REVIEW_SCORE) return await handleReviewScore(job, { jobId, userId, input });
    if (jobType === JobType.NOVEL_SEED) return await handleNovelSeed(job, { jobId, userId, input });
    if (jobType === JobType.OUTLINE_ROUGH) return await handleOutlineRough(job, { jobId, userId, input });
    if (jobType === JobType.OUTLINE_DETAILED) return await handleOutlineDetailed(job, { jobId, userId, input });
    if (jobType === JobType.OUTLINE_CHAPTERS) return await handleOutlineChapters(job, { jobId, userId, input });
    if (jobType === JobType.CHARACTER_BIOS) return await handleCharacterBios(job, { jobId, userId, input });
    if (jobType === JobType.OUTLINE_GENERATE) return await handleOutlineGenerate(job, { jobId, userId, input });
    if (jobType === JobType.GIT_BACKUP) return await handleGitBackup(job, { jobId, userId, input });
    if (jobType === JobType.CHARACTER_CHAT) return await handleCharacterChat(job, { jobId, userId, input });
    if (jobType === JobType.WIZARD_WORLD_BUILDING) return await handleWizardWorldBuilding(job, { jobId, userId, input });
    if (jobType === JobType.WIZARD_CHARACTERS) return await handleWizardCharacters(job, { jobId, userId, input });
    if (jobType === JobType.CONSISTENCY_CHECK) return await handleConsistencyCheck(job, { jobId, userId, input });
    if (jobType === JobType.CANON_CHECK) return await handleCanonCheck(job, { jobId, userId, input });
    
    // Fallbacks for other types
    if (jobType === JobType.ARTICLE_ANALYZE) return await handleArticleAnalyze(job, { jobId, userId, input });
    if (jobType === JobType.BATCH_ARTICLE_ANALYZE) return await handleBatchArticleAnalyze(job, { jobId, userId, input });
    if (jobType === JobType.MATERIAL_SEARCH) return await handleMaterialSearch(job, { jobId, userId, input });
    if (jobType === JobType.EMBEDDINGS_BUILD) return await handleEmbeddingsBuild(job, { jobId, userId, input });
    if (jobType === JobType.IMAGE_GENERATE) return await handleImageGenerate(job, { jobId, userId, input });

    throw new Error(`Unknown job type: ${jobType}`);
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    throw error;
  }
}

async function startWorker() {
  const boss = new PgBoss(process.env.DATABASE_URL);
  
  boss.on('error', error => console.error('PgBoss Error:', error));
  
  await boss.start();
  
  // Register handlers
  await boss.work(JobType.CHAPTER_GENERATE, handleJob);
  await boss.work(JobType.CHAPTER_GENERATE_BRANCHES, handleJob);
  await boss.work(JobType.REVIEW_SCORE, handleJob);
  await boss.work(JobType.NOVEL_SEED, handleJob);
  await boss.work(JobType.OUTLINE_ROUGH, handleJob);
  await boss.work(JobType.OUTLINE_DETAILED, handleJob);
  await boss.work(JobType.OUTLINE_CHAPTERS, handleJob);
  await boss.work(JobType.CHARACTER_BIOS, handleJob);
  await boss.work(JobType.OUTLINE_GENERATE, handleJob);
  await boss.work(JobType.GIT_BACKUP, handleJob);
  await boss.work(JobType.CHARACTER_CHAT, handleJob);
  await boss.work(JobType.WIZARD_WORLD_BUILDING, handleJob);
  await boss.work(JobType.WIZARD_CHARACTERS, handleJob);
  await boss.work(JobType.CONSISTENCY_CHECK, handleJob);
  await boss.work(JobType.CANON_CHECK, handleJob);
  
  // Register remaining handlers
  await boss.work(JobType.ARTICLE_ANALYZE, handleJob);
  await boss.work(JobType.BATCH_ARTICLE_ANALYZE, handleJob);
  await boss.work(JobType.MATERIAL_SEARCH, handleJob);
  await boss.work(JobType.EMBEDDINGS_BUILD, handleJob);
  await boss.work(JobType.IMAGE_GENERATE, handleJob);
  
  console.log('Worker started');
}

if (process.env.APP_MODE === 'worker') {
  startWorker().catch(err => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}

export { handleJob }; // Export for testing
