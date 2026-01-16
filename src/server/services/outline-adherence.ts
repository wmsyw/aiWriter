import { DEFAULT_WORKFLOW_CONFIG } from '../../constants/workflow';

export interface OutlineAdherenceResult {
  score: number;
  verdict: 'approved' | 'minor_deviation' | 'major_deviation' | 'rejected';
  deviations: OutlineDeviation[];
  suggestions: string[];
}

export interface OutlineDeviation {
  type: 'missing_event' | 'added_event' | 'character_deviation' | 'plot_change' | 'tone_shift';
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  expectedFromOutline?: string;
  foundInChapter?: string;
}

export interface OutlineComparisonInput {
  chapterOutline: string;
  chapterContent: string;
  novelOutline?: string;
  previousChapterSummary?: string;
}

export function calculateAdherenceVerdict(
  score: number,
  config = DEFAULT_WORKFLOW_CONFIG.outlineAdherence
): 'approved' | 'minor_deviation' | 'major_deviation' | 'rejected' {
  const deviationAmount = 1 - score;
  
  if (deviationAmount <= config.minorDeviationThreshold) {
    return 'approved';
  }
  
  if (deviationAmount <= config.majorDeviationThreshold) {
    return deviationAmount <= (config.minorDeviationThreshold + config.majorDeviationThreshold) / 2
      ? 'minor_deviation'
      : 'major_deviation';
  }
  
  if (config.autoRejectOnMajor) {
    return 'rejected';
  }
  
  return 'major_deviation';
}

export function buildAdherenceCheckPrompt(input: OutlineComparisonInput): string {
  const parts: string[] = [];
  
  parts.push('Analyze the adherence of the generated chapter content to the planned outline.');
  parts.push('');
  parts.push('## Chapter Outline (Expected)');
  parts.push(input.chapterOutline);
  parts.push('');
  parts.push('## Generated Chapter Content');
  parts.push(input.chapterContent);
  
  if (input.novelOutline) {
    parts.push('');
    parts.push('## Overall Novel Outline (Context)');
    parts.push(input.novelOutline);
  }
  
  if (input.previousChapterSummary) {
    parts.push('');
    parts.push('## Previous Chapter Summary');
    parts.push(input.previousChapterSummary);
  }
  
  parts.push('');
  parts.push('## Analysis Required');
  parts.push('1. Calculate an adherence score (0.0 to 1.0) where 1.0 means perfect adherence');
  parts.push('2. List any deviations found (type, severity, description)');
  parts.push('3. Provide suggestions for improvement if needed');
  parts.push('');
  parts.push('Deviation types:');
  parts.push('- missing_event: A planned event/scene did not appear');
  parts.push('- added_event: An unplanned significant event was added');
  parts.push('- character_deviation: Character behaved inconsistently with outline');
  parts.push('- plot_change: Major plot progression differs from plan');
  parts.push('- tone_shift: Emotional tone differs significantly from intended');
  parts.push('');
  parts.push('Respond in JSON format:');
  parts.push('```json');
  parts.push('{');
  parts.push('  "score": 0.85,');
  parts.push('  "deviations": [');
  parts.push('    {');
  parts.push('      "type": "missing_event",');
  parts.push('      "severity": "minor",');
  parts.push('      "description": "...",');
  parts.push('      "expectedFromOutline": "...",');
  parts.push('      "foundInChapter": null');
  parts.push('    }');
  parts.push('  ],');
  parts.push('  "suggestions": ["..."]');
  parts.push('}');
  parts.push('```');
  
  return parts.join('\n');
}

export function parseAdherenceResponse(responseText: string): OutlineAdherenceResult {
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  
  let parsed: { score: number; deviations: OutlineDeviation[]; suggestions: string[] };
  
  if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[1]);
  } else {
    const directMatch = responseText.match(/\{[\s\S]*\}/);
    if (directMatch) {
      parsed = JSON.parse(directMatch[0]);
    } else {
      throw new Error('Could not parse adherence response as JSON');
    }
  }
  
  const score = Math.max(0, Math.min(1, parsed.score || 0));
  const verdict = calculateAdherenceVerdict(score);
  
  return {
    score,
    verdict,
    deviations: parsed.deviations || [],
    suggestions: parsed.suggestions || [],
  };
}

export function formatAdherenceResultForReview(result: OutlineAdherenceResult): string {
  const lines: string[] = [];
  
  const scorePercent = Math.round(result.score * 100);
  lines.push(`## Outline Adherence: ${scorePercent}%`);
  lines.push(`**Verdict**: ${result.verdict.replace('_', ' ').toUpperCase()}`);
  
  if (result.deviations.length > 0) {
    lines.push('');
    lines.push('### Deviations Found');
    
    for (const dev of result.deviations) {
      const severityIcon = dev.severity === 'major' ? '🔴' : dev.severity === 'moderate' ? '🟡' : '🟢';
      lines.push(`- ${severityIcon} **${dev.type}** (${dev.severity}): ${dev.description}`);
      if (dev.expectedFromOutline) {
        lines.push(`  - Expected: ${dev.expectedFromOutline}`);
      }
      if (dev.foundInChapter) {
        lines.push(`  - Found: ${dev.foundInChapter}`);
      }
    }
  }
  
  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push('### Suggestions');
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }
  
  return lines.join('\n');
}

export function shouldBlockChapter(result: OutlineAdherenceResult): boolean {
  return result.verdict === 'rejected';
}

export function countDeviationsBySeverity(deviations: OutlineDeviation[]): Record<string, number> {
  const counts = { minor: 0, moderate: 0, major: 0 };
  
  for (const dev of deviations) {
    counts[dev.severity] = (counts[dev.severity] || 0) + 1;
  }
  
  return counts;
}

export function aggregateAdherenceScores(scores: number[]): number {
  if (scores.length === 0) return 1.0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
