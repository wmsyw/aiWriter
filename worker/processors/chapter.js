import { renderTemplateString } from '../../src/server/services/templates.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { saveVersion, saveBranchVersions, pruneBranchCache } from '../../src/server/services/versioning.js';
import { webSearch, formatSearchResultsForContext, shouldSearchForTopic, extractSearchQueries } from '../../src/server/services/web-search.js';
import { FALLBACK_PROMPTS, WEB_SEARCH_PREFIX, ITERATION_PROMPT_TEMPLATE } from '../../src/constants/prompts.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime } from '../utils/helpers.js';
import { formatHooksForContext } from '../../src/server/services/hooks.js';
import { assembleTruncatedContext } from '../../src/server/services/context-assembly.js';
import { enqueuePostGenerationJobs } from '../../src/server/services/post-generation-jobs.js';
import {
  buildChapterContinuityContext,
  buildContinuityRules,
  extractEndingSnippet,
} from '../../src/shared/chapter-continuity.js';
import { assessChapterContinuity } from '../../src/shared/chapter-continuity-gate.js';
import { normalizeBranchCandidates } from '../../src/shared/chapter-branch-review.js';
import { resolveContinuityGateConfig } from '../../src/shared/continuity-gate-config.js';
import {
  dedupeWebSearchResults,
  formatWebSearchError,
  getSearchFallbackProviders,
  getUserSearchConfig,
  hasAnySearchApiKey,
} from '../utils/web-search-runtime.js';

const CONTEXT_MAX_TOKENS = 28000;
const CONTINUITY_RECENT_CHAPTERS = 6;
const CONTINUITY_SUMMARY_CHAPTERS = 20;

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

function pickChapterOutlineText(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item !== 'object') return '';

  const candidate =
    item.summary ||
    item.content ||
    item.description ||
    item.outline ||
    item.chapter_title ||
    item.title;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }

  try {
    return JSON.stringify(item);
  } catch {
    return '';
  }
}

function extractOutlineChildren(item) {
  if (!item || typeof item !== 'object') return [];
  const candidates = [
    item.children,
    item.chapters,
    item.blocks,
    item.nodes,
    item.story_arcs,
    item.events,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function collectChapterOutlineNodes(chapterOutlines) {
  const rootItems = Array.isArray(chapterOutlines)
    ? chapterOutlines
    : chapterOutlines && typeof chapterOutlines === 'object'
      ? (
          Array.isArray(chapterOutlines.blocks)
            ? chapterOutlines.blocks
            : Array.isArray(chapterOutlines.chapters)
              ? chapterOutlines.chapters
              : Array.isArray(chapterOutlines.children)
                ? chapterOutlines.children
                : Array.isArray(chapterOutlines.nodes)
                  ? chapterOutlines.nodes
                  : Array.isArray(chapterOutlines.story_arcs)
                    ? chapterOutlines.story_arcs
                    : []
        )
      : [];

  const result = [];
  const walk = (items) => {
    if (!Array.isArray(items)) return;

    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;

      const level = typeof item.level === 'string' ? item.level : '';
      const children = extractOutlineChildren(item);
      const text = pickChapterOutlineText(item);
      const looksLikeChapter =
        level === 'chapter' ||
        typeof item.chapter_title === 'string' ||
        typeof item.chapter_id === 'string' ||
        typeof item.order === 'number';

      if (looksLikeChapter && text) {
        result.push(item);
      }

      if (children.length > 0) {
        walk(children);
      }
    });
  };

  walk(rootItems);
  return result;
}

