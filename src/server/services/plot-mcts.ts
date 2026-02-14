import { prisma } from '../db';
import { getHierarchicalContext, formatHierarchicalContextForPrompt } from './hierarchical-summary';
import { getCodexEntries } from './codex';
import { getUnresolvedHooks } from './hooks';

export type PlotGenerator = (
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
) => Promise<string>;

export interface PlotBranch {
  id: string;
  path: string[];
  description: string;
  probability: number;
  engagement: number;
  consistency: number;
  novelty: number;
  tensionArc: number;
  overallScore: number;
  risks: string[];
  opportunities: string[];
}

export interface PlotNode {
  id: string;
  chapterNumber: number;
  event: string;
  consequences: string[];
  children: PlotNode[];
  score: number;
  visits: number;
}

export interface PlotSimulationResult {
  rootNode: PlotNode;
  bestPath: PlotBranch;
  alternativePaths: PlotBranch[];
  deadEndWarnings: string[];
  hookOpportunities: Array<{
    hookId: string;
    hookDescription: string;
    suggestedResolution: string;
  }>;
}

export interface SimulationOptions {
  branchCount?: number;
  depth?: number;
  iterations?: number;
  focusHooks?: boolean;
}

export interface PlotSimulationRunOptions {
  steps?: number;
  iterations?: number;
  branchCount?: number;
  focusHooks?: boolean;
}

const SCORING_WEIGHTS = {
  engagement: 0.3,
  consistency: 0.25,
  novelty: 0.2,
  tensionArc: 0.15,
  hookResolution: 0.1,
};

export async function generatePlotBranches(
  novelId: string,
  currentChapter: number,
  options: SimulationOptions = {},
  generator?: PlotGenerator
): Promise<PlotBranch[]> {
  const { branchCount = 3, focusHooks = true } = options;

  const context = await getHierarchicalContext(novelId, currentChapter);
  const codex = await getCodexEntries(novelId, { maxEntries: 10 });
  const unresolvedHooks = focusHooks ? await getUnresolvedHooks(novelId) : [];

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      title: true,
      genre: true,
      outlineDetailed: true,
      goldenFinger: true,
    },
  });

  if (!novel) throw new Error('Novel not found');

  if (generator) {
    return generateBranchesWithAI(
      novelId,
      currentChapter,
      branchCount,
      generator,
      context,
      codex,
      unresolvedHooks,
      novel.genre || 'fantasy',
      novel.title,
      novel.goldenFinger || ''
    );
  }

  const branches: PlotBranch[] = [];
  const outlineData = novel.outlineDetailed as { chapters?: Array<{ title?: string; events?: string[] }> } | null;

  const upcomingOutline = outlineData?.chapters?.slice(currentChapter, currentChapter + 3) || [];

  const branchTemplates = [
    { type: 'outline-adherent', weight: 0.4 },
    { type: 'conflict-escalation', weight: 0.25 },
    { type: 'character-development', weight: 0.2 },
    { type: 'hook-resolution', weight: 0.15 },
  ];

  for (let i = 0; i < branchCount; i++) {
    const template = selectWeightedTemplate(branchTemplates, i);
    const branch = await generateBranchFromTemplate(
      template.type,
      novelId,
      currentChapter,
      context,
      codex,
      unresolvedHooks,
      upcomingOutline,
      novel.genre || 'fantasy'
    );
    branches.push(branch);
  }

  return branches.sort((a, b) => b.overallScore - a.overallScore);
}

