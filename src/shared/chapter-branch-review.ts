export interface ContinuityBranchLike {
  branchNumber?: number | null;
  continuityScore?: number | null;
  continuityRecommended?: boolean;
}

export interface BranchIterationInput {
  selectedContent: string;
  feedback: string;
  iterationRound: number;
}

export interface ReviewSuggestionLike {
  suggestion?: string | null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return fallback;
  return Math.max(1, Math.floor(numericValue));
}

function getBranchRank(branch: ContinuityBranchLike): { score: number; branchNumber: number } {
  const scoreValue = toFiniteNumber(branch.continuityScore);
  const score = scoreValue === null ? Number.NEGATIVE_INFINITY : scoreValue;
  const branchNumberValue = toFiniteNumber(branch.branchNumber);
  const branchNumber = branchNumberValue === null ? Number.MAX_SAFE_INTEGER : branchNumberValue;
  return { score, branchNumber };
}

export function normalizeBranchCandidates<T extends ContinuityBranchLike>(
  branches: readonly T[]
): T[] {
  if (!Array.isArray(branches) || branches.length === 0) {
    return [];
  }

  const sorted = [...branches].sort((left, right) => {
    const leftRank = getBranchRank(left);
    const rightRank = getBranchRank(right);

    if (rightRank.score !== leftRank.score) {
      return rightRank.score - leftRank.score;
    }
    if (leftRank.branchNumber !== rightRank.branchNumber) {
      return leftRank.branchNumber - rightRank.branchNumber;
    }
    return 0;
  });

  return sorted.map((branch, index) => ({
    ...branch,
    continuityRecommended: index === 0,
  }));
}

export function getNextBranchIterationRound(currentRound: unknown): number {
  return toPositiveInt(currentRound, 1) + 1;
}

export function getReviewIterationRound(reviewIterations: unknown): number {
  const parsed = toFiniteNumber(reviewIterations);
  if (parsed === null) return 1;
  return Math.max(1, Math.floor(parsed) + 1);
}

export function buildBranchIterationInput(params: {
  selectedContent: string;
  feedback?: string | null;
  iterationRound: number;
}): BranchIterationInput | null {
  const selectedContent = (params.selectedContent || '').trim();
  if (!selectedContent) {
    return null;
  }

  return {
    selectedContent,
    feedback: (params.feedback || '').trim(),
    iterationRound: toPositiveInt(params.iterationRound, 1),
  };
}

export function composeReviewIterationFeedback(params: {
  suggestions: readonly ReviewSuggestionLike[];
  userFeedback?: string | null;
}): string {
  const aiSuggestions = params.suggestions
    .map((item) => (typeof item?.suggestion === 'string' ? item.suggestion.trim() : ''))
    .filter(Boolean)
    .join('\n');

  const userFeedback = (params.userFeedback || '').trim();
  const sections = [
    aiSuggestions ? `【AI修改建议】\n${aiSuggestions}` : '',
    userFeedback ? `【用户补充意见】\n${userFeedback}` : '',
  ].filter(Boolean);

  return sections.join('\n\n');
}
