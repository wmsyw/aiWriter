import { prisma } from '@/src/server/db';

export interface DistributedLock {
  lockId: string;
  resourceId: string;
  ownerId: string;
  expiresAt: Date;
}

export interface LockOptions {
  ttlMs?: number;
  retryIntervalMs?: number;
  maxRetries?: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttlMs: 5 * 60 * 1000,
  retryIntervalMs: 100,
  maxRetries: 50,
};

export class DistributedLockManager {
  private ownerId: string;

  constructor(ownerId?: string) {
    this.ownerId = ownerId ?? `worker_${process.pid}_${Date.now()}`;
  }

  async acquireLock(
    resourceId: string,
    options: LockOptions = {}
  ): Promise<DistributedLock | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const expiresAt = new Date(Date.now() + opts.ttlMs);
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        await this.cleanupExpiredLocks();

        const result = await prisma.$executeRaw`
          INSERT INTO "DistributedLock" ("id", "resourceId", "ownerId", "expiresAt", "createdAt")
          VALUES (
            ${lockId},
            ${resourceId},
            ${this.ownerId},
            ${expiresAt},
            NOW()
          )
          ON CONFLICT ("resourceId") DO NOTHING
        `;

        if (result === 1) {
          return { lockId, resourceId, ownerId: this.ownerId, expiresAt };
        }

        const existing = await prisma.$queryRaw<DistributedLock[]>`
          SELECT * FROM "DistributedLock" WHERE "resourceId" = ${resourceId}
        `;

        if (existing.length > 0 && existing[0].ownerId === this.ownerId) {
          await this.extendLock(resourceId, opts.ttlMs);
          return {
            lockId: (existing[0] as any).id,
            resourceId,
            ownerId: this.ownerId,
            expiresAt,
          };
        }

        if (attempt < opts.maxRetries) {
          await this.sleep(opts.retryIntervalMs);
        }
      } catch (error) {
        if (attempt === opts.maxRetries) {
          console.error('Failed to acquire lock:', error);
          return null;
        }
        await this.sleep(opts.retryIntervalMs);
      }
    }

    return null;
  }

  async releaseLock(resourceId: string): Promise<boolean> {
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM "DistributedLock" 
        WHERE "resourceId" = ${resourceId} 
          AND "ownerId" = ${this.ownerId}
      `;
      return result === 1;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }

  async extendLock(resourceId: string, ttlMs: number): Promise<boolean> {
    try {
      const newExpiresAt = new Date(Date.now() + ttlMs);
      const result = await prisma.$executeRaw`
        UPDATE "DistributedLock" 
        SET "expiresAt" = ${newExpiresAt}
        WHERE "resourceId" = ${resourceId} 
          AND "ownerId" = ${this.ownerId}
      `;
      return result === 1;
    } catch (error) {
      console.error('Failed to extend lock:', error);
      return false;
    }
  }

  async isLocked(resourceId: string): Promise<boolean> {
    try {
      await this.cleanupExpiredLocks();
      const result = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "DistributedLock" 
        WHERE "resourceId" = ${resourceId}
      `;
      return Number(result[0]?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async withLock<T>(
    resourceId: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lock = await this.acquireLock(resourceId, options);
    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resourceId}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resourceId);
    }
  }

  private async cleanupExpiredLocks(): Promise<void> {
    try {
      await prisma.$executeRaw`
        DELETE FROM "DistributedLock" WHERE "expiresAt" < NOW()
      `;
    } catch {
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let lockManagerInstance: DistributedLockManager | null = null;

export function getLockManager(): DistributedLockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new DistributedLockManager();
  }
  return lockManagerInstance;
}