async function generateBranchesWithAI(
  novelId: string,
  currentChapter: number,
  count: number,
  generator: PlotGenerator,
  context: Awaited<ReturnType<typeof getHierarchicalContext>>,
  codex: Awaited<ReturnType<typeof getCodexEntries>>,
  unresolvedHooks: HookEntry[],
  genre: string,
  title: string,
  goldenFinger: string
): Promise<PlotBranch[]> {
  const contextText = formatHierarchicalContextForPrompt(context);
  const codexText = codex.formattedContext;
  const hooksText = unresolvedHooks.map(h => `- ${h.description}`).join('\n');

  const prompt = `作为一个专业的${genre}小说剧情策划专家，请根据当前剧情上下文，预测接下来的剧情发展分支。

## 小说信息
标题: ${title}
类型: ${genre}
金手指/核心设定: ${goldenFinger}

## 剧情上下文
${contextText}

## 核心实体
${codexText}

## 未解决伏笔
${hooksText || '(暂无)'}

请生成 ${count} 个截然不同的剧情走向分支（Plot Branches）。
每个分支包含接下来3章的简要大纲。

请严格返回以下JSON格式：
{
  "branches": [
    {
      "description": "分支的一句话描述（如：主角遭遇伏击/揭开身世之谜）",
      "path": ["第${currentChapter+1}章: 事件...", "第${currentChapter+2}章: 事件...", "第${currentChapter+3}章: 事件..."],
      "scores": {
        "engagement": 0.8, // 参与度 (0-1)
        "consistency": 0.7, // 连贯性 (0-1)
        "novelty": 0.6, // 新颖度 (0-1)
        "tensionArc": 0.7 // 张力 (0-1)
      },
      "risks": ["风险1", "风险2"],
      "opportunities": ["机会1", "机会2"]
    }
  ]
}
`;

  try {
    const response = await generator(prompt, { temperature: 0.7 });
    const parsed = JSON.parse(response.replace(/```json\n?|\n?```/g, '').trim());
    
    if (parsed && Array.isArray(parsed.branches)) {
      return parsed.branches.map((b: any) => ({
        id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        path: b.path || [],
        description: b.description || '未知分支',
        probability: 1 / parsed.branches.length,
        engagement: b.scores?.engagement || 0.5,
        consistency: b.scores?.consistency || 0.5,
        novelty: b.scores?.novelty || 0.5,
        tensionArc: b.scores?.tensionArc || 0.5,
        overallScore: calculateOverallScore(
          b.scores || {
            engagement: 0.5,
            consistency: 0.5,
            novelty: 0.5,
            tensionArc: 0.5,
            hookResolution: 0.5,
          }
        ),
        risks: b.risks || [],
        opportunities: b.opportunities || [],
      }));
    }
  } catch (error) {
    console.error('AI plot generation failed:', error);
  }

  // Fallback to template generation if AI fails
  const branches: PlotBranch[] = [];
  const branchTemplates = [
    { type: 'outline-adherent', weight: 0.4 },
    { type: 'conflict-escalation', weight: 0.25 },
    { type: 'character-development', weight: 0.2 },
    { type: 'hook-resolution', weight: 0.15 },
  ];

  for (let i = 0; i < count; i++) {
    const template = selectWeightedTemplate(branchTemplates, i);
    const branch = await generateBranchFromTemplate(
      template.type,
      novelId,
      currentChapter,
      context,
      codex,
      unresolvedHooks,
      [], // No outline data in fallback
      genre
    );
    branches.push(branch);
  }
  return branches;
}

function selectWeightedTemplate(
  templates: Array<{ type: string; weight: number }>,
  index: number
): { type: string; weight: number } {
  if (index === 0) return templates[0];
  const rand = Math.random();
  let cumulative = 0;
  for (const t of templates) {
    cumulative += t.weight;
    if (rand < cumulative) return t;
  }
  return templates[templates.length - 1];
}

type HookEntry = { id: string; description: string };
type OutlineChapter = { title?: string; events?: string[] };

