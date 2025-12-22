/**
 * Rate limiting utilities
 * 
 * Provides in-memory rate limiting for API endpoints.
 * For production with multiple instances, use Upstash Redis.
 */

import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// Note: This works for single-instance deployments. For multi-instance,
// configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Clean up every minute
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

// Default configurations for different endpoint types
export const RATE_LIMIT_CONFIGS = {
  /** Auth endpoints - stricter to prevent brute force */
  auth: { limit: 5, windowSeconds: 60 }, // 5 attempts per minute
  /** General API endpoints */
  api: { limit: 60, windowSeconds: 60 }, // 60 requests per minute
  /** Search endpoints - moderate limit */
  search: { limit: 20, windowSeconds: 60 }, // 20 searches per minute
  /** Upload endpoints */
  upload: { limit: 30, windowSeconds: 60 }, // 30 uploads per minute
} as const;

/**
 * Check rate limit for a given identifier
 * Returns null if within limit, or a NextResponse with 429 status if exceeded
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): NextResponse | null {
  const now = Date.now();
  const key = identifier;
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    // First request or window expired - start new window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + (config.windowSeconds * 1000),
    });
    return null;
  }
  
  if (entry.count >= config.limit) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return NextResponse.json(
      { 
        error: 'Too many requests. Please try again later.',
        retryAfter,
      },
      { 
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
        },
      }
    );
  }
  
  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  return null;
}

/**
 * Get a rate limit identifier from request headers
 * Uses X-Forwarded-For for proxied requests, falls back to a default
 */
export function getRateLimitIdentifier(
  request: Request,
  suffix?: string
): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return suffix ? `${ip}:${suffix}` : ip;
}

/**
 * Convenience function to check auth rate limit
 */
export function checkAuthRateLimit(request: Request, caseId: string): NextResponse | null {
  const identifier = getRateLimitIdentifier(request, `auth:${caseId}`);
  return checkRateLimit(identifier, RATE_LIMIT_CONFIGS.auth);
}

/**
 * Convenience function to check API rate limit
 */
export function checkApiRateLimit(request: Request, endpoint?: string): NextResponse | null {
  const identifier = getRateLimitIdentifier(request, endpoint);
  return checkRateLimit(identifier, RATE_LIMIT_CONFIGS.api);
}

/**
 * Convenience function to check search rate limit
 */
export function checkSearchRateLimit(request: Request, caseId: string): NextResponse | null {
  const identifier = getRateLimitIdentifier(request, `search:${caseId}`);
  return checkRateLimit(identifier, RATE_LIMIT_CONFIGS.search);
}