function extractChapterOutlineFromNovel(chapter) {
  const chapterOutlines = chapter?.novel?.outlineChapters;
  const chapterNodes = collectChapterOutlineNodes(chapterOutlines);
  if (chapterNodes.length === 0) {
    return '';
  }

  const orderCandidates = [chapter.order, chapter.order - 1].filter(
    (value) => Number.isInteger(value) && value >= 0
  );
  for (const orderIndex of orderCandidates) {
    const orderMatch = chapterNodes[orderIndex];
    const orderText = pickChapterOutlineText(orderMatch);
    if (orderText) {
      return orderText;
    }
  }

  const chapterTitle = typeof chapter?.title === 'string' ? chapter.title.trim() : '';
  if (chapterTitle) {
    const titleMatch = chapterNodes.find((item) => {
      const itemTitle =
        typeof item.title === 'string'
          ? item.title.trim()
          : typeof item.chapter_title === 'string'
            ? item.chapter_title.trim()
            : '';
      return itemTitle && itemTitle === chapterTitle;
    });
    const titleText = pickChapterOutlineText(titleMatch);
    if (titleText) {
      return titleText;
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

async function performWebSearchIfNeeded(prisma, userId, content, novelTitle) {
  const searchConfig = await getUserSearchConfig(prisma, userId, { defaultProvider: 'model' });
  if (!searchConfig.enabled) return null;
  
  if (searchConfig.provider === 'model') {
    return { useModelSearch: true };
  }
  
  if (!hasAnySearchApiKey(searchConfig.providerApiKeys)) return null;
  if (!shouldSearchForTopic(content)) return null;
  
  const queries = extractSearchQueries(content, novelTitle);
  if (queries.length === 0) return null;
  
  const allResults = [];
  for (const query of queries) {
    try {
      const response = await webSearch(searchConfig.provider, searchConfig.apiKey || '', query, 3, {
        fallbackProviders: getSearchFallbackProviders(searchConfig.provider),
        providerApiKeys: searchConfig.providerApiKeys,
        timeoutMs: 30000,
        allowEmptyResultFallback: true,
      });
      allResults.push(...response.results);
    } catch (err) {
      console.error(`Web search failed for query "${query}":`, err instanceof Error ? err.message : err);
      console.warn(`[CHAPTER] ${formatWebSearchError(err)}`);
    }
  }
  
  const dedupedResults = dedupeWebSearchResults(allResults);
  if (dedupedResults.length === 0) return null;
  return { context: formatSearchResultsForContext(dedupedResults.slice(0, 5)) };
}

function buildContextAssemblyConfig(chapterOrder) {
  const availableChapters = Math.max(0, chapterOrder - 1);
  const recentChaptersCount = availableChapters > 0
    ? Math.min(CONTINUITY_RECENT_CHAPTERS, availableChapters)
    : 1;
  const summaryChaptersCount = availableChapters > recentChaptersCount
    ? Math.min(CONTINUITY_SUMMARY_CHAPTERS, availableChapters - recentChaptersCount)
    : 0;

  return {
    recentChaptersCount,
    summaryChaptersCount,
    maxTotalTokens: CONTEXT_MAX_TOKENS,
  };
}

function buildContinuityGateRepairPrompt({
  chapterOrder,
  basePrompt,
  draftContent,
  continuityContext,
  continuityRules,
  assessment,
}) {
  const issueLines = assessment.issues.length
    ? assessment.issues
        .slice(0, 5)
        .map((issue, index) => `${index + 1}. [${issue.severity}] ${issue.message}`)
        .join('\n')
    : '1. 承接前文不充分，请补强时间线与事件链衔接。';

  return [
    basePrompt,
    '',
    continuityContext ? continuityContext : '',
    continuityRules || '',
    '',
    '## 当前草稿（待修复）',
    draftContent,
    '',
    `## 连续性修复任务（第${chapterOrder}章）`,
    `当前连续性得分：${assessment.score}，判定：${assessment.verdict}`,
    issueLines,
    '',
    '请在保留本章核心事件和人物关系的前提下重写全文：',
    '1. 开篇必须明确承接上一章结尾状态（时间、地点、冲突或人物状态）。',
    '2. 对近章关键事件链至少体现延续或反馈，不得像新开一章。',
    '3. 未回收线索至少推进一项，或给出清晰延后理由。',
    '4. 输出完整章节正文，不要解释、不要列提纲。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildContinuityGateErrorMessage(report) {
  const issueText = (report.issues || [])
    .slice(0, 3)
    .map((item) => item.message)
    .join('；');
  const reason = issueText || '与前文承接不足';
  return `连续性门禁未通过（得分 ${report.score}）：${reason}。请补充章节任务卡或迭代反馈后重试。`;
}

async function runContinuityGateWithRepair({
  prisma,
  userId,
  jobId,
  config,
  adapter,
  agent,
  defaultModel,
  webSearch,
  chapterOrder,
  basePrompt,
  initialContent,
  continuityData,
  continuityRules,
  gateConfig,
}) {
  if (!gateConfig.enabled) {
    return {
      content: initialContent,
      assessment: {
        score: 10,
        verdict: 'pass',
        issues: [],
        metrics: {
          openingCoverage: 1,
          eventCoverage: 1,
          hookCoverage: 1,
          timelineCue: true,
          signalTotals: { anchors: 0, events: 0, hooks: 0 },
        },
        matchedSignals: { anchors: [], events: [], hooks: [] },
      },
      repairAttempts: 0,
      blocked: false,
    };
  }

  let content = initialContent;
  let repairAttempts = 0;
  let assessment = assessChapterContinuity(
    content,
    continuityData.previousChapters,
    continuityData.chapterSummaries,
    {
      passScore: gateConfig.passScore,
      rejectScore: gateConfig.rejectScore,
    }
  );

  while (assessment.verdict !== 'pass' && repairAttempts < gateConfig.maxRepairAttempts) {
    const repairPrompt = buildContinuityGateRepairPrompt({
      chapterOrder,
      basePrompt,
      draftContent: content,
      continuityContext: continuityData.continuityContext,
      continuityRules,
      assessment,
    });

    const { response: repairedResponse } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: repairPrompt }],
      webSearch,
      temperature: 0.65,
    });

    content = repairedResponse.content;
    repairAttempts += 1;
    assessment = assessChapterContinuity(
      content,
      continuityData.previousChapters,
      continuityData.chapterSummaries,
      {
        passScore: gateConfig.passScore,
        rejectScore: gateConfig.rejectScore,
      }
    );
  }

  return {
    content,
    assessment,
    repairAttempts,
    blocked: assessment.verdict === 'reject',
  };
}

