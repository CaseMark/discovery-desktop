import { NextRequest, NextResponse } from 'next/server';
import { db, cases, searchHistory } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// GET /api/cases/[caseId]/searches - Get recent searches for a case (requires authentication)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `searches:${caseId}:list`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check authentication
    const caseCheck = await db
      .select({ passwordHash: cases.passwordHash })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseCheck.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Require authentication unless case is passwordless
    if (!isPasswordlessCase(caseCheck[0].passwordHash)) {
      const authError = await requireAuth(caseId);
      if (authError) return authError;
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Get recent searches ordered by date
    const searches = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.caseId, caseId))
      .orderBy(desc(searchHistory.searchedAt))
      .limit(limit);

    return NextResponse.json({
      searches: searches.map(s => ({
        ...s,
        searchedAt: s.searchedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch searches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch searches' },
      { status: 500 }
    );
  }
}
