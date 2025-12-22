import { NextRequest, NextResponse } from 'next/server';
import { db, cases, searchHistory } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkSearchRateLimit } from '@/lib/rate-limit';

// Minimum relevance threshold (75%)
const MIN_RELEVANCE = 0.75;

// POST /api/cases/[caseId]/search - Search documents in a case (requires authentication)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Rate limit check for searches
    const rateLimitResponse = checkSearchRateLimit(request, caseId);
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

    const body = await request.json();
    const { query, method = 'hybrid', topK = 50, minRelevance = MIN_RELEVANCE, skipHistory = false } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Get case to get vault ID and name
    const caseData = await db
      .select({ vaultId: cases.vaultId, name: cases.name })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Search via Case.dev
    const client = getCasedevClient();
    const results = await client.vault.search(caseData[0].vaultId, {
      query,
      method: method as 'hybrid' | 'fast' | 'global' | 'local',
      topK,
    });

    // Filter results by minimum relevance
    const filteredChunks = results.chunks.filter(chunk => chunk.hybridScore >= minRelevance);

    // Get unique sources from filtered results
    const filteredSourceIds = new Set(filteredChunks.map(c => c.object_id));
    const filteredSources = results.sources.filter(s => filteredSourceIds.has(s.id));

    // Generate AI summaries for each chunk and overall discovery summary
    let overallSummary = '';
    const chunkSummaries: Record<string, string> = {};

    if (filteredChunks.length > 0) {
      // Build source lookup map for O(1) access
      const sourceMap = new Map(filteredSources.map(s => [s.id, s.filename]));
      
      try {
        // Prepare overall discovery summary prompt
        const sourcesSummary = filteredSources.map(s => s.filename).join(', ');
        const topExcerpts = filteredChunks.slice(0, 5).map(c => c.text.slice(0, 200)).join('\n---\n');
        
        const overallPrompt = `You are a legal discovery analyst. Based on a search for "${query}" in the case "${caseData[0].name}", analyze these findings:

Documents with relevant results: ${sourcesSummary}

Top excerpts found:
${topExcerpts}

Provide a concise 2-3 sentence summary that:
1. Identifies which documents contain relevant information
2. Explains the context and significance of these findings
3. Notes any patterns or implications for the case

Be specific and professional. Focus on what these findings reveal about the discovery.`;

        // Generate individual chunk summaries (for top 10 results)
        const chunksToSummarize = filteredChunks.slice(0, 10);
        
        // PARALLEL EXECUTION: Run overall summary and all chunk summaries concurrently
        const [overallResponse, ...chunkResults] = await Promise.all([
          // Overall summary
          client.llm.chat({
            messages: [{ role: 'user', content: overallPrompt }],
            max_tokens: 300,
            temperature: 0.3,
          }),
          // All chunk summaries in parallel
          ...chunksToSummarize.map(async (chunk) => {
            const sourceName = sourceMap.get(chunk.object_id) || 'Unknown';
            const chunkPrompt = `Summarize in 1-2 sentences the relevance of the chunk in relation to the query. Remain technical and do not use filler phrases.

Query: "${query}"

Chunk from "${sourceName}":
"${chunk.text.slice(0, 500)}"`;

            try {
              const response = await client.llm.chat({
                messages: [{ role: 'user', content: chunkPrompt }],
                max_tokens: 150,
                temperature: 0.3,
              });
              return {
                key: `${chunk.object_id}-${chunk.chunk_index}`,
                summary: response.choices[0]?.message?.content || '',
              };
            } catch (err) {
              console.error('Failed to generate chunk summary:', err);
              return { key: `${chunk.object_id}-${chunk.chunk_index}`, summary: '' };
            }
          }),
        ]);

        overallSummary = overallResponse.choices[0]?.message?.content || '';
        
        // Populate chunk summaries from parallel results
        for (const result of chunkResults) {
          if (result.summary) {
            chunkSummaries[result.key] = result.summary;
          }
        }
      } catch (err) {
        console.error('Failed to generate AI summaries:', err);
      }
    }

    // Build the response object
    const responseData = {
      method: results.method,
      query: results.query,
      chunks: filteredChunks,
      sources: filteredSources,
      response: results.response,
      overallSummary,
      chunkSummaries,
      totalBeforeFilter: results.chunks.length,
      minRelevanceApplied: minRelevance,
    };

    // Log search to history with cached results (unless skipHistory is true)
    let searchId: string | undefined;
    if (!skipHistory) {
      searchId = uuidv4();
      await db.insert(searchHistory).values({
        id: searchId,
        caseId,
        query,
        resultCount: filteredChunks.length,
        totalResultCount: results.chunks.length,
        relevanceThreshold: Math.round(minRelevance * 100),
        resultsCache: JSON.stringify(responseData), // Cache the full results
        searchedAt: new Date(),
      });
    }

    return NextResponse.json({
      searchId: searchId || null,
      ...responseData,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
