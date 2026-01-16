import type { SlopCleanerConfig, SlopCleanerResult, SlopPattern } from '../../schemas/slop-cleaner';

const DEFAULT_CHINESE_SLOP_PATTERNS: SlopPattern[] = [
  { pattern: /^然而[，,]/gm, replacement: '', description: '"然而" at sentence start' },
  { pattern: /^但是[，,]/gm, replacement: '', description: '"但是" at sentence start' },
  { pattern: /^不过[，,]/gm, replacement: '', description: '"不过" at sentence start' },
  { pattern: /与其说(.+?)不如说/g, replacement: '$1更像是', description: '"与其说...不如说" pattern' },
  { pattern: /总之[，,]/g, replacement: '', description: '"总之" filler' },
  { pattern: /不禁/g, replacement: '', description: 'Overused "不禁"' },
  { pattern: /毫无疑问[，,]?/g, replacement: '', description: '"毫无疑问" filler' },
  { pattern: /众所周知[，,]?/g, replacement: '', description: '"众所周知" filler' },
  { pattern: /值得一提的是[，,]?/g, replacement: '', description: '"值得一提的是" filler' },
  { pattern: /不得不说[，,]?/g, replacement: '', description: '"不得不说" filler' },
  { pattern: /说实话[，,]?/g, replacement: '', description: '"说实话" filler' },
  { pattern: /事实上[，,]?/g, replacement: '', description: '"事实上" at sentence start' },
  { pattern: /显而易见[，,]?/g, replacement: '', description: '"显而易见" filler' },
  { pattern: /毋庸置疑[，,]?/g, replacement: '', description: '"毋庸置疑" filler' },
  { pattern: /一时间[，,]/g, replacement: '', description: 'Overused "一时间"' },
  { pattern: /刹那间[，,]/g, replacement: '瞬间，', description: 'Vary "刹那间"' },
  { pattern: /霎时间[，,]/g, replacement: '', description: 'Overused "霎时间"' },
  { pattern: /只见/g, replacement: '', description: 'Overused "只见"' },
  { pattern: /只听/g, replacement: '', description: 'Overused "只听"' },
  { pattern: /([他她它])的眼中闪过一丝/g, replacement: '$1眼中掠过', description: 'Cliche eye description' },
  { pattern: /嘴角微微上扬/g, replacement: '微微一笑', description: 'Cliche smile' },
  { pattern: /眉头微皱/g, replacement: '皱眉', description: 'Simplify frown' },
  { pattern: /深吸一口气/g, replacement: '吸了口气', description: 'Simplify breathing' },
  { pattern: /心中暗道/g, replacement: '暗想', description: 'Simplify inner thought' },
  { pattern: /脸上露出(.+?)的神色/g, replacement: '神色$1', description: 'Simplify expression' },
  { pattern: /(\S)(\1{3,})/g, replacement: '$1$1$1', description: 'Limit repeated chars to 3' },
];

const REPETITION_PATTERNS: SlopPattern[] = [
  { pattern: /([。！？])(\s*)\1/g, replacement: '$1', description: 'Remove duplicate punctuation' },
  { pattern: /\n{3,}/g, replacement: '\n\n', description: 'Limit consecutive newlines' },
  { pattern: /[ 　]{2,}/g, replacement: ' ', description: 'Limit consecutive spaces' },
];

const STRUCTURAL_PATTERNS: SlopPattern[] = [
  { pattern: /^第.{1,3}章\s*/gm, replacement: '', description: 'Remove chapter headers in content' },
  { pattern: /^\s*[—\-]{3,}\s*$/gm, replacement: '', description: 'Remove divider lines' },
];

export function cleanSlop(
  content: string,
  config: Partial<SlopCleanerConfig> = {}
): SlopCleanerResult {
  const {
    enableChineseSlop = true,
    enableRepetition = true,
    enableStructural = false,
    customPatterns = [],
    preserveOriginal = false,
  } = config;

  let cleaned = content;
  const appliedFixes: Array<{ pattern: string; count: number }> = [];

  const applyPatterns = (patterns: SlopPattern[]) => {
    for (const { pattern, replacement, description } of patterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
      const matches = cleaned.match(regex);
      if (matches && matches.length > 0) {
        cleaned = cleaned.replace(regex, replacement);
        appliedFixes.push({ pattern: description, count: matches.length });
      }
    }
  };

  if (enableChineseSlop) {
    applyPatterns(DEFAULT_CHINESE_SLOP_PATTERNS);
  }

  if (enableRepetition) {
    applyPatterns(REPETITION_PATTERNS);
  }

  if (enableStructural) {
    applyPatterns(STRUCTURAL_PATTERNS);
  }

  if (customPatterns.length > 0) {
    applyPatterns(customPatterns);
  }

  cleaned = cleaned.replace(/^\s+/gm, '').replace(/\s+$/gm, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  const originalLength = content.length;
  const cleanedLength = cleaned.length;
  const reductionPercent = originalLength > 0 
    ? ((originalLength - cleanedLength) / originalLength) * 100 
    : 0;

  return {
    original: preserveOriginal ? content : undefined,
    cleaned,
    stats: {
      originalLength,
      cleanedLength,
      reductionPercent: Math.round(reductionPercent * 100) / 100,
      fixesApplied: appliedFixes,
    },
  };
}

export function detectSlopLevel(content: string): {
  level: 'low' | 'medium' | 'high';
  score: number;
  details: string[];
} {
  const details: string[] = [];
  let score = 0;

  for (const { pattern, description } of DEFAULT_CHINESE_SLOP_PATTERNS) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
    const matches = content.match(regex);
    if (matches) {
      const count = matches.length;
      const density = count / (content.length / 1000);
      if (density > 2) {
        score += 3;
        details.push(`High density of "${description}": ${count} occurrences`);
      } else if (density > 1) {
        score += 1;
        details.push(`Moderate "${description}": ${count} occurrences`);
      }
    }
  }

  const sentenceStarters = content.match(/[。！？\n]([^。！？\n]{0,10})/g) || [];
  const starterCounts: Record<string, number> = {};
  for (const starter of sentenceStarters) {
    const clean = starter.slice(1).trim().slice(0, 4);
    if (clean.length >= 2) {
      starterCounts[clean] = (starterCounts[clean] || 0) + 1;
    }
  }

  for (const [starter, count] of Object.entries(starterCounts)) {
    if (count > 5) {
      score += 2;
      details.push(`Repeated sentence starter "${starter}": ${count} times`);
    }
  }

  let level: 'low' | 'medium' | 'high';
  if (score <= 3) {
    level = 'low';
  } else if (score <= 8) {
    level = 'medium';
  } else {
    level = 'high';
  }

  return { level, score, details };
}

export function suggestVariations(phrase: string): string[] {
  const variations: Record<string, string[]> = {
    '然而': ['可是', '但', '不过', '只是'],
    '但是': ['可', '然而', '不过', '却'],
    '不禁': ['忍不住', '情不自禁', ''],
    '一时间': ['顿时', '霎时', '瞬间', ''],
    '深吸一口气': ['吸了口气', '长舒一口气', '屏住呼吸'],
    '心中暗道': ['暗想', '心道', '想着'],
    '眉头微皱': ['皱眉', '蹙眉', '眉头一蹙'],
  };

  return variations[phrase] || [];
}
