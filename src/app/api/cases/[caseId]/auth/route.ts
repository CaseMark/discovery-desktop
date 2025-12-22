import { NextRequest, NextResponse } from 'next/server';
import { db, cases } from '@/lib/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { setAuthCookie, clearAuthCookie, verifyAuth, isPasswordlessCase } from '@/lib/auth';
import { checkAuthRateLimit } from '@/lib/rate-limit';

// POST /api/cases/[caseId]/auth - Verify password and issue auth cookie
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    
    // Rate limit check - prevent brute force attacks
    const rateLimitResponse = checkAuthRateLimit(request, caseId);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    const body = await request.json();
    const { password } = body;

    // Get case with password hash
    const caseData = await db
      .select({
        id: cases.id,
        passwordHash: cases.passwordHash,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Check if case has no password (passwordless access)
    if (isPasswordlessCase(caseData[0].passwordHash)) {
      // Issue auth cookie for passwordless case
      await setAuthCookie(caseId);
      return NextResponse.json({ success: true, passwordless: true });
    }

    // Password is required for protected cases
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, caseData[0].passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Issue auth cookie on successful authentication
    await setAuthCookie(caseId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to verify password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[caseId]/auth - Logout (clear auth cookie)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    
    // Clear the auth cookie
    await clearAuthCookie(caseId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to logout:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}

// GET /api/cases/[caseId]/auth - Check if authenticated
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    
    // First check if case exists and if it requires password
    const caseData = await db
      .select({
        id: cases.id,
        passwordHash: cases.passwordHash,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Check if case is passwordless
    const passwordless = isPasswordlessCase(caseData[0].passwordHash);
    
    // If passwordless, auto-authenticate
    if (passwordless) {
      await setAuthCookie(caseId);
      return NextResponse.json({ 
        authenticated: true, 
        passwordless: true 
      });
    }
    
    // Check if user has valid auth cookie
    const isAuthenticated = await verifyAuth(caseId);
    
    return NextResponse.json({ 
      authenticated: isAuthenticated,
      passwordless: false,
    });
  } catch (error) {
    console.error('Failed to check auth status:', error);
    return NextResponse.json(
      { error: 'Failed to check auth status' },
      { status: 500 }
    );
  }
}
