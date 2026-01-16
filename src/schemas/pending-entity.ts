import { z } from 'zod';
import { PendingEntityStatus, EntityType } from '../constants/workflow';

export const ExtractedCharacterSchema = z.object({
  name: z.string(),
  identity: z.string().optional(),
  description: z.string().optional(),
  personality: z.string().optional(),
  roleType: z.string().optional(),
  firstImpression: z.string().optional(),
  relationshipsHint: z.array(z.object({
    targetName: z.string(),
    relationship: z.string(),
  })).default([]),
});

export type ExtractedCharacter = z.infer<typeof ExtractedCharacterSchema>;

export const ExtractedOrganizationSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  members: z.array(z.string()).default([]),
  influence: z.string().optional(),
  roleInChapter: z.string().optional(),
});

export type ExtractedOrganization = z.infer<typeof ExtractedOrganizationSchema>;

export const PendingEntitySchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string(),
  chapterNumber: z.number(),
  entityType: z.enum(['character', 'organization']),
  name: z.string(),
  extractedData: z.union([ExtractedCharacterSchema, ExtractedOrganizationSchema]),
  status: z.enum(['pending', 'approved', 'rejected', 'merged']).default('pending'),
  mergedWithId: z.string().nullable().optional(),
  reviewNotes: z.string().optional(),
  reviewedAt: z.date().optional(),
  createdAt: z.date().optional(),
});

export type PendingEntity = z.infer<typeof PendingEntitySchema>;

export const CreatePendingEntityInputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  chapterNumber: z.number(),
  entityType: z.enum(['character', 'organization']),
  name: z.string(),
  extractedData: z.record(z.string(), z.unknown()),
});

export type CreatePendingEntityInput = z.infer<typeof CreatePendingEntityInputSchema>;

export const ReviewPendingEntityInputSchema = z.object({
  id: z.string(),
  action: z.enum(['approve', 'reject', 'merge']),
  mergeWithMaterialId: z.string().optional(),
  reviewNotes: z.string().optional(),
  overrideData: z.record(z.string(), z.unknown()).optional(),
});

export type ReviewPendingEntityInput = z.infer<typeof ReviewPendingEntityInputSchema>;

export const PendingEntitiesSummarySchema = z.object({
  pendingCount: z.number(),
  byType: z.object({
    character: z.number(),
    organization: z.number(),
  }),
  byChapter: z.record(z.string(), z.number()),
  blockedChapters: z.array(z.number()),
});

export type PendingEntitiesSummary = z.infer<typeof PendingEntitiesSummarySchema>;

export const EntityMatchSuggestionSchema = z.object({
  pendingEntityId: z.string(),
  pendingEntityName: z.string(),
  matchedMaterialId: z.string(),
  matchedMaterialName: z.string(),
  matchScore: z.number().min(0).max(1),
  matchReason: z.string(),
});

export type EntityMatchSuggestion = z.infer<typeof EntityMatchSuggestionSchema>;

export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function findPotentialMatches(
  pendingName: string,
  existingNames: string[]
): Array<{ name: string; score: number }> {
  const normalized = normalizeEntityName(pendingName);
  const results: Array<{ name: string; score: number }> = [];
  
  for (const existing of existingNames) {
    const normalizedExisting = normalizeEntityName(existing);
    
    if (normalized === normalizedExisting) {
      results.push({ name: existing, score: 1.0 });
      continue;
    }
    
    if (normalized.includes(normalizedExisting) || normalizedExisting.includes(normalized)) {
      results.push({ name: existing, score: 0.8 });
      continue;
    }
    
    const similarity = calculateSimpleSimilarity(normalized, normalizedExisting);
    if (similarity >= 0.6) {
      results.push({ name: existing, score: similarity });
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

function calculateSimpleSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }
  
  return matches / longer.length;
}
