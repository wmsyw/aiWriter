import { Prisma } from '@prisma/client';

type JsonRecord = Record<string, unknown>;

function asObject(value: Prisma.JsonValue | null | undefined): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as JsonRecord) };
}

export function normalizeCreativeIntent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getCreativeIntentFromWorkflowConfig(
  workflowConfig: Prisma.JsonValue | null | undefined
): string | undefined {
  const config = asObject(workflowConfig);
  return normalizeCreativeIntent(config.creativeIntent);
}

export function resolveCreativeIntentFromNovel(novel: {
  workflowConfig?: Prisma.JsonValue | null;
  specialRequirements?: string | null;
}): string | undefined {
  return (
    getCreativeIntentFromWorkflowConfig(novel.workflowConfig) ||
    normalizeCreativeIntent(novel.specialRequirements)
  );
}

export function mergeCreativeIntentIntoWorkflowConfig(
  workflowConfig: Prisma.JsonValue | null | undefined,
  creativeIntent: string | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const next = asObject(workflowConfig);

  if (creativeIntent) {
    next.creativeIntent = creativeIntent;
  } else {
    delete next.creativeIntent;
  }

  return Object.keys(next).length > 0
    ? (next as Prisma.InputJsonValue)
    : Prisma.JsonNull;
}

export function withCreativeIntentField<T extends {
  workflowConfig?: Prisma.JsonValue | null;
  specialRequirements?: string | null;
}>(novel: T): T & { creativeIntent?: string } {
  return {
    ...novel,
    creativeIntent: resolveCreativeIntentFromNovel(novel),
  };
}
