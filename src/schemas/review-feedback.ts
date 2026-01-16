import { z } from 'zod';
import { ReviewVerdict, ReviewDimension } from '../constants/workflow';

export const StandaloneQualitySchema = z.object({
  score: z.number().min(1).max(10),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});

export const ContinuityIssueSchema = z.object({
  type: z.enum(['timeline', 'character_state', 'plot_logic', 'setting']),
  description: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  location: z.string().optional(),
});

export const ContinuitySchema = z.object({
  score: z.number().min(1).max(10),
  issues: z.array(ContinuityIssueSchema).default([]),
});

export const OutlineDeviationSchema = z.object({
  expected: z.string(),
  actual: z.string(),
  severity: z.enum(['minor', 'major', 'critical']),
});

export const OutlineAdherenceSchema = z.object({
  score: z.number().min(0).max(1),
  deviations: z.array(OutlineDeviationSchema).default([]),
  verdict: z.enum(['acceptable', 'needs_revision', 'reject']),
});

export const CharacterInconsistencySchema = z.object({
  character: z.string(),
  issue: z.string(),
  expectedBehavior: z.string().optional(),
  observedBehavior: z.string().optional(),
});

export const CharacterConsistencySchema = z.object({
  score: z.number().min(1).max(10),
  inconsistencies: z.array(CharacterInconsistencySchema).default([]),
});

export const OverdueHookWarningSchema = z.object({
  hookDescription: z.string(),
  plantedChapter: z.number(),
  chaptersOverdue: z.number(),
  importance: z.enum(['critical', 'major', 'minor']),
});

export const HookManagementSchema = z.object({
  score: z.number().min(1).max(10),
  hooksPlanted: z.array(z.string()).default([]),
  hooksReferenced: z.array(z.string()).default([]),
  hooksResolved: z.array(z.string()).default([]),
  overdueWarnings: z.array(OverdueHookWarningSchema).default([]),
});

export const ReviewDimensionsSchema = z.object({
  standaloneQuality: StandaloneQualitySchema,
  continuity: ContinuitySchema,
  outlineAdherence: OutlineAdherenceSchema,
  characterConsistency: CharacterConsistencySchema,
  hookManagement: HookManagementSchema,
});

export const ReviewIssueSchema = z.object({
  type: z.enum([
    'plot_hole',
    'character_inconsistency',
    'pacing_issue',
    'outline_deviation',
    'unresolved_hook',
    'ai_taste',
    'continuity_error',
  ]),
  severity: z.enum(['critical', 'major', 'minor']),
  location: z.string().optional(),
  description: z.string(),
  suggestion: z.string(),
});

export const ReviewFeedbackSchema = z.object({
  overallScore: z.number().min(1).max(10),
  dimensions: ReviewDimensionsSchema,
  issues: z.array(ReviewIssueSchema).default([]),
  verdict: z.enum(['approve', 'minor_revision', 'major_revision', 'reject']),
  regenerationInstructions: z.string().optional(),
  summary: z.string().optional(),
  reviewedAt: z.date().optional(),
});

export type ReviewFeedback = z.infer<typeof ReviewFeedbackSchema>;
export type ReviewDimensions = z.infer<typeof ReviewDimensionsSchema>;
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type StandaloneQuality = z.infer<typeof StandaloneQualitySchema>;
export type Continuity = z.infer<typeof ContinuitySchema>;
export type OutlineAdherence = z.infer<typeof OutlineAdherenceSchema>;
export type CharacterConsistency = z.infer<typeof CharacterConsistencySchema>;
export type HookManagement = z.infer<typeof HookManagementSchema>;

export function safeParseReviewFeedback(data: unknown): ReviewFeedback | { raw: string; parseError: string } {
  const result = ReviewFeedbackSchema.safeParse(data);
  if (result.success) return result.data;
  return { raw: JSON.stringify(data), parseError: result.error.message };
}

export function calculateOverallScore(dimensions: ReviewDimensions): number {
  const weights = {
    standaloneQuality: 0.25,
    continuity: 0.20,
    outlineAdherence: 0.20,
    characterConsistency: 0.20,
    hookManagement: 0.15,
  };
  
  const outlineScore = dimensions.outlineAdherence.score * 10;
  
  return Number((
    dimensions.standaloneQuality.score * weights.standaloneQuality +
    dimensions.continuity.score * weights.continuity +
    outlineScore * weights.outlineAdherence +
    dimensions.characterConsistency.score * weights.characterConsistency +
    dimensions.hookManagement.score * weights.hookManagement
  ).toFixed(2));
}

export function determineVerdict(
  overallScore: number,
  dimensions: ReviewDimensions,
  passThreshold: number = 7.0
): 'approve' | 'minor_revision' | 'major_revision' | 'reject' {
  if (dimensions.outlineAdherence.verdict === 'reject') {
    return 'reject';
  }
  
  const hasCriticalIssue = 
    dimensions.continuity.issues.some(i => i.severity === 'critical') ||
    dimensions.characterConsistency.inconsistencies.length > 3 ||
    dimensions.outlineAdherence.deviations.some(d => d.severity === 'critical');
  
  if (hasCriticalIssue) {
    return 'major_revision';
  }
  
  if (overallScore >= passThreshold) {
    return 'approve';
  }
  
  if (overallScore >= passThreshold - 1.5) {
    return 'minor_revision';
  }
  
  if (overallScore >= passThreshold - 3) {
    return 'major_revision';
  }
  
  return 'reject';
}
