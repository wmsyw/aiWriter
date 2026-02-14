import { describe, expect, it } from 'vitest';
import {
  buildBranchIterationInput,
  composeReviewIterationFeedback,
  getNextBranchIterationRound,
  getReviewIterationRound,
  normalizeBranchCandidates,
} from '@/src/shared/chapter-branch-review';

describe('chapter branch review helpers', () => {
  it('sorts branches by continuity score and marks first as recommended', () => {
    const branches = normalizeBranchCandidates([
      { id: 'b3', branchNumber: 3, continuityScore: 7.4, continuityRecommended: true },
      { id: 'b1', branchNumber: 1, continuityScore: 8.1, continuityRecommended: false },
      { id: 'b2', branchNumber: 2, continuityScore: 8.1, continuityRecommended: false },
    ]);

    expect(branches.map((item) => item.id)).toEqual(['b1', 'b2', 'b3']);
    expect(branches[0].continuityRecommended).toBe(true);
    expect(branches[1].continuityRecommended).toBe(false);
    expect(branches[2].continuityRecommended).toBe(false);
  });

  it('builds branch iteration input with trimmed content and feedback', () => {
    const input = buildBranchIterationInput({
      selectedContent: '  正文草稿  ',
      feedback: '  增强张力  ',
      iterationRound: 2.8,
    });

    expect(input).toEqual({
      selectedContent: '正文草稿',
      feedback: '增强张力',
      iterationRound: 2,
    });
  });

  it('returns null when selected content is empty', () => {
    const input = buildBranchIterationInput({
      selectedContent: '   ',
      feedback: 'anything',
      iterationRound: 3,
    });

    expect(input).toBeNull();
  });

  it('builds combined review feedback from ai suggestions and user note', () => {
    const feedback = composeReviewIterationFeedback({
      suggestions: [
        { suggestion: '补足主角心理活动。' },
        { suggestion: '' },
        { suggestion: '强化场景动作细节。' },
      ],
      userFeedback: '节奏再紧一点',
    });

    expect(feedback).toContain('【AI修改建议】');
    expect(feedback).toContain('补足主角心理活动。');
    expect(feedback).toContain('【用户补充意见】');
    expect(feedback).toContain('节奏再紧一点');
  });

  it('computes next iteration rounds safely', () => {
    expect(getNextBranchIterationRound(1)).toBe(2);
    expect(getNextBranchIterationRound(0)).toBe(2);
    expect(getNextBranchIterationRound('4')).toBe(5);

    expect(getReviewIterationRound(0)).toBe(1);
    expect(getReviewIterationRound(3)).toBe(4);
    expect(getReviewIterationRound('2')).toBe(3);
    expect(getReviewIterationRound(undefined)).toBe(1);
  });
});
