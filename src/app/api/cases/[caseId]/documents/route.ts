import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Status priority - higher number = later in workflow
// Only update local status when remote status has higher priority
const STATUS_PRIORITY: Record<string, number> = {
  'pending': 1,
  'uploading': 2,
  'processing': 3,
  'completed': 4,
  'failed': 5, // Failed is highest so we always show errors
};

function shouldUpdateStatus(localStatus: string, remoteStatus: string): boolean {
  const localPriority = STATUS_PRIORITY[localStatus] ?? 0;
  const remotePriority = STATUS_PRIORITY[remoteStatus] ?? 0;
  // Only update if remote status is further along in the workflow
  return remotePriority > localPriority;
}

// ============================================================================
// SYNC RATE LIMITING: Prevent excessive API calls to Case.dev
// Uses adaptive debouncing - shorter intervals when actively processing
// ============================================================================
const SYNC_DEBOUNCE_ACTIVE_MS = 2000; // 2 seconds when docs are processing
const SYNC_DEBOUNCE_IDLE_MS = 10000;  // 10 seconds when idle
const syncCache = new Map<string, { timestamp: number; hasProcessing: boolean }>();

// Clean up old cache entries every minute to prevent memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of syncCache) {
      if (now - entry.timestamp > 60000) {
        syncCache.delete(key);
      }
    }
  }, 60000);
}

// Invalidate cache for a case (call after uploads)
export function invalidateSyncCache(caseId: string) {
  syncCache.delete(caseId);
}

function shouldSync(caseId: string, hasProcessingDocs: boolean): boolean {
  const now = Date.now();
  const cached = syncCache.get(caseId);
  
  // Use shorter debounce when actively processing
  const debounceMs = hasProcessingDocs ? SYNC_DEBOUNCE_ACTIVE_MS : SYNC_DEBOUNCE_IDLE_MS;
  
  if (!cached || (now - cached.timestamp) > debounceMs) {
    syncCache.set(caseId, { timestamp: now, hasProcessing: hasProcessingDocs });
    return true;
  }
  return false;
}

// ============================================================================
// AI ANALYSIS TRIGGER: Generate tags and summary when documents complete
// Uses debouncing to avoid triggering multiple times during batch processing
// ============================================================================
const analysisDebounce = new Map<string, NodeJS.Timeout>();
const ANALYSIS_DEBOUNCE_MS = 5000; // Wait 5 seconds after last completion before analyzing

