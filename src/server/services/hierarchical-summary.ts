import { prisma } from '../db';

export interface SceneInfo {
  sceneNumber: number;
  startParagraph: number;
  endParagraph: number;
  location?: string;
  characters: string[];
  tension: 'low' | 'medium' | 'high' | 'climax';
  summary: string;
  emotionalBeat?: string;
}

export interface ActBoundary {
  actNumber: number;
  startChapter: number;
  endChapter: number;
  title?: string;
  majorShift: string;
  confidence: number;
}

export interface HierarchicalContext {
  currentChapter: {
    scenes: SceneInfo[];
    summary: string;
  };
  recentChapters: Array<{
    number: number;
    oneLine: string;
    keyEvents: string[];
  }>;
  currentAct: {
    actNumber: number;
    title?: string;
    summary: string;
    majorEvents: string[];
    unresolvedHooks: string[];
  } | null;
  previousActs: Array<{
    actNumber: number;
    title?: string;
    oneLine: string;
  }>;
}

export async function breakChapterIntoScenes(
  content: string,
  existingCharacters: string[] = []
): Promise<SceneInfo[]> {
  // Normalize line endings and split
  const paragraphs = content.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length === 0) return [];

  const scenes: SceneInfo[] = [];
  let currentScene: Partial<SceneInfo> = {
    sceneNumber: 1,
    startParagraph: 0,
    characters: [],
    tension: 'medium',
    summary: '',
  };

  const sceneBreakPatterns = [
    /^[\s]*[一二三四五六七八九十百千万]+[、.．]/,
    /^[\s]*第[一二三四五六七八九十百千万\d]+[节幕章]/,
    /^[\s]*\*{3,}/,
    /^[\s]*-{3,}/,
    /^[\s]*[○◎●◇◆□■△▲]/,
    /时间[：:]/i,
    /地点[：:]/i,
    /[\d一二三四五六七八九十]+[年月日]后/,
    /翌日|次日|第二天|隔天|数日后|几天后/,
  ];

  const tensionIndicators = {
    high: [
      /[！]{2,}/, /[？！]{2,}/, /杀|死|血|战|斗|攻|击|逃|追/,
      /危险|紧急|绝望|恐惧|愤怒|暴怒/, /生死|存亡|决战|对决/,
    ],
    climax: [
      /最终|终于|决定性|关键时刻|生死存亡/,
      /胜利|失败|真相|揭露|觉醒|突破/,
    ],
    low: [
      /平静|安宁|休息|睡眠|思考|回忆|日常/,
      /微笑|轻声|缓缓|悠闲|慢慢/,
    ],
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const isSceneBreak = sceneBreakPatterns.some(p => p.test(paragraph));

    if (isSceneBreak && i > 0) {
      currentScene.endParagraph = i - 1;
      currentScene.summary = summarizeParagraphs(
        paragraphs.slice(currentScene.startParagraph!, i)
      );
      currentScene.characters = extractCharactersFromText(
        paragraphs.slice(currentScene.startParagraph!, i).join('\n'),
        existingCharacters
      );
      scenes.push(currentScene as SceneInfo);

      currentScene = {
        sceneNumber: scenes.length + 1,
        startParagraph: i,
        characters: [],
        tension: 'medium',
        summary: '',
      };
    }

    const tension = detectTension(paragraph, tensionIndicators);
    if (compareTension(tension, currentScene.tension!) > 0) {
      currentScene.tension = tension;
    }
  }

  currentScene.endParagraph = paragraphs.length - 1;
  currentScene.summary = summarizeParagraphs(
    paragraphs.slice(currentScene.startParagraph!)
  );
  currentScene.characters = extractCharactersFromText(
    paragraphs.slice(currentScene.startParagraph!).join('\n'),
    existingCharacters
  );
  scenes.push(currentScene as SceneInfo);

  return scenes;
}

function summarizeParagraphs(paragraphs: string[]): string {
  const combined = paragraphs.join(' ').slice(0, 1000);
  // Try to find the first meaningful sentence or chunk
  const match = combined.match(/^[^。！？]+[。！？]/);
  return match ? match[0].trim() : combined.slice(0, 150).trim() + '...';
}

