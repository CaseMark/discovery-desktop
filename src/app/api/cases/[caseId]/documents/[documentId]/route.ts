import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, and } from 'drizzle-orm';

// Status priority for determining if we should update local status
const STATUS_PRIORITY: Record<string, number> = {
  'pending': 1,
  'uploading': 2,
  'processing': 3,
  'completed': 4,
  'failed': 5,
};

// PATCH /api/cases/[caseId]/documents/[documentId] - Retry ingestion for a single document
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> }
) {
  try {
    const { caseId, documentId } = await params;

    // Get the document
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

    // Trigger ingestion on Case.dev
    const client = getCasedevClient();
    const result = await client.vault.ingest(caseData[0].vaultId, doc[0].objectId);
    
    console.log(`[Retry] Triggered ingestion for ${doc[0].filename}: ${result.status}`);

    // Update local status to processing
    await db
      .update(documents)
      .set({ ingestionStatus: 'processing' })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      message: `Ingestion retry triggered for "${doc[0].filename}"`,
      workflowId: result.workflowId,
      status: result.status,
    });
  } catch (error) {
    console.error('Failed to retry document ingestion:', error);
    return NextResponse.json(
      { error: 'Failed to retry ingestion' },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[caseId]/documents/[documentId] - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> }
) {
  try {
    const { caseId, documentId } = await params;

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

    // Delete from Case.dev vault (if objectId exists)
    if (doc[0].objectId) {
      try {
        const client = getCasedevClient();
        await client.vault.objects.delete(caseData[0].vaultId, doc[0].objectId);
        console.log(`[Delete] Removed ${doc[0].filename} from Case.dev vault`);
      } catch (err) {
        // Log but continue - we still want to delete from local DB
        // The object might not exist in the vault (e.g., upload failed)
        console.warn(`[Delete] Failed to delete from Case.dev vault:`, err);
      }
    }

    // Delete from local database
    await db
      .delete(documents)
      .where(eq(documents.id, documentId));

    console.log(`[Delete] Removed ${doc[0].filename} from local database`);

    return NextResponse.json({
      success: true,
      message: `Document "${doc[0].filename}" deleted successfully`,
    });
  } catch (error) {
    console.error('Failed to delete document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}

// GET /api/cases/[caseId]/documents/[documentId] - Get a single document
// Query param: ?sync=true to force sync status with Case.dev
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string; documentId: string }> }
) {
  try {
    const { caseId, documentId } = await params;
    const { searchParams } = new URL(request.url);
    const shouldSyncStatus = searchParams.get('sync') === 'true';

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

    let document = doc[0];

    // If document is still processing and sync requested, check Case.dev for latest status
    if (shouldSyncStatus && 
        document.ingestionStatus !== 'completed' && 
        document.ingestionStatus !== 'failed') {
      try {
        const caseData = await db
          .select({ vaultId: cases.vaultId })
          .from(cases)
          .where(eq(cases.id, caseId))
          .limit(1);

        if (caseData.length > 0) {
          const client = getCasedevClient();
          const vaultObject = await client.vault.objects.get(
            caseData[0].vaultId, 
            document.objectId
          );

          // Update local status if changed
          if (vaultObject.ingestionStatus !== document.ingestionStatus ||
              (vaultObject.pageCount && !document.pageCount)) {
            await db
              .update(documents)
              .set({
                ingestionStatus: vaultObject.ingestionStatus,
                pageCount: vaultObject.pageCount || document.pageCount,
                sizeBytes: vaultObject.sizeBytes || document.sizeBytes,
              })
              .where(eq(documents.id, documentId));
            
            document = {
              ...document,
              ingestionStatus: vaultObject.ingestionStatus,
              pageCount: vaultObject.pageCount || document.pageCount,
              sizeBytes: vaultObject.sizeBytes || document.sizeBytes,
            };
            
            console.log(`[Sync] Updated ${document.filename}: ${doc[0].ingestionStatus} → ${vaultObject.ingestionStatus}`);
          }
        }
      } catch (syncError) {
        console.warn(`[Sync] Failed to sync status for ${document.filename}:`, syncError);
        // Continue with local data
      }
    }

    return NextResponse.json({
      document: {
        ...document,
        uploadedAt: document.uploadedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to fetch document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}
