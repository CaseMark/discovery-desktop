import { NextRequest, NextResponse } from 'next/server';
import { db, documents, cases } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, isPasswordlessCase } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// POST /api/cases/[caseId]/documents/confirm - Batch confirm uploads (requires authentication)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, `docs:${caseId}:confirm`);
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
    const { documentIds } = body as { documentIds: string[] };

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'documentIds array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    const MAX_BATCH_SIZE = 20;
    if (documentIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} documents` },
        { status: 400 }
      );
    }

    // Get the documents
    const docs = await db
      .select({
        id: documents.id,
        objectId: documents.objectId,
        filename: documents.filename,
        ingestionStatus: documents.ingestionStatus,
      })
      .from(documents)
      .where(and(
        inArray(documents.id, documentIds),
        eq(documents.caseId, caseId)
      ));

    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'No documents found' },
        { status: 404 }
      );
    }

    // Get the case to find the vault ID
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

    const client = getCasedevClient();
    const results: Array<{
      documentId: string;
      filename: string;
      success: boolean;
      error?: string;
      workflowId?: string;
    }> = [];

    // Trigger ingestion for all documents in parallel
    await Promise.all(
      docs.map(async (doc) => {
        // Skip if already processing or completed
        if (doc.ingestionStatus === 'processing' || doc.ingestionStatus === 'completed') {
          results.push({
            documentId: doc.id,
            filename: doc.filename,
            success: true,
            error: `Already ${doc.ingestionStatus}`,
          });
          return;
        }

        try {
          const result = await client.vault.ingest(caseData[0].vaultId, doc.objectId);
          
          // Update status to processing
          await db
            .update(documents)
            .set({ ingestionStatus: 'processing' })
            .where(eq(documents.id, doc.id));

          results.push({
            documentId: doc.id,
            filename: doc.filename,
            success: true,
            workflowId: result.workflowId,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          
          // Check if it's already processing
          if (errorMessage.includes('already') || errorMessage.includes('processing')) {
            results.push({
              documentId: doc.id,
              filename: doc.filename,
              success: true,
              error: 'Already processing',
            });
          } else {
            // Real error - mark as failed
            await db
              .update(documents)
              .set({ ingestionStatus: 'failed' })
              .where(eq(documents.id, doc.id));

            results.push({
              documentId: doc.id,
              filename: doc.filename,
              success: false,
              error: errorMessage,
            });
            
            console.error(`[Batch Ingest] Failed for ${doc.filename}:`, err);
          }
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      results,
      summary: {
        total: docs.length,
        success: successCount,
        failed: failedCount,
      },
    });
  } catch (error) {
    console.error('Failed to batch confirm uploads:', error);
    return NextResponse.json(
      { error: 'Failed to confirm uploads' },
      { status: 500 }
    );
  }
}
