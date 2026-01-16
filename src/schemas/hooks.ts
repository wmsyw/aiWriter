import { z } from 'zod';
import { HookStatus, HookType, HookImportance } from '../constants/workflow';

export const NarrativeHookSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  type: z.enum(['foreshadowing', 'chekhov_gun', 'mystery', 'promise', 'setup']),
  description: z.string(),
  plantedInChapter: z.number().int().positive(),
  plantedContext: z.string().optional(),
  referencedInChapters: z.array(z.number().int().positive()).default([]),
  resolvedInChapter: z.number().int().positive().nullable(),
  resolutionContext: z.string().optional(),
  status: z.enum(['planted', 'referenced', 'resolved', 'abandoned']).default('planted'),
  importance: z.enum(['critical', 'major', 'minor']).default('minor'),
  expectedResolutionBy: z.number().int().positive().optional(),
  reminderThreshold: z.number().int().positive().default(10),
  relatedCharacters: z.array(z.string()).default([]),
  relatedOrganizations: z.array(z.string()).default([]),
  notes: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type NarrativeHook = z.infer<typeof NarrativeHookSchema>;

export const PlantHookInputSchema = z.object({
  type: z.enum(['foreshadowing', 'chekhov_gun', 'mystery', 'promise', 'setup']),
  description: z.string().min(1),
  plantedInChapter: z.number().int().positive(),
  plantedContext: z.string().optional(),
  importance: z.enum(['critical', 'major', 'minor']).default('minor'),
  expectedResolutionBy: z.number().int().positive().optional(),
  relatedCharacters: z.array(z.string()).default([]),
  relatedOrganizations: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type PlantHookInput = z.infer<typeof PlantHookInputSchema>;

export const ExtractedHooksSchema = z.object({
  planted: z.array(z.object({
    type: z.enum(['foreshadowing', 'chekhov_gun', 'mystery', 'promise', 'setup']),
    description: z.string(),
    context: z.string().optional(),
    importance: z.enum(['critical', 'major', 'minor']).default('minor'),
    relatedCharacters: z.array(z.string()).default([]),
  })),
  referenced: z.array(z.object({
    hookDescription: z.string(),
    referenceContext: z.string().optional(),
  })),
  resolved: z.array(z.object({
    hookDescription: z.string(),
    resolutionContext: z.string().optional(),
  })),
});

export type ExtractedHooks = z.infer<typeof ExtractedHooksSchema>;

export const HooksReportSchema = z.object({
  totalPlanted: z.number(),
  totalResolved: z.number(),
  totalUnresolved: z.number(),
  totalAbandoned: z.number(),
  resolutionRate: z.number(),
  averageResolutionChapters: z.number(),
  overdueHooks: z.array(NarrativeHookSchema),
  hooksByType: z.record(z.string(), z.number()),
  hooksByImportance: z.record(z.string(), z.number()),
  unresolvedByImportance: z.object({
    critical: z.number(),
    major: z.number(),
    minor: z.number(),
  }),
});

export type HooksReport = z.infer<typeof HooksReportSchema>;

export const OverdueHookWarningSchema = z.object({
  hookId: z.string(),
  description: z.string(),
  plantedChapter: z.number(),
  chaptersOverdue: z.number(),
  importance: z.enum(['critical', 'major', 'minor']),
  suggestedAction: z.string(),
});

export type OverdueHookWarning = z.infer<typeof OverdueHookWarningSchema>;
