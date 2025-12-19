'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getMimeType } from '@/lib/utils';

// More granular status for showing the pipeline steps
export type UploadStep = 'queued' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  status: UploadStep;
  progress: number;
  error?: string;
  stepMessage?: string;
  caseId: string;
}

interface UploadContextType {
  files: UploadFile[];
  uploading: boolean;
  addFiles: (newFiles: File[], caseId: string) => void;
  removeFile: (id: string) => void;
  clearCompleted: (caseId?: string) => void;
  uploadFiles: (caseId: string, vaultId: string, onComplete: () => void) => Promise<void>;
  getFilesForCase: (caseId: string) => UploadFile[];
  isUploadingForCase: (caseId: string) => boolean;
}

const UploadContext = createContext<UploadContextType | null>(null);

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingCases, setUploadingCases] = useState<Set<string>>(new Set());

  const addFiles = useCallback((newFiles: File[], caseId: string) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'queued' as const,
      progress: 0,
      stepMessage: 'Waiting to upload',
      caseId,
    }));
    setFiles(prev => [...prev, ...uploadFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearCompleted = useCallback((caseId?: string) => {
    setFiles(prev => prev.filter(f => {
      if (caseId && f.caseId !== caseId) return true;
      return f.status !== 'completed';
    }));
  }, []);

  const getFilesForCase = useCallback((caseId: string) => {
    return files.filter(f => f.caseId === caseId);
  }, [files]);

  const isUploadingForCase = useCallback((caseId: string) => {
    return uploadingCases.has(caseId);
  }, [uploadingCases]);

  // Upload a single file
  const uploadSingleFile = async (
    uploadFile: UploadFile,
    caseId: string,
    prefetchedData?: { uploadUrl: string; documentId: string }
  ): Promise<{ documentId: string; success: boolean }> => {
    try {
      let uploadUrl: string;
      let documentId: string;

      if (prefetchedData) {
        uploadUrl = prefetchedData.uploadUrl;
        documentId = prefetchedData.documentId;
        
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id 
              ? { ...f, status: 'uploading' as const, progress: 15, stepMessage: 'Uploading to cloud storage...' } 
              : f
          )
        );
      } else {
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id 
              ? { ...f, status: 'uploading' as const, progress: 5, stepMessage: 'Preparing upload...' } 
              : f
          )
        );

        const uploadResponse = await fetch(`/api/cases/${caseId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: uploadFile.file.name,
            contentType: getMimeType(uploadFile.file.name),
            sizeBytes: uploadFile.file.size,
          }),
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const data = await uploadResponse.json();
        uploadUrl = data.uploadUrl;
        documentId = data.documentId;

        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id 
              ? { ...f, progress: 15, stepMessage: 'Uploading to cloud storage...' } 
              : f
          )
        );
      }

      // Upload file directly to S3
      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        body: uploadFile.file,
        headers: {
          'Content-Type': getMimeType(uploadFile.file.name),
        },
      });

      if (!s3Response.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setFiles(prev =>
        prev.map(f =>
          f.id === uploadFile.id 
            ? { ...f, progress: 70, stepMessage: 'Upload complete. Starting processing...' } 
            : f
        )
      );

      return { documentId, success: true };
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setFiles(prev =>
        prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error' as const, error: errorMessage, stepMessage: errorMessage }
            : f
        )
      );
      return { documentId: '', success: false };
    }
  };

  // Confirm uploads using batch endpoint
  const confirmUploads = async (caseId: string, documentIds: string[], fileIds: string[]) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/documents/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        for (let i = 0; i < documentIds.length; i++) {
          const result = data.results?.find((r: { documentId: string }) => r.documentId === documentIds[i]);
          const fileId = fileIds[i];
          
          setFiles(prev =>
            prev.map(f =>
              f.id === fileId
                ? { 
                    ...f, 
                    status: 'completed' as const, 
                    progress: 100, 
                    stepMessage: result?.success 
                      ? 'Upload complete! OCR processing in background.' 
                      : 'Uploaded. Processing may be delayed.'
                  }
                : f
            )
          );
        }
      } else {
        setFiles(prev =>
          prev.map(f =>
            fileIds.includes(f.id)
              ? { ...f, status: 'completed' as const, progress: 100, stepMessage: 'Uploaded. Processing may be delayed.' }
              : f
          )
        );
      }
    } catch {
      setFiles(prev =>
        prev.map(f =>
          fileIds.includes(f.id)
            ? { ...f, status: 'completed' as const, progress: 100, stepMessage: 'Uploaded. Processing may be delayed.' }
            : f
        )
      );
    }
  };

  const uploadFiles = useCallback(async (caseId: string, vaultId: string, onComplete: () => void) => {
    const pendingFiles = files.filter(f => f.caseId === caseId && f.status === 'queued');
    if (pendingFiles.length === 0) return;

    setUploading(true);
    setUploadingCases(prev => new Set(prev).add(caseId));

    const BATCH_SIZE = 6;
    
    for (let i = 0; i < pendingFiles.length; i += BATCH_SIZE) {
      const batch = pendingFiles.slice(i, i + BATCH_SIZE);
      
      setFiles(prev =>
        prev.map(f =>
          batch.some(b => b.id === f.id)
            ? { ...f, status: 'uploading' as const, progress: 5, stepMessage: 'Preparing upload...' }
            : f
        )
      );
      
      let prefetchedUrls: Array<{ uploadUrl: string; documentId: string; filename: string; success: boolean }>;
      
      try {
        const batchResponse = await fetch(`/api/cases/${caseId}/documents`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: batch.map(f => ({
              filename: f.file.name,
              contentType: getMimeType(f.file.name),
              sizeBytes: f.file.size,
            })),
          }),
        });
        
        if (!batchResponse.ok) {
          throw new Error('Batch request failed');
        }
        
        const batchData = await batchResponse.json();
        prefetchedUrls = batchData.uploads;
        
        for (const upload of prefetchedUrls) {
          if (!upload.success) {
            const matchingFile = batch.find(f => f.file.name === upload.filename);
            if (matchingFile) {
              setFiles(prev =>
                prev.map(f =>
                  f.id === matchingFile.id
                    ? { ...f, status: 'error' as const, error: 'Failed to prepare upload', stepMessage: 'Failed to prepare upload' }
                    : f
                )
              );
            }
          }
        }
        
        prefetchedUrls = prefetchedUrls.filter(u => u.success);
      } catch (error) {
        console.warn('Batch endpoint failed, falling back to individual requests:', error);
        
        const urlPromises = batch.map(async (uploadFile) => {
          const response = await fetch(`/api/cases/${caseId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: uploadFile.file.name,
              contentType: getMimeType(uploadFile.file.name),
              sizeBytes: uploadFile.file.size,
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to get upload URL for ${uploadFile.file.name}`);
          }
          
          const data = await response.json();
          return { ...data, filename: uploadFile.file.name, success: true };
        });
        
        try {
          prefetchedUrls = await Promise.all(urlPromises);
        } catch {
          for (const uploadFile of batch) {
            setFiles(prev =>
              prev.map(f =>
                f.id === uploadFile.id
                  ? { ...f, status: 'error' as const, error: 'Failed to prepare upload', stepMessage: 'Failed to prepare upload' }
                  : f
              )
            );
          }
          continue;
        }
      }
      
      const filesToUpload = batch.filter(f => 
        prefetchedUrls.some(u => u.filename === f.file.name)
      );
      
      const uploadResults = await Promise.all(
        filesToUpload.map((uploadFile) => {
          const urlData = prefetchedUrls.find(u => u.filename === uploadFile.file.name);
          return uploadSingleFile(uploadFile, caseId, urlData);
        })
      );
      
      const successfulUploads = uploadResults
        .map((result, index) => ({ ...result, fileId: filesToUpload[index].id }))
        .filter(r => r.success);
      
      if (successfulUploads.length > 0) {
        confirmUploads(
          caseId,
          successfulUploads.map(u => u.documentId),
          successfulUploads.map(u => u.fileId)
        );
      }
    }

    setUploading(false);
    setUploadingCases(prev => {
      const next = new Set(prev);
      next.delete(caseId);
      return next;
    });
    onComplete();
  }, [files]);

  return (
    <UploadContext.Provider value={{
      files,
      uploading,
      addFiles,
      removeFile,
      clearCompleted,
      uploadFiles,
      getFilesForCase,
      isUploadingForCase,
    }}>
      {children}
    </UploadContext.Provider>
  );
}
