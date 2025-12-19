import { NextRequest, NextResponse } from 'next/server';
import { db, cases } from '@/lib/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// POST /api/cases/[caseId]/auth - Verify password for case access
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

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

    // Verify password
    const isValid = await bcrypt.compare(password, caseData[0].passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to verify password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}