function extractCharactersFromText(text: string, knownCharacters: string[]): string[] {
  const found: string[] = [];
  for (const name of knownCharacters) {
    if (text.includes(name) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

function detectTension(
  text: string,
  indicators: Record<string, RegExp[]>
): 'low' | 'medium' | 'high' | 'climax' {
  for (const pattern of indicators.climax) {
    if (pattern.test(text)) return 'climax';
  }
  for (const pattern of indicators.high) {
    if (pattern.test(text)) return 'high';
  }
  for (const pattern of indicators.low) {
    if (pattern.test(text)) return 'low';
  }
  return 'medium';
}

function compareTension(a: 'low' | 'medium' | 'high' | 'climax', b: string): number {
  const order = { low: 1, medium: 2, high: 3, climax: 4 };
  return order[a] - (order[b as keyof typeof order] || 2);
}

export async function detectActBoundaries(novelId: string): Promise<ActBoundary[]> {
  const summaries = await prisma.chapterSummary.findMany({
    where: { novelId },
    orderBy: { chapterNumber: 'asc' },
    select: {
      chapterNumber: true,
      oneLine: true,
      keyEvents: true,
      plotAdvancement: true,
      emotionalArc: true,
    },
  });

  if (summaries.length < 5) return [];

  const boundaries: ActBoundary[] = [];
  const actShiftIndicators = [
    /新[的]?篇章|新[的]?阶段|转折点/,
    /离开|前往|进入|抵达/,
    /时间流逝|[数几]年后|多年/,
    /大战结束|战争爆发|危机解除/,
    /真相大白|秘密揭露|身份暴露/,
    /突破|觉醒|进化|升级/,
  ];

  let currentActStart = 1;
  let actNumber = 1;

  for (let i = 1; i < summaries.length; i++) {
    const curr = summaries[i];
    const prev = summaries[i - 1];

    let shiftScore = 0;
    let shiftReason = '';

    const combined = `${curr.oneLine} ${curr.plotAdvancement || ''} ${JSON.stringify(curr.keyEvents)}`;
    for (const pattern of actShiftIndicators) {
      if (pattern.test(combined)) {
        shiftScore += 0.3;
        shiftReason = combined.match(pattern)?.[0] || '';
      }
    }

    if (curr.emotionalArc !== prev.emotionalArc && curr.emotionalArc) {
      shiftScore += 0.2;
    }

    const chaptersInCurrentAct = curr.chapterNumber - currentActStart;
    if (chaptersInCurrentAct >= 15) {
      shiftScore += 0.2;
    }

    if (shiftScore >= 0.4) {
      if (boundaries.length > 0) {
        boundaries[boundaries.length - 1].endChapter = curr.chapterNumber - 1;
      }

      boundaries.push({
        actNumber,
        startChapter: currentActStart,
        endChapter: curr.chapterNumber - 1,
        majorShift: shiftReason || 'Major plot shift detected',
        confidence: Math.min(shiftScore, 1),
      });

      actNumber++;
      currentActStart = curr.chapterNumber;
    }
  }

  boundaries.push({
    actNumber,
    startChapter: currentActStart,
    endChapter: summaries[summaries.length - 1].chapterNumber,
    majorShift: 'Current act',
    confidence: 1,
  });

  return boundaries;
}

export async function generateActSummary(
  novelId: string,
  actNumber: number,
  startChapter: number,
  endChapter: number
): Promise<string> {
  const summaries = await prisma.chapterSummary.findMany({
    where: {
      novelId,
      chapterNumber: { gte: startChapter, lte: endChapter },
    },
    orderBy: { chapterNumber: 'asc' },
  });

  if (summaries.length === 0) {
    return '';
  }

  const majorEvents: string[] = [];
  const characterDevelopments: Set<string> = new Set();
  let plotProgression = '';

  for (const summary of summaries) {
    const events = summary.keyEvents as string[] || [];
    majorEvents.push(...events.slice(0, 2));

    const devs = summary.characterDevelopments as string[] || [];
    devs.forEach(d => characterDevelopments.add(d));

    if (summary.plotAdvancement) {
      plotProgression += `第${summary.chapterNumber}章: ${summary.plotAdvancement}\n`;
    }
  }

  const hooks = await prisma.narrativeHook.findMany({
    where: {
      novelId,
      plantedInChapter: { gte: startChapter, lte: endChapter },
    },
  }) as Array<{ status: string; description: string }>;

  const unresolvedHooks = hooks
    .filter((h: { status: string }) => h.status !== 'resolved' && h.status !== 'abandoned')
    .map((h: { description: string }) => h.description);

  const resolvedHooks = hooks
    .filter((h: { status: string }) => h.status === 'resolved')
    .map((h: { description: string }) => h.description);

  const oneLineSummaries = summaries.map((s: { oneLine: string }) => s.oneLine).join(' ');
  const oneLine = oneLineSummaries.slice(0, 200) + (oneLineSummaries.length > 200 ? '...' : '');

  const actSummary = await prisma.actSummary.upsert({
    where: { novelId_actNumber: { novelId, actNumber } },
    create: {
      novelId,
      actNumber,
      chapterRange: { start: startChapter, end: endChapter },
      oneLine,
      majorEvents: majorEvents.slice(0, 10),
      characterArcs: Array.from(characterDevelopments).slice(0, 10),
      plotProgression,
      unresolvedHooks: unresolvedHooks.slice(0, 5),
      resolvedHooks: resolvedHooks.slice(0, 5),
    },
    update: {
      chapterRange: { start: startChapter, end: endChapter },
      oneLine,
      majorEvents: majorEvents.slice(0, 10),
      characterArcs: Array.from(characterDevelopments).slice(0, 10),
      plotProgression,
      unresolvedHooks: unresolvedHooks.slice(0, 5),
      resolvedHooks: resolvedHooks.slice(0, 5),
    },
  });

  await prisma.chapterSummary.updateMany({
    where: {
      novelId,
      chapterNumber: { gte: startChapter, lte: endChapter },
    },
    data: {
      actNumber,
      actSummaryId: actSummary.id,
    },
  });

  return actSummary.id;
}

export async function getHierarchicalContext(
  novelId: string,
  currentChapter: number,
  options: {
    recentChapterCount?: number;
    includeScenes?: boolean;
  } = {}
): Promise<HierarchicalContext> {
  const { recentChapterCount = 5, includeScenes = true } = options;

  const currentSummary = await prisma.chapterSummary.findFirst({
    where: { novelId, chapterNumber: currentChapter },
  });

  let currentChapterContext: HierarchicalContext['currentChapter'] = {
    scenes: [],
    summary: currentSummary?.oneLine || '',
  };

  if (includeScenes && currentSummary?.sceneBreakdown) {
    currentChapterContext.scenes = currentSummary.sceneBreakdown as unknown as SceneInfo[];
  }

  const recentSummaries = await prisma.chapterSummary.findMany({
    where: {
      novelId,
      chapterNumber: {
        gte: Math.max(1, currentChapter - recentChapterCount),
        lt: currentChapter,
      },
    },
    orderBy: { chapterNumber: 'desc' },
    take: recentChapterCount,
  });

  type SummaryRecord = { chapterNumber: number; oneLine: string; keyEvents: unknown };
  const recentChapters = recentSummaries.map((s: SummaryRecord) => ({
    number: s.chapterNumber,
    oneLine: s.oneLine,
    keyEvents: (s.keyEvents as string[]) || [],
  }));

  let currentAct: HierarchicalContext['currentAct'] = null;
  if (currentSummary?.actSummaryId) {
    const actSummary = await prisma.actSummary.findUnique({
      where: { id: currentSummary.actSummaryId },
    });
    if (actSummary) {
      currentAct = {
        actNumber: actSummary.actNumber,
        title: actSummary.title || undefined,
        summary: actSummary.oneLine,
        majorEvents: (actSummary.majorEvents as string[]) || [],
        unresolvedHooks: (actSummary.unresolvedHooks as string[]) || [],
      };
    }
  }

  const previousActs = await prisma.actSummary.findMany({
    where: {
      novelId,
      actNumber: { lt: currentAct?.actNumber || 999 },
    },
    orderBy: { actNumber: 'desc' },
    take: 3,
  });

  type ActRecord = { actNumber: number; title: string | null; oneLine: string };
  return {
    currentChapter: currentChapterContext,
    recentChapters,
    currentAct,
    previousActs: previousActs.map((a: ActRecord) => ({
      actNumber: a.actNumber,
      title: a.title || undefined,
      oneLine: a.oneLine,
    })),
  };
}

export function formatHierarchicalContextForPrompt(context: HierarchicalContext): string {
  const lines: string[] = [];

  if (context.previousActs.length > 0) {
    lines.push('## 前情回顾 (按幕)');
    for (const act of context.previousActs.reverse()) {
      lines.push(`**第${act.actNumber}幕${act.title ? ` - ${act.title}` : ''}**: ${act.oneLine}`);
    }
    lines.push('');
  }

  if (context.currentAct) {
    lines.push('## 当前幕概况');
    lines.push(`**第${context.currentAct.actNumber}幕${context.currentAct.title ? ` - ${context.currentAct.title}` : ''}**`);
    lines.push(context.currentAct.summary);
    if (context.currentAct.unresolvedHooks.length > 0) {
      lines.push(`待解决伏笔: ${context.currentAct.unresolvedHooks.join('、')}`);
    }
    lines.push('');
  }

  if (context.recentChapters.length > 0) {
    lines.push('## 近期章节');
    for (const chapter of context.recentChapters.reverse()) {
      const eventsStr = chapter.keyEvents.length > 0 
        ? ` [${chapter.keyEvents.slice(0, 2).join(', ')}]` 
        : '';
      lines.push(`第${chapter.number}章: ${chapter.oneLine}${eventsStr}`);
    }
    lines.push('');
  }

  if (context.currentChapter.scenes.length > 0) {
    lines.push('## 本章场景分解');
    for (const scene of context.currentChapter.scenes) {
      const chars = scene.characters.length > 0 ? ` (${scene.characters.join(', ')})` : '';
      lines.push(`场景${scene.sceneNumber}${chars}: ${scene.summary}`);
    }
  }

  return lines.join('\n');
}

export async function syncActSummaries(novelId: string): Promise<number> {
  const boundaries = await detectActBoundaries(novelId);
  
  for (const boundary of boundaries) {
    await generateActSummary(
      novelId,
      boundary.actNumber,
      boundary.startChapter,
      boundary.endChapter
    );
  }

  return boundaries.length;
}
