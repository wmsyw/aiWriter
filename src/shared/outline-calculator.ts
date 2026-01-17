/**
 * Outline Parameter Calculator
 * 
 * 根据目标字数动态计算大纲各级节点数量，确保生成的大纲能够支撑目标字数。
 * 
 * 核心原则：
 * - 每章约 3000 字
 * - 每个事件节点约 3-10 万字（约 10-33 章）
 * - 每卷约 25-50 万字
 */

export interface OutlineParams {
  /** 分卷/板块数量 */
  volumeCount: number;
  /** 每卷事件节点数 */
  nodesPerVolume: number;
  /** 每个事件节点的章节数 */
  chaptersPerNode: number;
  /** 预计每卷字数 */
  expectedVolumeWords: number;
  /** 预计每个事件节点字数 */
  expectedNodeWords: number;
  /** 预计总章节数 */
  totalChapters: number;
  /** 每章目标字数 */
  wordsPerChapter: number;
}

/** 常量配置 */
const CONFIG = {
  /** 每章标准字数 */
  AVG_CHAPTER_WORDS: 3000,
  /** 每卷最佳字数（40万字，取 25w-50w 的中间偏高值） */
  OPTIMAL_VOLUME_WORDS: 400000,
  /** 每个事件节点最佳字数（4万字，约 13 章） */
  OPTIMAL_NODE_WORDS: 40000,
  /** 每卷最少事件节点数 */
  MIN_NODES_PER_VOLUME: 5,
  /** 每卷最多事件节点数 */
  MAX_NODES_PER_VOLUME: 15,
  /** 每个事件最少章节数 */
  MIN_CHAPTERS_PER_NODE: 3,
  /** 每个事件最多章节数 */
  MAX_CHAPTERS_PER_NODE: 20,
  /** 每卷最少字数 */
  MIN_VOLUME_WORDS: 200000,
  /** 每卷最多字数 */
  MAX_VOLUME_WORDS: 500000,
};

/**
 * 根据目标字数和章节数计算大纲参数
 * 
 * @param targetWordsWan 目标总字数（单位：万字）
 * @param userChapterCount 用户指定的章节数（可选）
 * @param wordsPerChapter 每章字数（默认 3000）
 * @returns 计算后的大纲参数
 * 
 * @example
 * // 200万字，600章
 * calculateOutlineParams(200, 600)
 * // 返回: { volumeCount: 5, nodesPerVolume: 10, chaptersPerNode: 12, ... }
 */
export function calculateOutlineParams(
  targetWordsWan: number,
  userChapterCount?: number | null,
  wordsPerChapter: number = CONFIG.AVG_CHAPTER_WORDS
): OutlineParams {
  // 转换为实际字数
  const totalWords = targetWordsWan * 10000;
  
  // 1. 确定总章节数
  let totalChapters = userChapterCount || 0;
  if (!totalChapters || totalChapters <= 0) {
    totalChapters = Math.ceil(totalWords / wordsPerChapter);
  }
  
  // 2. 计算分卷数（以 40w 字为一卷基准）
  let volumeCount = Math.round(totalWords / CONFIG.OPTIMAL_VOLUME_WORDS);
  if (volumeCount < 1) volumeCount = 1;
  
  // 验证每卷字数是否在合理范围
  let wordsPerVolume = totalWords / volumeCount;
  
  // 如果每卷超过最大字数，增加卷数
  while (wordsPerVolume > CONFIG.MAX_VOLUME_WORDS && volumeCount < 20) {
    volumeCount++;
    wordsPerVolume = totalWords / volumeCount;
  }
  
  // 如果每卷低于最小字数且卷数 > 1，减少卷数
  while (wordsPerVolume < CONFIG.MIN_VOLUME_WORDS && volumeCount > 1) {
    volumeCount--;
    wordsPerVolume = totalWords / volumeCount;
  }
  
  // 3. 计算每卷细纲节点数（以 4w 字为一个事件基准）
  let nodesPerVolume = Math.round(wordsPerVolume / CONFIG.OPTIMAL_NODE_WORDS);
  
  // 强制约束范围
  nodesPerVolume = Math.max(
    CONFIG.MIN_NODES_PER_VOLUME,
    Math.min(CONFIG.MAX_NODES_PER_VOLUME, nodesPerVolume)
  );
  
  // 4. 计算每个节点下的章节数 (使用 round 避免累积误差导致字数丢失)
  let chaptersPerNode = Math.round(totalChapters / (volumeCount * nodesPerVolume));
  
  // 强制约束范围
  chaptersPerNode = Math.max(
    CONFIG.MIN_CHAPTERS_PER_NODE,
    Math.min(CONFIG.MAX_CHAPTERS_PER_NODE, chaptersPerNode)
  );
  
  // 重新计算预期字数
  const expectedVolumeWords = Math.floor(wordsPerVolume);
  const expectedNodeWords = Math.floor(wordsPerVolume / nodesPerVolume);
  
  // 返回基于整数约束的实际总章节数，而非用户输入值
  const effectiveTotalChapters = volumeCount * nodesPerVolume * chaptersPerNode;
  
  return {
    volumeCount,
    nodesPerVolume,
    chaptersPerNode,
    expectedVolumeWords,
    expectedNodeWords,
    totalChapters: effectiveTotalChapters,
    wordsPerChapter,
  };
}

