import { renderTemplateString } from '../../src/server/services/templates.js';
import { buildMaterialContext } from '../../src/server/services/materials.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson, truncateText } from '../utils/helpers.js';

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function toString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toScore10(value) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const normalized = parsed >= 0 && parsed <= 1 ? parsed * 10 : parsed;
  return Math.max(0, Math.min(10, normalized));
}

function normalizeSeverity(value) {
  const normalized = toString(value).toLowerCase();
  if (normalized === 'critical' || normalized === 'fatal') return 'critical';
  if (normalized === 'major' || normalized === 'high') return 'major';
  if (normalized === 'minor' || normalized === 'medium' || normalized === 'normal') return 'minor';
  if (normalized === 'nitpick' || normalized === 'low') return 'nitpick';
  return 'warning';
}

function toStringList(value, keys = ['description', 'suggestion', 'title']) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      result.push(item.trim());
      continue;
    }
    if (!isRecord(item)) continue;
    for (const key of keys) {
      const field = item[key];
      if (typeof field === 'string' && field.trim()) {
        result.push(field.trim());
      } else if (Array.isArray(field)) {
        for (const nested of field) {
          if (typeof nested === 'string' && nested.trim()) {
            result.push(nested.trim());
          }
        }
      }
    }
  }
  return result;
}