function buildFallbackPreviousSummary(previousChapters) {
  if (!Array.isArray(previousChapters) || previousChapters.length === 0) {
    return '';
  }

  return previousChapters
    .map((chapter) => {
      const title = (chapter.title || '').trim() || `第${chapter.order}章`;
      const ending = extractEndingSnippet(chapter.content || '', 180);
      if (ending) {
        return `第${chapter.order}章《${title}》结尾：${ending}`;
      }
      return `第${chapter.order}章《${title}》`;
    })
    .join('\n');
}

async function loadChapterContinuityData(prisma, novelId, chapterOrder) {
  const [rawPreviousChapters, chapterSummaries] = await Promise.all([
    prisma.chapter.findMany({
      where: { novelId, order: { lt: chapterOrder } },
      orderBy: { order: 'desc' },
      take: CONTINUITY_RECENT_CHAPTERS,
      select: {
        order: true,
        title: true,
        content: true,
      },
    }),
    prisma.chapterSummary.findMany({
      where: {
        novelId,
        chapterNumber: { lt: chapterOrder },
      },
      orderBy: { chapterNumber: 'desc' },
      take: CONTINUITY_SUMMARY_CHAPTERS,
      select: {
        chapterNumber: true,
        oneLine: true,
        keyEvents: true,
        characterDevelopments: true,
        hooksPlanted: true,
        hooksReferenced: true,
        hooksResolved: true,
      },
    }),
  ]);

  const previousChapters = [...rawPreviousChapters].sort((a, b) => a.order - b.order);
  return {
    previousSummaryFallback: buildFallbackPreviousSummary(previousChapters),
    continuityContext: buildChapterContinuityContext(previousChapters, chapterSummaries),
    previousChapters,
    chapterSummaries,
  };
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

  const resolved = resolveOutlineAndChapterCard(chapter, outline, chapterCard);

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节写手',
    templateName: '章节写作',
  });
  if (!agent) throw new Error('Agent not found');

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const continuityData = await loadChapterContinuityData(prisma, chapter.novelId, chapter.order);

  let enhancedContext = null;
  
  try {
    enhancedContext = await assembleTruncatedContext(
      chapter.novelId,
      chapter.order,
      CONTEXT_MAX_TOKENS,
      buildContextAssemblyConfig(chapter.order)
    );
    if (enhancedContext?.warnings?.length) {
      console.warn('Context assembly warnings:', enhancedContext.warnings.join('; '));
    }
  } catch (err) {
    console.warn('Context assembly failed, using fallback:', err.message);
  }
  const previousSummary = enhancedContext?.context || continuityData.previousSummaryFallback;

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
    continuity_context: continuityData.continuityContext,
    continuity_rules: buildContinuityRules(),
  };

  const templateUsesContinuity = Boolean(
    template?.content &&
      (
        template.content.includes('continuity_context') ||
        template.content.includes('continuity_rules')
      )
  );

  let prompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHAPTER_GENERATE(chapter.order, chapter.novel.title);

  if (resolved.outline) {
    prompt += `\n\n## 本章大纲\n${resolved.outline}`;
  }

  if (resolved.chapterCardSection) {
    prompt += `\n\n${resolved.chapterCardSection}`;
  }

  if (!templateUsesContinuity) {
    if (continuityData.continuityContext) {
      prompt += `\n\n${continuityData.continuityContext}`;
    }
    prompt += `\n\n${buildContinuityRules()}`;
  }

  if (hooksContext) {
    prompt = `${prompt}\n\n---\n\n${hooksContext}`;
  }

  if (webSearchResult?.context) {
    prompt = `${WEB_SEARCH_PREFIX}${webSearchResult.context}\n\n---\n\n${prompt}`;
  }

  const continuityRules = buildContinuityRules();
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

  const continuityGateConfig = resolveContinuityGateConfig(chapter.novel.workflowConfig, {
    defaultReviewPassThreshold: 7.4,
    defaultRejectScore: 4.9,
    defaultMaxRepairAttempts: 1,
  });
  const continuityGate = await runContinuityGateWithRepair({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    webSearch: useModelSearch,
    chapterOrder: chapter.order,
    basePrompt: prompt,
    initialContent: response.content,
    continuityData,
    continuityRules,
    gateConfig: continuityGateConfig,
  });

  if (continuityGate.blocked) {
    throw new Error(buildContinuityGateErrorMessage(continuityGate.assessment));
  }

  await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapterId },
      data: {
        content: continuityGate.content,
        generationStage: 'generated',
        pendingReview: continuityGate.assessment.verdict !== 'pass',
      },
    });

    await saveVersion(chapterId, continuityGate.content, tx);
  });
  const postProcessSummary = await enqueuePostGenerationJobs(userId, chapterId);
  const analysisQueueError = postProcessSummary.failed.length
    ? postProcessSummary.failed.map((item) => `${item.type}: ${item.error}`).join('; ')
    : null;
  if (analysisQueueError) {
    console.error('Failed to enqueue some post-generation jobs', analysisQueueError);
  }
 
  return { 
    content: continuityGate.content, 
    wordCount: continuityGate.content.split(/\s+/).length,
    webSearchUsed: useModelSearch || !!webSearchResult?.context,
    analysisQueued: postProcessSummary.allQueued,
    analysisQueueError,
    postProcess: postProcessSummary,
    pendingEntitiesBlocking: false,
    continuityGate: {
      score: continuityGate.assessment.score,
      verdict: continuityGate.assessment.verdict,
      issues: continuityGate.assessment.issues,
      metrics: continuityGate.assessment.metrics,
      repairAttempts: continuityGate.repairAttempts,
      passScore: continuityGateConfig.passScore,
      rejectScore: continuityGateConfig.rejectScore,
    },
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

  const resolved = resolveOutlineAndChapterCard(chapter, outline, chapterCard);

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节写手',
    templateName: '章节写作',
  });
  if (!agent) throw new Error('Agent not found');

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const continuityData = await loadChapterContinuityData(prisma, chapter.novelId, chapter.order);

  let enhancedContext;
  try {
    enhancedContext = await assembleTruncatedContext(
      chapter.novelId,
      chapter.order,
      CONTEXT_MAX_TOKENS,
      buildContextAssemblyConfig(chapter.order)
    );
    if (enhancedContext?.warnings?.length) {
      console.warn('Context assembly warnings for branches:', enhancedContext.warnings.join('; '));
    }
  } catch (err) {
    console.warn('Failed to assemble enhanced context for branches, falling back to basic:', err.message);
    enhancedContext = null;
  }
  const previousSummary = enhancedContext?.context || continuityData.previousSummaryFallback;
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
    continuity_context: continuityData.continuityContext,
    continuity_rules: buildContinuityRules(),
  };

  const templateUsesContinuity = Boolean(
    template?.content &&
      (
        template.content.includes('continuity_context') ||
        template.content.includes('continuity_rules')
      )
  );

  let basePrompt = template
    ? renderTemplateString(template.content, context)
    : FALLBACK_PROMPTS.CHAPTER_GENERATE(chapter.order, chapter.novel.title);

  if (resolved.outline) {
    basePrompt += `\n\n## 本章大纲\n${resolved.outline}`;
  }

  if (resolved.chapterCardSection) {
    basePrompt += `\n\n${resolved.chapterCardSection}`;
  }

  if (!templateUsesContinuity) {
    if (continuityData.continuityContext) {
      basePrompt += `\n\n${continuityData.continuityContext}`;
    }
    basePrompt += `\n\n${buildContinuityRules()}`;
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

  const continuityGateConfig = resolveContinuityGateConfig(chapter.novel.workflowConfig, {
    defaultReviewPassThreshold: 7.4,
    defaultRejectScore: 4.9,
    defaultMaxRepairAttempts: 1,
  });
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
  const branchesWithContinuity = branches.map((branch) => {
    const continuity = assessChapterContinuity(
      branch.content,
      continuityData.previousChapters,
      continuityData.chapterSummaries,
      {
        passScore: continuityGateConfig.passScore,
        rejectScore: continuityGateConfig.rejectScore,
      }
    );

    return {
      ...branch,
      continuity,
    };
  });
  const sortedBranches = normalizeBranchCandidates(
    branchesWithContinuity.map((branch) => ({
      ...branch,
      continuityScore: branch.continuity.score,
    }))
  );

  const parentVersion = selectedVersionId || chapter.currentVersionId || null;
  await saveBranchVersions(chapterId, branches, parentVersion);
  await pruneBranchCache(chapterId, 3);

  return {
    branches: sortedBranches.map(b => ({
      branchNumber: b.branchNumber,
      preview: b.content.slice(0, 500),
      wordCount: b.content.split(/\s+/).length,
      continuityScore: b.continuity.score,
      continuityVerdict: b.continuity.verdict,
      continuityIssues: b.continuity.issues.slice(0, 2).map((issue) => issue.message),
    })),
    continuityGate: {
      passScore: continuityGateConfig.passScore,
      rejectScore: continuityGateConfig.rejectScore,
      rejectedCount: branchesWithContinuity.filter((item) => item.continuity.verdict === 'reject').length,
    },
  };
}
