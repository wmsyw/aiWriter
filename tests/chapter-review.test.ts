import { describe, expect, it } from 'vitest';
import {
  buildDefaultSuggestionSelection,
  buildHighPrioritySuggestionSelection,
  buildReviewSuggestionKey,
  formatReviewTimestamp,
  isReviewStale,
  normalizeChapterReviewData,
  normalizeConsistencyCheckData,
  parseChapterReviewState,
  pickSelectedSuggestions,
} from '@/src/shared/chapter-review';

describe('chapter review shared helpers', () => {
  it('parses review payload with feedback', () => {
    const parsed = parseChapterReviewState({
      hasReview: true,
      feedback: { score: 8.2, summary: '整体不错' },
      pendingReview: true,
      lastReviewAt: '2026-02-14T08:00:00.000Z',
      approvedAt: null,
    });

    expect(parsed.hasReview).toBe(true);
    expect(parsed.pendingReview).toBe(true);
    expect(parsed.lastReviewAt).toBe('2026-02-14T08:00:00.000Z');
    expect(parsed.feedback).toEqual({ score: 8.2, summary: '整体不错' });
  });

  it('falls back to empty state on invalid payload', () => {
    const parsed = parseChapterReviewState('invalid');

    expect(parsed).toEqual({
      hasReview: false,
      feedback: null,
      pendingReview: false,
      lastReviewAt: null,
      approvedAt: null,
    });
  });

  it('builds and filters suggestion selections', () => {
    const suggestions = [
      { aspect: '情节', priority: 'high', issue: '冲突弱', suggestion: '提高冲突强度' },
      { aspect: '描写', priority: 'low', issue: '细节少', suggestion: '补充环境细节' },
      { aspect: '对白', priority: 'medium', issue: '语气平', suggestion: '' },
    ];

    const allKeys = buildDefaultSuggestionSelection(suggestions);
    const highKeys = buildHighPrioritySuggestionSelection(suggestions);

    expect(allKeys).toHaveLength(2);
    expect(highKeys).toHaveLength(1);

    const selected = pickSelectedSuggestions(suggestions, highKeys);
    expect(selected).toEqual([suggestions[0]]);
    expect(buildReviewSuggestionKey(suggestions[0], 0)).toContain('0:');
  });

  it('formats review timestamps and determines staleness', () => {
    const reviewAt = '2026-02-14T08:00:00.000Z';
    const chapterAt = '2026-02-14T09:00:00.000Z';

    expect(formatReviewTimestamp(reviewAt)).not.toBe('—');
    expect(formatReviewTimestamp('invalid')).toBe('—');
    expect(isReviewStale(chapterAt, reviewAt)).toBe(true);
    expect(isReviewStale(reviewAt, chapterAt)).toBe(false);
  });

  it('normalizes review data into dimensions, highlights and suggestions', () => {
    const normalized = normalizeChapterReviewData(
      {
        overall_score: 7.8,
        categories: {
          opening_hook: { score: 8, comment: '开篇抓人' },
          pacing: { score: 7.5, comment: '中段略慢' },
        },
        highlights: ['冲突推进明确', '角色动机清晰'],
        issues: [
          {
            severity: 'major',
            description: '中段信息密度偏低',
            suggestion: '增加对抗与目标冲突',
          },
        ],
        revision_priority: ['优先补强中段冲突'],
        summary: '总体质量较稳，建议加强中段张力。',
      },
      {
        opening_hook: '开篇钩子',
        pacing: '节奏控制',
      }
    );

    expect(normalized.avgScore).toBeGreaterThan(7);
    expect(normalized.dimensions).toHaveLength(2);
    expect(normalized.dimensions[0]?.label).toBe('开篇钩子');
    expect(normalized.highlights).toContain('冲突推进明确');
    expect(normalized.suggestions[0]?.priority).toBe('high');
    expect(normalized.revisionPriority).toContain('优先补强中段冲突');
  });

  it('supports 5-dim score payload and scales 0-1 dimensions to 10-point', () => {
    const normalized = normalizeChapterReviewData(
      {
        overallScore: 8.1,
        dimensions: {
          standaloneQuality: { score: 8.2 },
          outlineAdherence: { score: 0.86 },
          hookManagement: { score: 7.4, strengths: ['伏笔回收节奏合理'] },
        },
        detailed_feedback: '整体结构稳定，后续可提高爆点密度。',
      },
      {
        standalone_quality: '章节独立质量',
        outline_adherence: '大纲符合度',
        hook_management: '钩子管理',
      }
    );

    const outline = normalized.dimensions.find((item) => item.key === 'outlineAdherence');
    expect(outline?.score).toBe(8.6);
    expect(normalized.summary).toContain('整体结构稳定');
    expect(normalized.highlights).toContain('伏笔回收节奏合理');
  });

  it('normalizes consistency payload with dimensions, highlights and issues', () => {
    const normalized = normalizeConsistencyCheckData(
      {
        consistency_score: 8.2,
        dimension_scores: {
          character_consistency: { score: 8.5, comment: '角色行为延续自然' },
          timeline_consistency: { score: 7.6, comment: '存在轻微时间跳跃' },
        },
        highlights: ['角色称谓保持统一', '前情承接顺畅'],
        improvement_suggestions: [
          { priority: 'high', suggestion: '补一句时间锚点，消除跳跃感' },
        ],
        issues: [
          {
            id: 'i-1',
            category: 'timeline',
            severity: 'major',
            title: '时间线衔接偏弱',
            description: '昼夜切换缺少过渡句',
            evidence: '上一段仍为夜晚，下一段直接变为清晨',
            suggestion: '增加一段过渡描述',
          },
        ],
        summary: {
          overall_assessment: '整体稳定，个别时间衔接可优化',
          recommendation: '建议修改后发布',
          strongest_aspect: '角色一致性',
          weakest_aspect: '时间线一致性',
        },
        next_actions: ['先修正时间线，再复查人物状态'],
      },
      {
        character_consistency: '角色一致性',
        timeline_consistency: '时间线一致性',
      }
    );

    expect(normalized.overallScore).toBeGreaterThan(8);
    expect(normalized.dimensions).toHaveLength(2);
    expect(normalized.dimensions[0]?.label).toBe('角色一致性');
    expect(normalized.highlights).toContain('角色称谓保持统一');
    expect(normalized.improvements[0]).toContain('补一句时间锚点');
    expect(normalized.issues[0]?.severity).toBe('major');
    expect(normalized.isConsistent).toBe(false);
    expect(normalized.nextActions[0]).toContain('先修正时间线');
  });
});
