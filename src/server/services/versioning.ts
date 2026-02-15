import { prisma } from '../db';
import { diffChars } from 'diff';
import type { PrismaClient, Prisma } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface VersionInfo {
  id: string;
  chapterId: string;
  content: string;
  isBranch: boolean;
  branchNumber: number | null;
  parentVersionId: string | null;
  createdAt: Date;
}

export interface BranchInfo {
  id: string;
  branchNumber: number;
  versionId: string;
  content: string;
  preview: string;
  createdAt: Date;
}

export interface DiffResult {
  added: number;
  removed: number;
  changes: Array<{ value: string; added?: boolean; removed?: boolean }>;
}

export async function saveVersion(chapterId: string, content: string, tx?: TxClient): Promise<VersionInfo> {
  const client = tx || prisma;
  
  if (tx) {
    const version = await client.chapterVersion.create({
      data: { chapterId, content },
    });
    await client.chapter.update({
      where: { id: chapterId },
      data: { currentVersionId: version.id },
    });
    return version as unknown as VersionInfo;
  }

  const transactionRunner = (prisma as unknown as {
    $transaction?: <T>(fn: (txClient: TxClient) => Promise<T>) => Promise<T>;
  }).$transaction;

  if (typeof transactionRunner !== 'function') {
    const version = await client.chapterVersion.create({
      data: { chapterId, content },
    });
    if (typeof (client as unknown as { chapter?: { update?: Function } }).chapter?.update === 'function') {
      await client.chapter.update({
        where: { id: chapterId },
        data: { currentVersionId: version.id },
      });
    }
    return version as unknown as VersionInfo;
  }

  return transactionRunner(async (txClient) => {
    const version = await txClient.chapterVersion.create({
      data: { chapterId, content },
    });

    await txClient.chapter.update({
      where: { id: chapterId },
      data: { currentVersionId: version.id },
    });

    return version as unknown as VersionInfo;
  });
}

export async function saveBranchVersions(
  chapterId: string,
  branches: Array<{ content: string; branchNumber: number }>,
  parentVersionId?: string | null
): Promise<VersionInfo[]> {
  return prisma.$transaction(async (tx) => {
    const versions: VersionInfo[] = [];
    for (const branch of branches) {
      const version = await tx.chapterVersion.create({
        data: {
          chapterId,
          content: branch.content,
          isBranch: true,
          branchNumber: branch.branchNumber,
          parentVersionId: parentVersionId || null,
        },
      });
      versions.push(version as unknown as VersionInfo);
    }
    return versions;
  });
}

export async function getBranches(chapterId: string): Promise<BranchInfo[]> {
  const branches = await prisma.chapterVersion.findMany({
    where: { chapterId, isBranch: true },
    orderBy: [{ createdAt: 'desc' }, { branchNumber: 'asc' }],
    take: 3,
  });
  
  return branches.map(b => ({
    id: b.id,
    branchNumber: b.branchNumber || 0,
    versionId: b.id,
    content: b.content,
    preview: b.content.slice(0, 500),
    createdAt: b.createdAt,
  }));
}

export async function pruneBranchCache(chapterId: string, limit: number = 3): Promise<number> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const branches = await prisma.chapterVersion.findMany({
    where: { chapterId, isBranch: true },
    orderBy: [{ createdAt: 'desc' }, { branchNumber: 'asc' }],
    select: { id: true },
  });

  if (branches.length <= normalizedLimit) {
    return 0;
  }

  const idsToDelete = branches.slice(normalizedLimit).map((item) => item.id);
  const deleted = await prisma.chapterVersion.deleteMany({
    where: { id: { in: idsToDelete } },
  });
  return deleted.count;
}

export async function deleteUnusedBranches(chapterId: string, excludeVersionId?: string): Promise<number> {
  const where: { chapterId: string; isBranch: true; id?: { not: string } } = { 
    chapterId, 
    isBranch: true 
  };
  
  if (excludeVersionId) {
    where.id = { not: excludeVersionId };
  }
  
  const result = await prisma.chapterVersion.deleteMany({ where });
  return result.count;
}

export async function selectBranch(chapterId: string, versionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const branch = await tx.chapterVersion.findUnique({ where: { id: versionId } });
    if (!branch) throw new Error('Branch not found');
    if (branch.chapterId !== chapterId) throw new Error('Branch does not belong to this chapter');
    
    const newVersion = await tx.chapterVersion.create({
      data: {
        chapterId,
        content: branch.content,
        isBranch: false,
        parentVersionId: versionId,
      },
    });
    
    await tx.chapter.update({
      where: { id: chapterId },
      data: { content: branch.content, currentVersionId: newVersion.id },
    });

    // 应用分支后清空该章节的全部分支缓存。
    await tx.chapterVersion.deleteMany({
      where: { chapterId, isBranch: true },
    });
  });
}

export async function getVersions(chapterId: string): Promise<VersionInfo[]> {
  return prisma.chapterVersion.findMany({
    where: { chapterId },
    orderBy: { createdAt: 'desc' },
  }) as unknown as VersionInfo[];
}

export async function getVersion(versionId: string): Promise<VersionInfo | null> {
  return prisma.chapterVersion.findUnique({ where: { id: versionId } }) as unknown as VersionInfo | null;
}

export async function getVersionDiff(versionId1: string, versionId2: string): Promise<DiffResult> {
  const [v1, v2] = await Promise.all([
    prisma.chapterVersion.findUnique({ where: { id: versionId1 } }),
    prisma.chapterVersion.findUnique({ where: { id: versionId2 } }),
  ]);

  if (!v1 || !v2) throw new Error('One or both versions not found');

  const changes = diffChars(v1.content, v2.content);
  
  let added = 0;
  let removed = 0;
  
  for (const change of changes) {
    if (change.added) added += change.value.length;
    else if (change.removed) removed += change.value.length;
  }

  return { added, removed, changes };
}

export async function restoreVersion(chapterId: string, versionId: string): Promise<void> {
  const version = await prisma.chapterVersion.findUnique({ where: { id: versionId } });

  if (!version) throw new Error('Version not found');
  if (version.chapterId !== chapterId) throw new Error('Version does not belong to this chapter');

  const newVersion = await prisma.chapterVersion.create({
    data: { chapterId, content: version.content },
  });

  await prisma.chapter.update({
    where: { id: chapterId },
    data: { content: version.content, currentVersionId: newVersion.id },
  });
}

export async function deleteVersion(versionId: string): Promise<void> {
  const version = await prisma.chapterVersion.findUnique({
    where: { id: versionId },
    include: {
      chapter: {
        include: { _count: { select: { versions: true } } },
      },
    },
  });

  if (!version) throw new Error('Version not found');
  if (version.chapter._count.versions <= 1) throw new Error('Cannot delete the only version');

  if (version.chapter.currentVersionId === versionId) {
    const latestOther = await prisma.chapterVersion.findFirst({
      where: { chapterId: version.chapterId, id: { not: versionId } },
      orderBy: { createdAt: 'desc' },
    });
    
    if (latestOther) {
      await prisma.chapter.update({
        where: { id: version.chapterId },
        data: { currentVersionId: latestOther.id },
      });
    }
  }

  await prisma.chapterVersion.delete({ where: { id: versionId } });
}
