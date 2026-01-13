import { prisma } from '@/src/server/db';
import crypto from 'crypto';

export interface AuditEventData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
}

export async function createAuditEvent(data: AuditEventData) {
  const metadataWithHashes = data.metadata ? {
    ...data.metadata,
    _hashes: Object.entries(data.metadata).reduce((acc, [key, value]) => {
      if (typeof value === 'string' && value.length > 100) {
        acc[key] = crypto.createHash('sha256').update(value).digest('hex');
      }
      return acc;
    }, {} as Record<string, string>),
  } : undefined;

  return prisma.auditEvent.create({
    data: {
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      metadata: metadataWithHashes,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      success: data.success ?? true,
    },
  });
}

export const AuditActions = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_RESET_REQUEST: 'auth.password_reset.request',
  PASSWORD_RESET_COMPLETE: 'auth.password_reset.complete',
  PROVIDER_CREATE: 'provider.create',
  PROVIDER_UPDATE: 'provider.update',
  PROVIDER_DELETE: 'provider.delete',
  FILE_UPLOAD: 'file.upload',
  FILE_DELETE: 'file.delete',
  JOB_CREATE: 'job.create',
  JOB_COMPLETE: 'job.complete',
  EXPORT: 'export',
  VERSION_ROLLBACK: 'version.rollback',
} as const;
