import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// GET /api/cases/[caseId]/documents/[documentId]/text - Get OCR text for a document (requires authentication)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> }
) {
  try {
    const { caseId, documentId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `docs:${caseId}:${documentId}:text`);
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

    // Get the document to verify it exists and get the objectId
    const doc = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.caseId, caseId)))
      .limit(1);

    if (doc.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check if document is processed
    if (doc[0].ingestionStatus !== 'completed') {
      return NextResponse.json(
        { error: 'Document is still processing', status: doc[0].ingestionStatus },
        { status: 202 }
      );
    }

    // Get case to get vault ID
    const caseData = await db
      .select({ vaultId: cases.vaultId })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Fetch text from Case.dev
    const client = getCasedevClient();
    const textData = await client.vault.objects.getText(caseData[0].vaultId, doc[0].objectId);

    return NextResponse.json({
      objectId: textData.objectId,
      filename: textData.filename,
      text: textData.text,
      textLength: textData.textLength,
      pageCount: textData.pageCount,
    });
  } catch (error) {
    console.error('Failed to fetch document text:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document text' },
      { status: 500 }
    );
  }
}
