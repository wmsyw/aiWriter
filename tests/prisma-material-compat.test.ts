import { describe, expect, it } from 'vitest';
import { remapMaterialArgsForCompat } from '@/src/server/prisma-material-compat';

describe('remapMaterialArgsForCompat', () => {
  it('remaps select.metadata to select.data', () => {
    const args: Record<string, unknown> = {
      select: {
        id: true,
        metadata: true,
      },
    };

    remapMaterialArgsForCompat(args);

    expect(args.select).toEqual({
      id: true,
      data: true,
    });
  });

  it('does not override select.data when already provided', () => {
    const args: Record<string, unknown> = {
      select: {
        id: true,
        data: { select: { description: true } },
        metadata: true,
      },
    };

    remapMaterialArgsForCompat(args);

    expect(args.select).toEqual({
      id: true,
      data: { select: { description: true } },
    });
  });

  it('remaps write payload metadata to data', () => {
    const args: Record<string, unknown> = {
      data: {
        name: '角色A',
        metadata: { description: 'test' },
      },
    };

    remapMaterialArgsForCompat(args);

    expect(args.data).toEqual({
      name: '角色A',
      data: { description: 'test' },
    });
  });

  it('remaps createMany style array payloads', () => {
    const args: Record<string, unknown> = {
      data: [
        { name: 'A', metadata: { description: 'a' } },
        { name: 'B', data: { description: 'b' }, metadata: { description: 'x' } },
      ],
    };

    remapMaterialArgsForCompat(args);

    expect(args.data).toEqual([
      { name: 'A', data: { description: 'a' } },
      { name: 'B', data: { description: 'b' } },
    ]);
  });
});
