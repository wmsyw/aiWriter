import { NextRequest, NextResponse } from 'next/server';

export function verifyCsrf(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin) {
    return null;
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    
    if (host && originHost === host) {
      return null;
    }

    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter(Boolean);

    if (allowedOrigins.some(allowed => origin === allowed)) {
      return null;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
}
