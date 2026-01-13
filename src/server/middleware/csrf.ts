import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

export function verifyCsrf(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (origin) {
    if (ALLOWED_ORIGINS.some(allowed => origin === allowed)) {
      return null;
    }
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      if (ALLOWED_ORIGINS.some(allowed => refererOrigin === allowed)) {
        return null;
      }
    } catch {
      return NextResponse.json({ error: 'Invalid referer' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Invalid referer origin' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Missing origin header' }, { status: 403 });
}
