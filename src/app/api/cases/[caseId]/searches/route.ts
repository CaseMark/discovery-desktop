import { NextRequest, NextResponse } from 'next/server';
import { db, searchHistory } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

// GET /api/cases/[caseId]/searches - Get recent searches for a case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
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
