import { NextRequest, NextResponse } from 'next/server';
import { db, searchHistory } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// GET /api/cases/[caseId]/searches/[searchId] - Get a specific search with cached results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; searchId: string }> }
) {
  try {
    const { caseId, searchId } = await params;

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
