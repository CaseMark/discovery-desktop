import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// Helper to check auth for a case
async function checkCaseAuth(caseId: string): Promise<NextResponse | null> {
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

  return null;
}

// POST /api/cases/[caseId]/analyze - Generate AI tags and summary for a discovery (requires authentication)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `analyze:${caseId}`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check authentication
    const authError = await checkCaseAuth(caseId);
    if (authError) return authError;

    // Get the case
    const caseData = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    const caseRecord = caseData[0];
    const client = getCasedevClient();

    // Get all completed documents for this case
    const completedDocs = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.caseId, caseId),
          eq(documents.ingestionStatus, 'completed')
        )
      );

    if (completedDocs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No completed documents to analyze',
        tags: [],
        aiSummary: null,
      });
    }

    // Gather text samples from documents for analysis
    // We'll get text from up to 5 documents to keep the context manageable
    const docsToAnalyze = completedDocs.slice(0, 5);
    const textSamples: string[] = [];

    for (const doc of docsToAnalyze) {
      try {
        const textResponse = await client.vault.objects.getText(
          caseRecord.vaultId,
          doc.objectId
        );
        // Take first 2000 chars from each document
        const sample = textResponse.text.substring(0, 2000);
        textSamples.push(`[${doc.filename}]:\n${sample}`);
      } catch (err) {
        console.error(`Failed to get text for ${doc.filename}:`, err);
      }
    }

    if (textSamples.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Could not extract text from documents',
        tags: [],
        aiSummary: null,
      });
    }

    const combinedText = textSamples.join('\n\n---\n\n');
    const documentList = completedDocs.map(d => d.filename).join(', ');

    // Generate tags and summary using LLM
    const llmResponse = await client.llm.chat({
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [
        {
          role: 'system',
          content: `You are a legal document analyst. Analyze the provided discovery documents and generate:
1. A list of 3-6 concise tags that categorize the discovery (e.g., "Contract Dispute", "Employment", "Personal Injury", "Medical Records", "Deposition", "Financial Records")
2. A brief summary (3-4 sentences) of what can be gleaned about the case from these documents, using clear, precise legal language.

Respond in JSON format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "Your 3-4 sentence summary here."
}

Focus on:
- Type of legal matter
- Key parties involved (if identifiable)
- Nature of claims or issues
- Types of evidence present`
        },
        {
          role: 'user',
          content: `Discovery: "${caseRecord.name}"
${caseRecord.description ? `Description: ${caseRecord.description}` : ''}
Total documents: ${completedDocs.length}
Document names: ${documentList}

Sample content from documents:
${combinedText}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    // Parse the LLM response
    let tags: string[] = [];
    let aiSummary: string | null = null;

    try {
      const content = llmResponse.choices[0]?.message?.content || '';
      // Extract JSON from the response (handle potential markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        aiSummary = typeof parsed.summary === 'string' ? parsed.summary : null;
      }
    } catch (parseErr) {
      console.error('Failed to parse LLM response:', parseErr);
      // Try to extract any useful info even if JSON parsing fails
      const content = llmResponse.choices[0]?.message?.content || '';
      aiSummary = content.substring(0, 500);
    }

    // Update the case with tags and summary
    await db
      .update(cases)
      .set({
        tags: JSON.stringify(tags),
        aiSummary: aiSummary,
        updatedAt: new Date(),
      })
      .where(eq(cases.id, caseId));

    return NextResponse.json({
      success: true,
      tags,
      aiSummary,
    });
  } catch (error) {
    console.error('Failed to analyze discovery:', error);
    return NextResponse.json(
      { error: 'Failed to analyze discovery' },
      { status: 500 }
    );
  }
}

// GET /api/cases/[caseId]/analyze - Get current tags and summary (requires authentication)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `analyze:${caseId}:get`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check authentication
    const authError = await checkCaseAuth(caseId);
    if (authError) return authError;

    const caseData = await db
      .select({
        tags: cases.tags,
        aiSummary: cases.aiSummary,
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

    const tags = caseData[0].tags ? JSON.parse(caseData[0].tags) : [];

    return NextResponse.json({
      tags,
      aiSummary: caseData[0].aiSummary,
    });
  } catch (error) {
    console.error('Failed to get analysis:', error);
    return NextResponse.json(
      { error: 'Failed to get analysis' },
      { status: 500 }
    );
  }
}
