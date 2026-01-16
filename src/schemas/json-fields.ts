import { z } from 'zod';

export const OutlineRoughSchema = z.object({
  sections: z.array(z.object({
    title: z.string(),
    summary: z.string(),
    key_events: z.array(z.string()).optional(),
    characters_involved: z.array(z.string()).optional(),
  })).optional(),
  main_plot: z.string().optional(),
  subplots: z.array(z.string()).optional(),
  raw: z.string().optional(),
});

export const OutlineDetailedSchema = z.object({
  story_arcs: z.array(z.object({
    title: z.string(),
    chapters: z.array(z.string()).optional(),
    description: z.string().optional(),
    new_characters: z.array(z.object({
      name: z.string(),
      role: z.string().optional(),
      brief: z.string().optional(),
    })).optional(),
  })).optional(),
  raw: z.string().optional(),
});

export const OutlineChaptersSchema = z.object({
  chapters: z.array(z.object({
    number: z.number(),
    title: z.string(),
    summary: z.string().optional(),
    key_points: z.array(z.string()).optional(),
    word_target: z.number().optional(),
  })).optional(),
  raw: z.string().optional(),
});

export const MaterialDataSchema = z.object({
  description: z.string().optional(),
  role: z.string().optional(),
  traits: z.string().optional(),
  goals: z.string().optional(),
  backstory: z.string().optional(),
  personality: z.string().optional(),
  abilities: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  relationships: z.array(z.object({
    targetId: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

export const MemoryAnalysisSchema = z.object({
  characters: z.object({
    newly_introduced: z.array(z.object({
      name: z.string(),
      identity: z.string().optional(),
      description: z.string().optional(),
      personality: z.string().optional(),
      role_type: z.string().optional(),
      first_impression: z.string().optional(),
    })).optional(),
    appearing: z.array(z.object({
      name: z.string(),
      actions: z.string().optional(),
      development: z.string().optional(),
      new_info: z.string().optional(),
    })).optional(),
    mentioned_only: z.array(z.string()).optional(),
  }).optional(),
  relationships: z.array(z.object({
    character1: z.string(),
    character2: z.string(),
    relationship: z.string(),
    change: z.string().optional(),
  })).optional(),
  organizations: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
    members: z.array(z.string()).optional(),
    influence: z.string().optional(),
  })).optional(),
  plot_events: z.array(z.object({
    event: z.string(),
    importance: z.string().optional(),
    characters_involved: z.array(z.string()).optional(),
    consequences: z.string().optional(),
  })).optional(),
  raw: z.string().optional(),
  parseError: z.string().optional(),
});

export const ReviewResultSchema = z.object({
  overall_score: z.number().min(1).max(10).optional().nullable(),
  dimensions: z.record(z.string(), z.object({
    score: z.number().optional(),
    comment: z.string().optional(),
  })).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
  raw: z.string().optional(),
});

export const ConsistencyCheckResultSchema = z.object({
  is_consistent: z.boolean().optional(),
  issues: z.array(z.object({
    type: z.string(),
    description: z.string(),
    severity: z.enum(['high', 'medium', 'low']).optional(),
    location: z.string().optional(),
  })).optional(),
  warnings: z.array(z.string()).optional(),
  raw: z.string().optional(),
});

export const CanonCheckResultSchema = z.object({
  compliance_score: z.number().min(0).max(100).optional(),
  character_compliance: z.object({
    score: z.number().optional(),
    issues: z.array(z.string()).optional(),
  }).optional(),
  world_compliance: z.object({
    score: z.number().optional(),
    issues: z.array(z.string()).optional(),
  }).optional(),
  plot_compliance: z.object({
    score: z.number().optional(),
    issues: z.array(z.string()).optional(),
  }).optional(),
  style_compliance: z.object({
    score: z.number().optional(),
    issues: z.array(z.string()).optional(),
  }).optional(),
  recommendations: z.array(z.string()).optional(),
  raw: z.string().optional(),
});

export type OutlineRough = z.infer<typeof OutlineRoughSchema>;
export type OutlineDetailed = z.infer<typeof OutlineDetailedSchema>;
export type OutlineChapters = z.infer<typeof OutlineChaptersSchema>;
export type MaterialData = z.infer<typeof MaterialDataSchema>;
export type MemoryAnalysis = z.infer<typeof MemoryAnalysisSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type ConsistencyCheckResult = z.infer<typeof ConsistencyCheckResultSchema>;
export type CanonCheckResult = z.infer<typeof CanonCheckResultSchema>;

export function safeParseOutlineRough(data: unknown): OutlineRough | { raw: string; parseError: string } {
  const result = OutlineRoughSchema.safeParse(data);
  if (result.success) return result.data;
  return { raw: JSON.stringify(data), parseError: result.error.message };
}

export function safeParseMemoryAnalysis(data: unknown): MemoryAnalysis | { raw: string; parseError: string } {
  const result = MemoryAnalysisSchema.safeParse(data);
  if (result.success) return result.data;
  return { raw: JSON.stringify(data), parseError: result.error.message };
}

export function safeParseReviewResult(data: unknown): ReviewResult | { raw: string; parseError: string } {
  const result = ReviewResultSchema.safeParse(data);
  if (result.success) return result.data;
  return { raw: JSON.stringify(data), parseError: result.error.message };
}