function normalizeConsistencyIssue(value, index, fallback = {}) {
  if (typeof value === 'string') {
    const description = value.trim();
    if (!description) return null;
    return {
      id: `issue-${index + 1}`,
      category: fallback.category || 'general',
      severity: fallback.severity || 'warning',
      title: fallback.title || '潜在冲突',
      description,
      location: fallback.location,
      evidence: fallback.evidence,
      suggestion: fallback.suggestion,
      priority: fallback.priority,
    };
  }

  if (!isRecord(value)) return null;

  const title =
    toString(value.title) ||
    toString(value.type) ||
    toString(value.category) ||
    fallback.title ||
    '潜在冲突';
  const description =
    toString(value.description) ||
    toString(value.problem) ||
    toString(value.contradiction) ||
    toString(value.current_text) ||
    toString(value.needs_verification);
  if (!title && !description) return null;

  const location = toString(value.location) || fallback.location;
  const evidence =
    toString(value.evidence) ||
    toString(value.reference) ||
    toString(value.current_text) ||
    toString(value.established_fact) ||
    fallback.evidence;
  const suggestion =
    toString(value.suggestion) ||
    toString(value.advice) ||
    toString(value.recommendation) ||
    fallback.suggestion;
  const category =
    toString(value.category) ||
    toString(value.type) ||
    fallback.category ||
    'general';
  const priority = toNumber(value.priority ?? fallback.priority);

  return {
    id: toString(value.id) || toString(value.issue_id) || `issue-${index + 1}`,
    category,
    severity: normalizeSeverity(value.severity ?? value.priority ?? fallback.severity),
    title: title || '潜在冲突',
    description: description || title || '存在潜在一致性风险',
    location: location || undefined,
    evidence: evidence || undefined,
    suggestion: suggestion || undefined,
    priority: priority ?? undefined,
  };
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = toString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeConsistencyResult(raw) {
  if (!isRecord(raw)) {
    return {
      isConsistent: true,
      overallScore: 0,
      summary: '',
      dimensions: {},
      highlights: [],
      improvements: [],
      issues: [],
      next_actions: [],
    };
  }

  const dimensionsSource = isRecord(raw.dimension_scores)
    ? raw.dimension_scores
    : (isRecord(raw.dimensions) ? raw.dimensions : {});
  const dimensions = {};
  for (const [key, value] of Object.entries(dimensionsSource)) {
    const score = isRecord(value) ? toScore10(value.score) : toScore10(value);
    if (score === null) continue;
    dimensions[key] = {
      score: Math.round(score * 10) / 10,
      comment: isRecord(value)
        ? (toString(value.comment) || toString(value.feedback) || toString(value.notes) || undefined)
        : undefined,
    };
  }

  const issues = [];
  const appendIssues = (list, fallback = {}) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const normalized = normalizeConsistencyIssue(item, issues.length, fallback);
      if (normalized) {
        issues.push(normalized);
      }
    }
  };

  appendIssues(raw.issues);
  appendIssues(raw.potential_issues, { severity: 'warning', title: '潜在问题' });
  appendIssues(raw.warnings, { severity: 'warning', title: '风险提示' });
  if (isRecord(raw.anti_hallucination_check)) {
    appendIssues(raw.anti_hallucination_check.outline_violations, {
      category: 'outline',
      title: '大纲冲突',
    });
    appendIssues(raw.anti_hallucination_check.setting_violations, {
      category: 'setting',
      title: '设定冲突',
    });
    appendIssues(raw.anti_hallucination_check.new_inventions, {
      category: 'new_invention',
      severity: 'warning',
      title: '新增设定',
    });
  }

  const dedupeIssueSet = new Set();
  const dedupedIssues = issues.filter((item) => {
    const key = `${toString(item.title).toLowerCase()}|${toString(item.description).toLowerCase()}|${toString(item.evidence).toLowerCase()}`;
    if (!key || dedupeIssueSet.has(key)) return false;
    dedupeIssueSet.add(key);
    return true;
  });

  const severityOrder = {
    critical: 0,
    major: 1,
    warning: 2,
    minor: 3,
    nitpick: 4,
    info: 5,
  };

  dedupedIssues.sort((left, right) => {
    const severityDiff = (severityOrder[left.severity] ?? 99) - (severityOrder[right.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;
    const priorityDiff = (left.priority ?? Number.POSITIVE_INFINITY) - (right.priority ?? Number.POSITIVE_INFINITY);
    if (priorityDiff !== 0) return priorityDiff;
    return left.id.localeCompare(right.id, 'zh-Hans-CN');
  });

  const dimensionScores = Object.values(dimensions)
    .map((item) => toNumber(item.score))
    .filter((value) => value !== null);
  const scoreCandidates = [
    raw.overallScore,
    raw.overall_score,
    raw.consistency_score,
    raw.score,
  ]
    .map((value) => toScore10(value))
    .filter((value) => value !== null);
  const overallScore = dimensionScores.length > 0
    ? Math.round((dimensionScores.reduce((sum, value) => sum + value, 0) / dimensionScores.length) * 10) / 10
    : Math.round((scoreCandidates[0] || 0) * 10) / 10;

  const summaryObject = isRecord(raw.summary) ? raw.summary : null;
  const summary =
    toString(raw.score_explanation) ||
    toString(raw.overall_assessment) ||
    toString(raw.summary) ||
    (summaryObject
      ? (toString(summaryObject.overall_assessment) || toString(summaryObject.summary))
      : '');

  const highlights = dedupeStrings([
    ...toStringList(raw.highlights, ['description', 'quote', 'category']),
    ...(summaryObject && toString(summaryObject.strongest_aspect)
      ? [`最佳表现：${toString(summaryObject.strongest_aspect)}`]
      : []),
  ]).slice(0, 8);

  const improvements = dedupeStrings([
    ...toStringList(raw.improvements, ['description', 'suggestion']),
    ...toStringList(raw.improvement_suggestions, ['suggestion', 'description']),
    ...toStringList(raw.revision_priority),
    ...(summaryObject && toString(summaryObject.weakest_aspect)
      ? [`优先补强：${toString(summaryObject.weakest_aspect)}`]
      : []),
    ...dedupedIssues
      .slice(0, 5)
      .map((item) => item.suggestion)
      .filter((item) => typeof item === 'string' && item.trim()),
  ]).slice(0, 10);

  const nextActions = dedupeStrings([
    ...toStringList(raw.next_actions),
    ...toStringList(raw.improvement_suggestions, ['suggestion']),
    ...(summaryObject ? [toString(summaryObject.recommendation)] : []),
  ]).slice(0, 6);

  const isConsistent = typeof raw.isConsistent === 'boolean'
    ? raw.isConsistent
    : !dedupedIssues.some((item) => item.severity === 'critical' || item.severity === 'major');

  return {
    ...raw,
    isConsistent,
    overallScore,
    summary,
    dimensions,
    highlights,
    improvements,
    issues: dedupedIssues,
    next_actions: nextActions,
  };
}


export async function handleReviewScore(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '章节评审',
    templateName: '章节评审',
  });

  const context = { chapter_content: chapter.content };
  const basePrompt = template
    ? renderTemplateString(template.content, context)
    : `Review this chapter and provide a score from 1-10:\n\n${chapter.content}`;

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: basePrompt }],
    temperature: 0.3,
    maxTokens: 2000,
  });

  const result = parseModelJson(response.content);

  const hasReviewContent = result && typeof result === 'object';

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      generationStage: 'reviewed',
      reviewFeedback: hasReviewContent ? result : null,
      pendingReview: true,
      approvedAt: null,
      lastReviewAt: new Date(),
      reviewIterations: { increment: 1 },
    },
  });

  return result;
}

