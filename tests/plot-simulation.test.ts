import { describe, expect, it } from 'vitest';
import {
  buildPlotSimulationRequest,
  getDefaultPlotSimulationControls,
  normalizePlotSimulationControls,
  normalizePlotSimulationPayload,
} from '@/src/shared/plot-simulation';

describe('plot simulation shared helpers', () => {
  it('normalizes controls and request payload', () => {
    const defaults = getDefaultPlotSimulationControls();
    expect(defaults.steps).toBeGreaterThan(0);

    const normalized = normalizePlotSimulationControls({
      steps: 99,
      iterations: 5,
      branchCount: 9,
      focusHooks: false,
    });

    expect(normalized.steps).toBe(10);
    expect(normalized.iterations).toBe(20);
    expect(normalized.branchCount).toBe(5);
    expect(normalized.focusHooks).toBe(false);

    const request = buildPlotSimulationRequest(12.8, normalized);
    expect(request.currentChapter).toBe(13);
    expect(request.action).toBe('simulate');
  });

  it('normalizes simulate response to branch list', () => {
    const normalized = normalizePlotSimulationPayload({
      bestPath: {
        id: 'best',
        description: '主线推进',
        path: ['第11章：冲突爆发'],
        engagement: 0.83,
        consistency: 0.81,
        novelty: 0.72,
        tensionArc: 0.79,
        overallScore: 0.8,
      },
      alternativePaths: [
        {
          id: 'alt',
          description: '支线反转',
          path: ['第11章：反派设局'],
          engagement: 78,
          consistency: 65,
          novelty: 82,
          tensionArc: 76,
          overallScore: 74,
        },
      ],
      deadEndWarnings: ['支线过多可能拖慢节奏'],
      hookOpportunities: [
        {
          hookId: 'h-1',
          hookDescription: '神秘玉佩来源',
          suggestedResolution: '两章内揭示其与主角身世关联',
        },
      ],
    });

    expect(normalized.branches).toHaveLength(2);
    expect(normalized.bestPathId).toBe('best');
    expect(normalized.branches[1]?.overallScore).toBeCloseTo(0.74, 2);
    expect(normalized.deadEndWarnings).toContain('支线过多可能拖慢节奏');
    expect(normalized.hookOpportunities[0]?.hookId).toBe('h-1');
  });
});
