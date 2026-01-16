import { z } from 'zod';

export const slopPatternSchema = z.object({
  pattern: z.union([z.string(), z.instanceof(RegExp)]),
  replacement: z.string(),
  description: z.string(),
});

export type SlopPattern = z.infer<typeof slopPatternSchema>;

export const slopCleanerConfigSchema = z.object({
  enableChineseSlop: z.boolean().optional().default(true),
  enableRepetition: z.boolean().optional().default(true),
  enableStructural: z.boolean().optional().default(false),
  customPatterns: z.array(slopPatternSchema).optional().default([]),
  preserveOriginal: z.boolean().optional().default(false),
});

export type SlopCleanerConfig = z.infer<typeof slopCleanerConfigSchema>;

export const slopCleanerStatsSchema = z.object({
  originalLength: z.number(),
  cleanedLength: z.number(),
  reductionPercent: z.number(),
  fixesApplied: z.array(z.object({
    pattern: z.string(),
    count: z.number(),
  })),
});

export type SlopCleanerStats = z.infer<typeof slopCleanerStatsSchema>;

export const slopCleanerResultSchema = z.object({
  original: z.string().optional(),
  cleaned: z.string(),
  stats: slopCleanerStatsSchema,
});

export type SlopCleanerResult = z.infer<typeof slopCleanerResultSchema>;

export const slopLevelSchema = z.enum(['low', 'medium', 'high']);

export type SlopLevel = z.infer<typeof slopLevelSchema>;

export const slopDetectionResultSchema = z.object({
  level: slopLevelSchema,
  score: z.number(),
  details: z.array(z.string()),
});

export type SlopDetectionResult = z.infer<typeof slopDetectionResultSchema>;