export async function handleConsistencyCheck(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');
  const isFanfiction = typeof chapter.novel.genre === 'string' && chapter.novel.genre.includes('同人');
  if (!isFanfiction) {
    throw new Error('一致性检查仅适用于同人文');
  }

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '一致性检查',
    templateName: '一致性检查',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding', 'plotPoint']);
  const chapterContent = truncateText(chapter.content || '', 12000);

  const context = {
    chapter_content: chapterContent,
    chapter_number: chapter.order,
    materials: materials,
    outline: chapter.novel.outline || '',
  };

  const fallbackPrompt = `你是一位严谨的同人文连载编辑，请检查章节与已知设定是否一致，并仅输出 JSON。

## 待检查章节
${chapterContent}

## 既有设定
${materials || '（暂无）'}

## 输出格式（必须是 JSON）
{
  "consistency_score": 0-10,
  "score_explanation": "评分说明",
  "isConsistent": true/false,
  "dimension_scores": {
    "character_consistency": { "score": 0-10, "comment": "角色一致性评语" },
    "timeline_consistency": { "score": 0-10, "comment": "时间线一致性评语" },
    "world_consistency": { "score": 0-10, "comment": "世界观/地理一致性评语" },
    "power_system_consistency": { "score": 0-10, "comment": "力量体系一致性评语" },
    "plot_logic_consistency": { "score": 0-10, "comment": "剧情逻辑一致性评语" }
  },
  "highlights": ["做得好的点1", "做得好的点2"],
  "improvement_suggestions": [
    { "priority": "high|medium|low", "category": "分类", "suggestion": "改进建议" }
  ],
  "issues": [
    {
      "id": "issue_1",
      "category": "character|timeline|world|power_system|plot_logic|details",
      "severity": "critical|major|minor|nitpick",
      "title": "问题标题",
      "description": "问题描述",
      "location": "原文位置",
      "evidence": "证据",
      "suggestion": "修改建议",
      "priority": 1
    }
  ],
  "summary": {
    "overall_assessment": "整体评估",
    "recommendation": "可发布|建议修改后发布|需要重点修改",
    "strongest_aspect": "表现最佳维度",
    "weakest_aspect": "最需改进维度"
  },
  "next_actions": ["下一步建议 1", "下一步建议 2"]
}`;
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
    temperature: 0.2,
    maxTokens: 4000,
  });

  const result = parseModelJson(response.content);
  return normalizeConsistencyResult(result);
}

export async function handleCanonCheck(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, originalWork, canonSettings, characterProfiles, worldRules } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '原作符合度检查',
    templateName: '原作符合度检查',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const materials = await buildMaterialContext(chapter.novelId, userId, ['character', 'worldbuilding']);
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

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 6000,
  });

  const result = parseModelJson(response.content);

  return result;
}
