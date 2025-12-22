/**
 * Authentication utilities for server-side JWT-based auth
 * 
 * This module provides secure authentication using HTTP-only cookies
 * with JWT tokens for case-level access control.
 */

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const TOKEN_EXPIRY = '24h'; // Tokens expire after 24 hours
const COOKIE_NAME_PREFIX = 'case_auth_';

interface TokenPayload {
  caseId: string;
  iat: number;
  exp: number;
}

/**
 * Generate a JWT token for a specific case
 */
export function generateToken(caseId: string): string {
  return jwt.sign({ caseId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Get the cookie name for a specific case
 */
export function getCookieName(caseId: string): string {
  return `${COOKIE_NAME_PREFIX}${caseId}`;
}

/**
 * Set an authentication cookie for a case
 */
export async function setAuthCookie(caseId: string): Promise<void> {
  const token = generateToken(caseId);
  const cookieStore = await cookies();
  
  cookieStore.set(getCookieName(caseId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours in seconds
    path: '/',
  });
}

/**
 * Clear the authentication cookie for a case
 */
export async function clearAuthCookie(caseId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(getCookieName(caseId));
}

/**
 * Verify authentication for a specific case
 * Returns true if the user is authenticated for the case
 */
export async function verifyAuth(caseId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName(caseId))?.value;
  
  if (!token) {
    return false;
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    return false;
  }
  
  // Verify the token is for the correct case
  return payload.caseId === caseId;
}

/**
 * Middleware helper to check authentication and return error response if not authenticated
 * Use this in API routes that require authentication
 */
export async function requireAuth(caseId: string): Promise<NextResponse | null> {
  const isAuthenticated = await verifyAuth(caseId);
  
  if (!isAuthenticated) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  return null; // null means authenticated
}

/**
 * Check if a case has password protection disabled (empty password hash)
 * Cases without passwords are accessible without authentication
 */
export function isPasswordlessCase(passwordHash: string | null): boolean {
  return !passwordHash || passwordHash === '';
}
