import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/src/server/auth/session';
import { verifyCsrf } from '@/src/server/middleware/csrf';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  const rateLimitError = await checkRateLimit(getClientIp(request), 'auth/logout');
  if (rateLimitError) return rateLimitError;

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
  return NextResponse.json({ success: true });
}