async function triggerAnalysisIfNeeded(caseId: string): Promise<void> {
  // Clear any existing debounce timer
  const existingTimer = analysisDebounce.get(caseId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set a new debounce timer
  const timer = setTimeout(async () => {
    analysisDebounce.delete(caseId);
    
    try {
      // Call the analyze endpoint
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/cases/${caseId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[Analysis] Generated tags for ${caseId}:`, result.tags);
      } else {
        console.error(`[Analysis] Failed for ${caseId}:`, await response.text());
      }
    } catch (error) {
      console.error(`[Analysis] Error triggering analysis for ${caseId}:`, error);
    }
  }, ANALYSIS_DEBOUNCE_MS);
  
  analysisDebounce.set(caseId, timer);
}

// GET /api/cases/[caseId]/documents - List documents in a case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    // Get case to verify it exists
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

    // Get documents from local database
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.caseId, caseId))
      .orderBy(desc(documents.uploadedAt));

    // Check if we need to sync with Case.dev
    // Sync for any document that isn't completed or failed
    const processingDocs = docs.filter(d => 
      d.ingestionStatus !== 'completed' && d.ingestionStatus !== 'failed'
    );

    // Only sync if there are processing documents AND we haven't synced recently
    // Uses adaptive debouncing - faster when processing, slower when idle
    if (processingDocs.length > 0 && shouldSync(caseId, processingDocs.length > 0)) {
      try {
        const client = getCasedevClient();
        const vaultObjects = await client.vault.objects.list(caseData[0].vaultId);
        
        let hasUpdates = false;
        
        // Update local status based on Case.dev status
        for (const doc of processingDocs) {
          const vaultObj = vaultObjects.objects.find(o => o.id === doc.objectId);
          
          if (vaultObj) {
            const remoteStatus = vaultObj.ingestionStatus || 'pending';
            const localStatus = doc.ingestionStatus;
            
            // Only update if remote status is further along OR we have new page count info
            const shouldUpdate = shouldUpdateStatus(localStatus, remoteStatus);
            const hasNewPageCount = vaultObj.pageCount && !doc.pageCount;
            
            if (shouldUpdate || hasNewPageCount) {
              const newStatus = shouldUpdate ? remoteStatus : localStatus;
              await db
                .update(documents)
                .set({
                  ingestionStatus: newStatus,
                  pageCount: vaultObj.pageCount || doc.pageCount,
                  sizeBytes: vaultObj.sizeBytes || doc.sizeBytes,
                })
                .where(eq(documents.id, doc.id));
              hasUpdates = true;
              console.log(`[Sync] Updated ${doc.filename}: ${localStatus} → ${newStatus}`);
              
              // Track if any document just completed for AI analysis trigger
              if (newStatus === 'completed' && localStatus !== 'completed') {
                // Trigger AI analysis in background (don't await)
                triggerAnalysisIfNeeded(caseId).catch(err => 
                  console.error('[Analysis] Background trigger failed:', err)
                );
              }
            }
          }
        }

        // If we had updates, re-fetch the documents
        if (hasUpdates) {
          const updatedDocs = await db
            .select()
            .from(documents)
            .where(eq(documents.caseId, caseId))
            .orderBy(desc(documents.uploadedAt));

          return NextResponse.json({
            documents: updatedDocs.map(d => ({
              ...d,
              uploadedAt: d.uploadedAt.toISOString(),
            })),
          });
        }
      } catch (err) {
        // Log but don't fail - return local data
        // Clear cache so next request retries the sync
        syncCache.delete(caseId);
        console.error('Failed to sync with Case.dev:', err);
      }
    }

    return NextResponse.json({
      documents: docs.map(d => ({
        ...d,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

// POST /api/cases/[caseId]/documents - Get upload URL for a new document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json();
    const { filename, contentType, sizeBytes } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Filename and contentType are required' },
        { status: 400 }
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

    // Get presigned upload URL from Case.dev
    // NOTE: auto_index is FALSE - we trigger ingestion explicitly in the confirm handler
    // This prevents double-processing and gives us control over the timing
    const client = getCasedevClient();
    const upload = await client.vault.upload(caseData[0].vaultId, {
      filename,
      contentType,
      auto_index: false,
    });

    // Create document record in local database
    const documentId = uuidv4();
    const now = new Date();

    await db.insert(documents).values({
      id: documentId,
      caseId,
      objectId: upload.objectId,
      filename,
      contentType,
      sizeBytes: sizeBytes || null,
      ingestionStatus: 'pending',
      uploadedAt: now,
    });

    // Invalidate sync cache so next GET triggers a fresh sync
    invalidateSyncCache(caseId);

    return NextResponse.json({
      documentId,
      objectId: upload.objectId,
      uploadUrl: upload.uploadUrl,
      expiresIn: upload.expiresIn,
    });
  } catch (error) {
    console.error('Failed to create upload URL:', error);
    return NextResponse.json(
      { error: 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}

// PUT /api/cases/[caseId]/documents - Batch get upload URLs for multiple documents
// This is more efficient than making individual POST requests for each file
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json();
    const { files } = body as { 
      files: Array<{ filename: string; contentType: string; sizeBytes?: number }> 
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'files array is required' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    const MAX_BATCH_SIZE = 20;
    if (files.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} files` },
        { status: 400 }
      );
    }

    // Validate all files have required fields
    for (const file of files) {
      if (!file.filename || !file.contentType) {
        return NextResponse.json(
          { error: 'Each file must have filename and contentType' },
          { status: 400 }
        );
      }
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

    const client = getCasedevClient();
    const now = new Date();
    
    // Process all files in parallel for maximum speed
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          // Get presigned upload URL from Case.dev
          const upload = await client.vault.upload(caseData[0].vaultId, {
            filename: file.filename,
            contentType: file.contentType,
            auto_index: false, // Trigger explicitly via confirm
          });

          // Create document record in local database
          const documentId = uuidv4();
          await db.insert(documents).values({
            id: documentId,
            caseId,
            objectId: upload.objectId,
            filename: file.filename,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes || null,
            ingestionStatus: 'pending',
            uploadedAt: now,
          });

          return {
            filename: file.filename,
            documentId,
            objectId: upload.objectId,
            uploadUrl: upload.uploadUrl,
            expiresIn: upload.expiresIn,
            success: true,
          };
        } catch (err) {
          console.error(`Failed to get upload URL for ${file.filename}:`, err);
          return {
            filename: file.filename,
            error: err instanceof Error ? err.message : 'Failed to get upload URL',
            success: false,
          };
        }
      })
    );

    // Invalidate sync cache
    invalidateSyncCache(caseId);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      uploads: results,
      summary: {
        total: files.length,
        success: successCount,
        failed: failedCount,
      },
    });
  } catch (error) {
    console.error('Failed to batch create upload URLs:', error);
    return NextResponse.json(
      { error: 'Failed to create upload URLs' },
      { status: 500 }
    );
  }
}

// PATCH /api/cases/[caseId]/documents - Retry ingestion for stuck documents
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

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

    // Get all pending/stuck documents
    const stuckDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.caseId, caseId));

    const pendingDocs = stuckDocs.filter(d => 
      d.ingestionStatus === 'pending' || d.ingestionStatus === 'processing'
    );

    if (pendingDocs.length === 0) {
      return NextResponse.json({
        message: 'No stuck documents found',
        retriedCount: 0,
      });
    }

    const client = getCasedevClient();
    let retriedCount = 0;
    const errors: string[] = [];

    // Retry ingestion for each stuck document
    for (const doc of pendingDocs) {
      try {
        await client.vault.ingest(caseData[0].vaultId, doc.objectId);
        
        // Update status to processing
        await db
          .update(documents)
          .set({ ingestionStatus: 'processing' })
          .where(eq(documents.id, doc.id));
        
        retriedCount++;
        console.log(`[Retry] Triggered ingestion for ${doc.filename}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${doc.filename}: ${errorMsg}`);
        console.error(`[Retry] Failed for ${doc.filename}:`, err);
      }
    }

    return NextResponse.json({
      message: `Retried ingestion for ${retriedCount} document(s)`,
      retriedCount,
      totalPending: pendingDocs.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to retry ingestion:', error);
    return NextResponse.json(
      { error: 'Failed to retry ingestion' },
      { status: 500 }
    );
  }
}