/**
 * 参数推荐表（预计算的常用配置）
 * 
 * 用于 UI 显示参考或快速查找
 */
export const OUTLINE_PRESETS: Record<string, OutlineParams & { label: string }> = {
  '50w': {
    label: '50万字短篇',
    volumeCount: 2,
    nodesPerVolume: 6,
    chaptersPerNode: 14,
    expectedVolumeWords: 250000,
    expectedNodeWords: 41666,
    totalChapters: 168,
    wordsPerChapter: 3000,
  },
  '100w': {
    label: '100万字中篇',
    volumeCount: 3,
    nodesPerVolume: 8,
    chaptersPerNode: 14,
    expectedVolumeWords: 333333,
    expectedNodeWords: 41666,
    totalChapters: 336,
    wordsPerChapter: 3000,
  },
  '200w': {
    label: '200万字长篇',
    volumeCount: 5,
    nodesPerVolume: 10,
    chaptersPerNode: 13,
    expectedVolumeWords: 400000,
    expectedNodeWords: 40000,
    totalChapters: 650,
    wordsPerChapter: 3000,
  },
  '300w': {
    label: '300万字史诗',
    volumeCount: 8,
    nodesPerVolume: 10,
    chaptersPerNode: 12,
    expectedVolumeWords: 375000,
    expectedNodeWords: 37500,
    totalChapters: 960,
    wordsPerChapter: 3000,
  },
  '500w': {
    label: '500万字超长篇',
    volumeCount: 12,
    nodesPerVolume: 12,
    chaptersPerNode: 12,
    expectedVolumeWords: 416666,
    expectedNodeWords: 34722,
    totalChapters: 1728,
    wordsPerChapter: 3000,
  },
};

/**
 * 根据目标字数获取最接近的预设配置
 */
export function getClosestPreset(targetWordsWan: number): OutlineParams & { label: string } {
  const presetKeys = Object.keys(OUTLINE_PRESETS);
  const targetValues = presetKeys.map(k => parseInt(k.replace('w', '')));
  
  // 找到最接近的预设
  let closestKey = presetKeys[0];
  let minDiff = Math.abs(targetWordsWan - targetValues[0]);
  
  for (let i = 1; i < presetKeys.length; i++) {
    const diff = Math.abs(targetWordsWan - targetValues[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestKey = presetKeys[i];
    }
  }
  
  return OUTLINE_PRESETS[closestKey];
}

/**
 * 格式化大纲参数为人类可读的摘要
 */
export function formatOutlineParamsSummary(params: OutlineParams): string {
  const totalNodes = params.volumeCount * params.nodesPerVolume;
  const estimatedTotalChapters = totalNodes * params.chaptersPerNode;
  const estimatedTotalWords = estimatedTotalChapters * params.wordsPerChapter;
  
  return `
📚 分卷规划：${params.volumeCount} 卷（每卷约 ${Math.round(params.expectedVolumeWords / 10000)} 万字）
📋 细纲规划：每卷 ${params.nodesPerVolume} 个事件节点（共 ${totalNodes} 个）
📝 章节规划：每个事件 ${params.chaptersPerNode} 章（共约 ${estimatedTotalChapters} 章）
📊 预计字数：约 ${Math.round(estimatedTotalWords / 10000)} 万字
`.trim();
}
