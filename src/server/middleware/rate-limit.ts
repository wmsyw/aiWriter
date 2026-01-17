import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../db';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'auth/login': { maxRequests: 5, windowMs: 60000 },
  'auth/forgot-password': { maxRequests: 3, windowMs: 300000 },
  'auth/reset-password': { maxRequests: 5, windowMs: 300000 },
  'auth/register': { maxRequests: 3, windowMs: 300000 },
  'novels': { maxRequests: 60, windowMs: 60000 },
  'novels/create': { maxRequests: 10, windowMs: 60000 },
  'jobs': { maxRequests: 30, windowMs: 60000 },
  'jobs/inspiration': { maxRequests: 10, windowMs: 3600000 },
  'agents': { maxRequests: 100, windowMs: 60000 },
  'default': { maxRequests: 100, windowMs: 60000 },
};

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

function getRateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}

export async function checkRateLimit(
  ip: string, 
  endpoint: string
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const key = getRateLimitKey(ip, endpoint);
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
        { error: 'Too many requests', retryAfter },
        { 
          status: 429, 
          headers: { 
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime.getTime() / 1000)),
          } 
        }
      );
    }

    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return null;
  } catch {
    return null;
  }
}

export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { resetTime: { lt: new Date() } },
  });
  return result.count;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export async function getRateLimitStatus(
  ip: string, 
  endpoint: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const key = getRateLimitKey(ip, endpoint);
  const now = new Date();

  try {
    const entry = await prisma.rateLimit.findUnique({ where: { key } });

    if (!entry || now > entry.resetTime) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowMs),
      };
    }

    return {
      allowed: entry.count < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetAt: entry.resetTime,
    };
  } catch {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowMs),
    };
  }
}

export function withRateLimit(endpoint: string) {
  return async function rateLimitMiddleware(
    request: NextRequest,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const ip = getClientIp(request);
    const rateLimitResponse = await checkRateLimit(ip, endpoint);
    
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    return handler();
  };
}

export function createRateLimitedHandler(
  endpoint: string,
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async function(request: NextRequest): Promise<NextResponse> {
    const ip = getClientIp(request);
    const rateLimitResponse = await checkRateLimit(ip, endpoint);
    
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    return handler(request);
  };
}