async function generateBranchFromTemplate(
  templateType: string,
  novelId: string,
  currentChapter: number,
  context: Awaited<ReturnType<typeof getHierarchicalContext>>,
  codex: Awaited<ReturnType<typeof getCodexEntries>>,
  unresolvedHooks: HookEntry[],
  upcomingOutline: OutlineChapter[],
  genre: string
): Promise<PlotBranch> {
  const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  let description = '';
  let path: string[] = [];
  let scores = {
    engagement: 0.5,
    consistency: 0.5,
    novelty: 0.5,
    tensionArc: 0.5,
    hookResolution: 0.5,
  };
  let risks: string[] = [];
  let opportunities: string[] = [];

  switch (templateType) {
    case 'outline-adherent':
      if (upcomingOutline.length > 0) {
        path = upcomingOutline.map((c, i) => 
          `第${currentChapter + i + 1}章: ${c.title || '继续主线'}`
        );
        description = `严格按照大纲发展: ${upcomingOutline[0]?.events?.[0] || '推进主要情节'}`;
        scores = {
          engagement: 0.6,
          consistency: 0.9,
          novelty: 0.3,
          tensionArc: 0.6,
          hookResolution: 0.4,
        };
        opportunities.push('稳定发展，保持一致性');
        risks.push('可能略显平淡');
      }
      break;

    case 'conflict-escalation':
      description = `升级矛盾冲突，推动紧张局势`;
      path = [
        `第${currentChapter + 1}章: 危机爆发`,
        `第${currentChapter + 2}章: 对峙升级`,
        `第${currentChapter + 3}章: 决战时刻`,
      ];
      scores = {
        engagement: 0.9,
        consistency: 0.6,
        novelty: 0.7,
        tensionArc: 0.9,
        hookResolution: 0.25,
      };
      opportunities.push('大幅提升读者参与度');
      risks.push('需要合理的冲突动机', '可能偏离大纲');
      break;

    case 'character-development':
      const mainCharacter = codex.entries.find(e => e.type === 'character');
      if (mainCharacter) {
        description = `深入发展${mainCharacter.name}的角色弧`;
        path = [
          `第${currentChapter + 1}章: ${mainCharacter.name}内心挣扎`,
          `第${currentChapter + 2}章: 关键抉择`,
          `第${currentChapter + 3}章: 成长蜕变`,
        ];
      } else {
        description = '深入角色发展';
        path = [
          `第${currentChapter + 1}章: 角色反思`,
          `第${currentChapter + 2}章: 内在冲突`,
          `第${currentChapter + 3}章: 突破自我`,
        ];
      }
      scores = {
        engagement: 0.7,
        consistency: 0.8,
        novelty: 0.6,
        tensionArc: 0.5,
        hookResolution: 0.35,
      };
      opportunities.push('增强角色深度', '建立读者情感连接');
      risks.push('节奏可能放缓');
      break;

    case 'hook-resolution':
      if (unresolvedHooks.length > 0) {
        const targetHook = unresolvedHooks[0];
        description = `解决伏笔: ${targetHook.description}`;
        path = [
          `第${currentChapter + 1}章: 揭示线索`,
          `第${currentChapter + 2}章: 真相浮现`,
          `第${currentChapter + 3}章: 伏笔收束`,
        ];
        scores = {
          engagement: 0.8,
          consistency: 0.85,
          novelty: 0.5,
          tensionArc: 0.7,
          hookResolution: 0.9,
        };
        opportunities.push('满足读者期待', '证明叙事连贯性');
      } else {
        description = '埋设新伏笔';
        path = [
          `第${currentChapter + 1}章: 神秘暗示`,
          `第${currentChapter + 2}章: 悬念加深`,
          `第${currentChapter + 3}章: 关键铺垫`,
        ];
        scores = {
          engagement: 0.6,
          consistency: 0.7,
          novelty: 0.8,
          tensionArc: 0.5,
          hookResolution: 0.2,
        };
        opportunities.push('建立长期悬念');
        risks.push('需要后续章节配合解决');
      }
      break;
  }

  applyGenreModifiers(scores, genre);

  const overallScore = calculateOverallScore(scores);

  return {
    id: branchId,
    path,
    description,
    probability: 1 / 3,
    engagement: scores.engagement,
    consistency: scores.consistency,
    novelty: scores.novelty,
    tensionArc: scores.tensionArc,
    overallScore,
    risks,
    opportunities,
  };
}

