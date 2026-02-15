import type { PrismaClient } from '@prisma/client';

const MATERIAL_COMPAT_FLAG = Symbol.for('aiwriter.material-metadata-compat-applied');

type RecordValue = Record<string, unknown>;
type PrismaClientWithCompatFlag = PrismaClient & {
  [MATERIAL_COMPAT_FLAG]?: boolean;
};

function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function remapMetadataSelect(select: unknown): void {
  if (!isRecord(select) || !Object.prototype.hasOwnProperty.call(select, 'metadata')) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(select, 'data')) {
    select.data = select.metadata;
  }
  delete select.metadata;
}

function remapMetadataPayload(payload: unknown): void {
  if (Array.isArray(payload)) {
    payload.forEach((entry) => remapMetadataPayload(entry));
    return;
  }
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
    payload.data = payload.metadata;
  }
  delete payload.metadata;
}

export function remapMaterialArgsForCompat(args: unknown): void {
  if (!isRecord(args)) {
    return;
  }

  remapMetadataSelect(args.select);
  remapMetadataSelect(args.omit);
  remapMetadataPayload(args.data);
  remapMetadataPayload(args.create);
  remapMetadataPayload(args.update);
}

export function applyMaterialMetadataCompat(prismaClient: PrismaClient): PrismaClient {
  const client = prismaClient as PrismaClientWithCompatFlag;
  if (client[MATERIAL_COMPAT_FLAG]) {
    return prismaClient;
  }

  const extended = prismaClient.$extends({
    query: {
      material: {
        async $allOperations({ args, query }) {
          remapMaterialArgsForCompat(args);
          return query(args);
        },
      },
    },
  }) as PrismaClientWithCompatFlag;

  extended[MATERIAL_COMPAT_FLAG] = true;
  return extended as PrismaClient;
}
