import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/src/server/db';
import { verifyPassword } from '@/src/server/auth/password';
import { sessionOptions, SessionData } from '@/src/server/auth/session';
import { auditRequest } from '@/src/server/middleware/audit';
import { AuditActions } from '@/src/server/services/audit';
import { verifyCsrf } from '@/src/server/middleware/csrf';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  const rateLimitError = await checkRateLimit(getClientIp(request), 'auth/login');
  if (rateLimitError) return rateLimitError;

  let email: string | undefined;
  let userId: string | undefined;
  
  try {
    const body = await request.json();
    const parsed = loginSchema.parse(body);
    email = parsed.email;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await auditRequest(request, AuditActions.LOGIN_FAILURE, 'auth', {
        metadata: { email, reason: 'user_not_found' },
        success: false,
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await verifyPassword(user.password, parsed.password);
    if (!valid) {
      await auditRequest(request, AuditActions.LOGIN_FAILURE, 'auth', {
        metadata: { email, reason: 'invalid_password' },
        success: false,
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    userId = user.id;
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role;
    session.isLoggedIn = true;
    await session.save();

    await auditRequest(request, AuditActions.LOGIN_SUCCESS, 'auth', {
      resourceId: user.id,
      metadata: { email },
    });

    return NextResponse.json({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