function applyGenreModifiers(
  scores: { engagement: number; consistency: number; novelty: number; tensionArc: number },
  genre: string
): void {
  const modifiers: Record<string, Partial<typeof scores>> = {
    '玄幻': { engagement: 0.1, tensionArc: 0.1 },
    '都市': { consistency: 0.1 },
    '言情': { engagement: 0.05 },
    '悬疑': { novelty: 0.1, tensionArc: 0.15 },
    '科幻': { novelty: 0.15 },
  };

  const modifier = modifiers[genre] || {};
  for (const [key, value] of Object.entries(modifier)) {
    const scoreKey = key as keyof typeof scores;
    scores[scoreKey] = Math.min(1, scores[scoreKey] + (value as number));
  }
}

function calculateOverallScore(scores: {
  engagement: number;
  consistency: number;
  novelty: number;
  tensionArc: number;
  hookResolution?: number;
}): number {
  const baseScore =
    scores.engagement * SCORING_WEIGHTS.engagement +
    scores.consistency * SCORING_WEIGHTS.consistency +
    scores.novelty * SCORING_WEIGHTS.novelty +
    scores.tensionArc * SCORING_WEIGHTS.tensionArc;

  if (typeof scores.hookResolution === 'number' && Number.isFinite(scores.hookResolution)) {
    return baseScore + scores.hookResolution * SCORING_WEIGHTS.hookResolution;
  }

  // 兼容旧评分结构：未提供 hookResolution 时，维持原有四维评分尺度。
  const baseWeight =
    SCORING_WEIGHTS.engagement +
    SCORING_WEIGHTS.consistency +
    SCORING_WEIGHTS.novelty +
    SCORING_WEIGHTS.tensionArc;
  return baseWeight > 0 ? baseScore / baseWeight : baseScore;
}

export async function simulatePlotForward(
  novelId: string,
  startChapter: number,
  options: PlotSimulationRunOptions = {},
  generator?: PlotGenerator
): Promise<PlotSimulationResult> {
  const {
    steps = 5,
    iterations = 100,
    branchCount = 4,
    focusHooks = true,
  } = options;

  const branches = await generatePlotBranches(
    novelId,
    startChapter,
    { branchCount, focusHooks },
    generator
  );
  const unresolvedHooks = await getUnresolvedHooks(novelId);

  const rootNode: PlotNode = {
    id: 'root',
    chapterNumber: startChapter,
    event: '当前章节',
    consequences: [],
    children: [],
    score: 0,
    visits: 0,
  };

  for (const branch of branches) {
    const childNode: PlotNode = {
      id: branch.id,
      chapterNumber: startChapter + 1,
      event: branch.description,
      consequences: branch.path,
      children: [],
      score: branch.overallScore,
      visits: 1,
    };
    rootNode.children.push(childNode);
  }

  for (let i = 0; i < iterations; i++) {
    const selectedNode = selectNodeUCB1(rootNode.children);
    if (selectedNode) {
      selectedNode.visits++;
      selectedNode.score = (selectedNode.score * (selectedNode.visits - 1) + 
        simulateRandomPlayout(selectedNode, steps)) / selectedNode.visits;
    }
  }

  const sortedBranches = [...branches].sort((a, b) => b.overallScore - a.overallScore);
  const fallbackPath: PlotBranch = {
    id: 'fallback',
    path: [],
    description: '暂无可用剧情分支，请调整推演参数后重试。',
    probability: 0,
    engagement: 0,
    consistency: 0,
    novelty: 0,
    tensionArc: 0,
    overallScore: 0,
    risks: ['当前上下文不足以给出可靠推演'],
    opportunities: ['建议先补充近章节摘要或角色素材后再推演'],
  };
  const bestPath = sortedBranches[0] ?? fallbackPath;
  const alternativePaths = sortedBranches.slice(1);

  const deadEndWarnings = detectDeadEnds(branches, unresolvedHooks);
  
  const hookOpportunities = unresolvedHooks.slice(0, 3).map(hook => ({
    hookId: hook.id,
    hookDescription: hook.description,
    suggestedResolution: `可在接下来的${steps}章内解决此伏笔`,
  }));

  return {
    rootNode,
    bestPath,
    alternativePaths,
    deadEndWarnings,
    hookOpportunities,
  };
}

