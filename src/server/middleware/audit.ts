import { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/src/server/auth/session';
import { createAuditEvent } from '@/src/server/services/audit';

export async function getSessionUser() {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    return session.isLoggedIn ? session : null;
  } catch {
    return null;
  }
}

export async function auditRequest(
  request: NextRequest,
  action: string,
  resource: string,
  options: {
    resourceId?: string;
    metadata?: Record<string, any>;
    success?: boolean;
  } = {}
) {
  const session = await getSessionUser();
  const ipAddress = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
  const userAgent = request.headers.get('user-agent') || undefined;

  await createAuditEvent({
    userId: session?.userId,
    action,
    resource,
    resourceId: options.resourceId,
    metadata: options.metadata,
    ipAddress,
    userAgent,
    success: options.success,
  });
}
