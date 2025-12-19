import { NextRequest, NextResponse } from 'next/server';
import { db, documents, cases } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, and } from 'drizzle-orm';

// POST /api/cases/[caseId]/documents/[documentId]/confirm - Confirm upload completed
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> }
) {
  try {
    const { caseId, documentId } = await params;

    // Get the document to find its objectId and current status
    const doc = await db
      .select({ 
        objectId: documents.objectId,
        filename: documents.filename,
        ingestionStatus: documents.ingestionStatus
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.caseId, caseId)))
      .limit(1);

    if (doc.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Skip if already processing or completed (prevent duplicate triggers)
    if (doc[0].ingestionStatus === 'processing' || doc[0].ingestionStatus === 'completed') {
      console.log(`[Ingest] Skipping ${doc[0].filename} - already ${doc[0].ingestionStatus}`);
      return NextResponse.json({ 
        success: true, 
        skipped: true,
        message: `Document already ${doc[0].ingestionStatus}`
      });
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

    // Trigger ingestion on Case.dev to start OCR processing
    const client = getCasedevClient();
    let workflowId: string | undefined;
    
    try {
      const result = await client.vault.ingest(caseData[0].vaultId, doc[0].objectId);
      workflowId = result.workflowId;
      console.log(`[Ingest] Triggered ingestion for ${doc[0].filename} (workflow: ${workflowId})`);
    } catch (ingestError) {
      // Check if it's a "already processing" type error - that's okay
      const errorMessage = ingestError instanceof Error ? ingestError.message : String(ingestError);
      
      if (errorMessage.includes('already') || errorMessage.includes('processing')) {
        console.log(`[Ingest] ${doc[0].filename} already being processed`);
      } else {
        // Real error - update status to failed and return error
        console.error(`[Ingest] Failed to trigger ingestion for ${doc[0].filename}:`, ingestError);
        
        await db
          .update(documents)
          .set({ ingestionStatus: 'failed' })
          .where(eq(documents.id, documentId));
        
        return NextResponse.json(
          { 
            error: 'Failed to start document processing',
            details: errorMessage
          },
          { status: 500 }
        );
      }
    }

    // Update document status to processing
    await db
      .update(documents)
      .set({ ingestionStatus: 'processing' })
      .where(eq(documents.id, documentId));

    return NextResponse.json({ 
      success: true,
      workflowId,
      message: `Processing started for ${doc[0].filename}`
    });
  } catch (error) {
    console.error('Failed to confirm upload:', error);
    return NextResponse.json(
      { error: 'Failed to confirm upload' },
      { status: 500 }
    );
  }
}
