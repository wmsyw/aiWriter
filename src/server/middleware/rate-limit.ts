import { NextResponse } from 'next/server';
import { prisma } from '../db';

const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  'auth/login': { maxRequests: 5, windowMs: 60000 },
  'auth/forgot-password': { maxRequests: 3, windowMs: 300000 },
  'auth/reset-password': { maxRequests: 5, windowMs: 300000 },
  'auth/register': { maxRequests: 3, windowMs: 300000 },
  'jobs': { maxRequests: 30, windowMs: 60000 },
  'jobs/inspiration': { maxRequests: 10, windowMs: 3600000 },
  'default': { maxRequests: 100, windowMs: 60000 },
};

export async function checkRateLimit(ip: string, endpoint: string): Promise<NextResponse | null> {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const key = `${ip}:${endpoint}`;
  const now = new Date();

  try {
    const entry = await prisma.rateLimit.findUnique({ where: { key } });

    if (!entry || now > entry.resetTime) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { count: 1, resetTime: new Date(now.getTime() + config.windowMs) },
        create: { key, count: 1, resetTime: new Date(now.getTime() + config.windowMs) },
      });
      return null;
    }

    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime.getTime() - now.getTime()) / 1000);
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return null;
  } catch {
    // If DB fails, allow request (fail-open for availability)
    return null;
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

// Cleanup expired entries (call periodically or via cron)
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { resetTime: { lt: new Date() } },
  });
  return result.count;
}
