import { NextRequest, NextResponse } from 'next/server';
import { db, cases, searchHistory } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// Helper to check case auth
async function checkCaseAuth(caseId: string) {
  const caseCheck = await db
    .select({ passwordHash: cases.passwordHash })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);

  if (caseCheck.length === 0) {
    return { error: 'Case not found', status: 404 };
  }

  // Require authentication unless case is passwordless
  if (!isPasswordlessCase(caseCheck[0].passwordHash)) {
    const authError = await requireAuth(caseId);
    if (authError) return { authError };
  }

  return { ok: true };
}

// GET /api/cases/[caseId]/searches/[searchId] - Get a specific search with cached results (requires authentication)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; searchId: string }> }
) {
  try {
    const { caseId, searchId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `searches:${caseId}:get`);
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

    const search = await db
      .select()
      .from(searchHistory)
      .where(and(
        eq(searchHistory.id, searchId),
        eq(searchHistory.caseId, caseId)
      ))
      .limit(1);

    if (search.length === 0) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404 }
      );
    }

    const searchRecord = search[0];
    
    // Parse cached results if available
    let cachedResults = null;
    if (searchRecord.resultsCache) {
      try {
        cachedResults = JSON.parse(searchRecord.resultsCache);
      } catch (err) {
        console.error('Failed to parse cached results:', err);
      }
    }

    return NextResponse.json({
      search: {
        id: searchRecord.id,
        caseId: searchRecord.caseId,
        query: searchRecord.query,
        resultCount: searchRecord.resultCount,
        totalResultCount: searchRecord.totalResultCount,
        relevanceThreshold: searchRecord.relevanceThreshold,
        searchedAt: searchRecord.searchedAt.toISOString(),
      },
      // Include cached results for instant loading
      cachedResults,
    });
  } catch (error) {
    console.error('Failed to fetch search:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search' },
      { status: 500 }
    );
  }
}

// PATCH /api/cases/[caseId]/searches/[searchId] - Update search cache when threshold changes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; searchId: string }> }
) {
  try {
    const { caseId, searchId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `searches:${caseId}:patch`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check authentication
    const authResult = await checkCaseAuth(caseId);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    if (authResult.authError) {
      return authResult.authError;
    }

    // Verify search exists and belongs to this case
    const existingSearch = await db
      .select()
      .from(searchHistory)
      .where(and(
        eq(searchHistory.id, searchId),
        eq(searchHistory.caseId, caseId)
      ))
      .limit(1);

    if (existingSearch.length === 0) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { relevanceThreshold, resultsCache, resultCount } = body;

    // Validate threshold
    if (relevanceThreshold !== undefined && (typeof relevanceThreshold !== 'number' || relevanceThreshold < 0 || relevanceThreshold > 100)) {
      return NextResponse.json(
        { error: 'Invalid relevance threshold' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (relevanceThreshold !== undefined) {
      updateData.relevanceThreshold = relevanceThreshold;
    }
    if (resultsCache !== undefined) {
      updateData.resultsCache = typeof resultsCache === 'string' ? resultsCache : JSON.stringify(resultsCache);
    }
    if (resultCount !== undefined) {
      updateData.resultCount = resultCount;
    }

    // Update the search record
    await db
      .update(searchHistory)
      .set(updateData)
      .where(and(
        eq(searchHistory.id, searchId),
        eq(searchHistory.caseId, caseId)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update search:', error);
    return NextResponse.json(
      { error: 'Failed to update search' },
      { status: 500 }
    );
  }
}