function selectNodeUCB1(nodes: PlotNode[]): PlotNode | null {
  if (nodes.length === 0) return null;
  
  const totalVisits = nodes.reduce((sum, n) => sum + n.visits, 0);
  const C = 1.41;

  let bestScore = -Infinity;
  let bestNode = nodes[0];

  for (const node of nodes) {
    const exploitation = node.score;
    const exploration = C * Math.sqrt(Math.log(totalVisits + 1) / (node.visits + 1));
    const ucb1Score = exploitation + exploration;
    
    if (ucb1Score > bestScore) {
      bestScore = ucb1Score;
      bestNode = node;
    }
  }

  return bestNode;
}

function simulateRandomPlayout(node: PlotNode, depth: number): number {
  let score = node.score;
  const decay = 0.9;
  
  for (let i = 0; i < depth; i++) {
    const randomFactor = 0.3 + Math.random() * 0.4;
    score = score * decay + randomFactor * (1 - decay);
  }
  
  return score;
}

function detectDeadEnds(branches: PlotBranch[], unresolvedHooks: HookEntry[]): string[] {
  const warnings: string[] = [];

  for (const branch of branches) {
    if (branch.consistency < 0.4) {
      warnings.push(`路径"${branch.description}"可能导致情节不一致`);
    }
    if (branch.tensionArc < 0.3 && branch.engagement < 0.4) {
      warnings.push(`路径"${branch.description}"可能导致读者流失`);
    }
  }

  if (unresolvedHooks.length > 5) {
    warnings.push(`存在${unresolvedHooks.length}个未解决的伏笔，建议尽快收束部分支线`);
  }

  return warnings;
}

export async function scorePlotPath(
  path: string[],
  novelId: string,
  currentChapter: number
): Promise<{
  overallScore: number;
  breakdown: {
    engagement: number;
    consistency: number;
    novelty: number;
    tensionArc: number;
  };
  recommendations: string[];
}> {
  const context = await getHierarchicalContext(novelId, currentChapter);
  
  let engagement = 0.5;
  let consistency = 0.7;
  let novelty = 0.5;
  let tensionArc = 0.5;

  const tensionKeywords = ['危机', '决战', '对决', '冲突', '战斗'];
  const developmentKeywords = ['成长', '突破', '觉醒', '蜕变'];
  const mysteryKeywords = ['真相', '秘密', '揭示', '发现'];

  for (const step of path) {
    if (tensionKeywords.some(k => step.includes(k))) {
      tensionArc = Math.min(1, tensionArc + 0.15);
      engagement = Math.min(1, engagement + 0.1);
    }
    if (developmentKeywords.some(k => step.includes(k))) {
      engagement = Math.min(1, engagement + 0.1);
    }
    if (mysteryKeywords.some(k => step.includes(k))) {
      novelty = Math.min(1, novelty + 0.1);
      engagement = Math.min(1, engagement + 0.05);
    }
  }

  if (context.currentAct) {
    consistency = Math.min(1, consistency + 0.1);
  }

  const recommendations: string[] = [];
  if (engagement < 0.6) {
    recommendations.push('建议增加冲突或悬念元素提升参与度');
  }
  if (tensionArc < 0.5) {
    recommendations.push('建议适当升级紧张程度');
  }
  if (novelty < 0.4) {
    recommendations.push('考虑引入新元素或意外转折');
  }

  const overallScore = calculateOverallScore({ engagement, consistency, novelty, tensionArc });

  return {
    overallScore,
    breakdown: { engagement, consistency, novelty, tensionArc },
    recommendations,
  };
}

export async function getPlotSimulationStats(novelId: string): Promise<{
  totalBranchesGenerated: number;
  averageScore: number;
  topRecommendations: string[];
}> {
  const branches = await generatePlotBranches(novelId, 1, { branchCount: 5 });
  
  const avgScore = branches.reduce((sum, b) => sum + b.overallScore, 0) / branches.length;
  
  const recommendations = new Set<string>();
  for (const branch of branches) {
    branch.opportunities.forEach(o => recommendations.add(o));
  }

  return {
    totalBranchesGenerated: branches.length,
    averageScore: avgScore,
    topRecommendations: Array.from(recommendations).slice(0, 5),
  };
}
