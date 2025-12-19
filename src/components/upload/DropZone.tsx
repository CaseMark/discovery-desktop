'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, CloudUpload, Cpu, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { formatFileSize, isSupportedFileType } from '@/lib/utils';
import { useUpload, UploadStep } from '@/lib/upload-context';

interface DropZoneProps {
  caseId: string;
  vaultId: string;
  onUploadComplete: () => void;
}

// Step labels for the UI
const STEP_LABELS: Record<UploadStep, string> = {
  queued: 'In queue',
  uploading: 'Uploading to cloud...',
  uploaded: 'Upload complete',
  processing: 'Processing & OCR...',
  completed: 'Ready for search',
  error: 'Failed',
};

// Step indicator dot component
function StepDot({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div 
        className={`w-2 h-2 rounded-full transition-colors ${
          complete 
            ? 'bg-green-500' 
            : active 
              ? 'bg-blue-500 animate-pulse' 
              : 'bg-muted-foreground/30'
        }`} 
      />
      <span className={`text-[10px] mt-0.5 ${active || complete ? 'text-foreground' : 'text-muted-foreground/50'}`}>
        {label}
      </span>
    </div>
  );
}

export function DropZone({ caseId, vaultId, onUploadComplete }: DropZoneProps) {
  const { 
    addFiles, 
    removeFile, 
    clearCompleted, 
    uploadFiles, 
    getFilesForCase,
    isUploadingForCase 
  } = useUpload();

  const files = getFilesForCase(caseId);
  const uploading = isUploadingForCase(caseId);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const supportedFiles = acceptedFiles.filter(file => isSupportedFileType(file.name));
    const unsupportedFiles = acceptedFiles.filter(file => !isSupportedFileType(file.name));
    
    if (unsupportedFiles.length > 0) {
      console.warn('Unsupported files:', unsupportedFiles.map(f => f.name));
    }

    if (supportedFiles.length > 0) {
      addFiles(supportedFiles, caseId);
    }
  }, [addFiles, caseId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
  });

  const handleUpload = async () => {
    await uploadFiles(caseId, vaultId, onUploadComplete);
  };

  const handleClearCompleted = () => {
    clearCompleted(caseId);
  };

  const queuedCount = files.filter(f => f.status === 'queued').length;
  const uploadingCount = files.filter(f => f.status === 'uploading' || f.status === 'uploaded').length;
  const processingCount = files.filter(f => f.status === 'processing').length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const inProgressCount = uploadingCount + processingCount;

  const getStatusIcon = (status: UploadStep) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
        return <CloudUpload className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'uploaded':
        return <Cpu className="h-4 w-4 text-amber-500 animate-pulse" />;
      case 'processing':
        return <ScanText className="h-4 w-4 text-purple-500 animate-pulse" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: UploadStep): string => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'uploading': return 'text-blue-600';
      case 'uploaded': return 'text-amber-600';
      case 'processing': return 'text-purple-600';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        {isDragActive ? (
          <p className="text-lg font-medium">Drop files here...</p>
        ) : (
          <>
            <p className="text-lg font-medium mb-2">
              Drag & drop files here, or click to select
            </p>
            <p className="text-sm text-muted-foreground">
              Supports PDF, Word, TXT, and image files (JPG, PNG, TIFF)
            </p>
          </>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </h3>
                {inProgressCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {uploadingCount > 0 && `${uploadingCount} uploading`}
                    {uploadingCount > 0 && processingCount > 0 && ', '}
                    {processingCount > 0 && `${processingCount} processing`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {completedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleClearCompleted}>
                    Clear Completed
                  </Button>
                )}
                {queuedCount > 0 && (
                  <Button size="sm" onClick={handleUpload} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload {queuedCount} file{queuedCount > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                >
                  {getStatusIcon(uploadFile.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(uploadFile.file.size)}
                      </span>
                      <span className={`text-xs ${getStatusColor(uploadFile.status)}`}>
                        {uploadFile.stepMessage || STEP_LABELS[uploadFile.status]}
                      </span>
                    </div>
                    {(uploadFile.status === 'uploading' || uploadFile.status === 'uploaded' || uploadFile.status === 'processing') && (
                      <div className="mt-2">
                        <Progress value={uploadFile.progress} className="h-1.5" />
                        {/* Step indicator dots */}
                        <div className="flex items-center justify-between mt-1 px-0.5">
                          <StepDot active={true} complete={uploadFile.progress > 0} label="Upload" />
                          <div className="flex-1 h-px bg-muted-foreground/20 mx-1" />
                          <StepDot active={uploadFile.progress >= 60} complete={uploadFile.progress >= 80} label="Process" />
                          <div className="flex-1 h-px bg-muted-foreground/20 mx-1" />
                          <StepDot active={uploadFile.progress >= 80} complete={uploadFile.progress === 100} label="OCR" />
                        </div>
                      </div>
                    )}
                  </div>
                  {uploadFile.status === 'queued' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(uploadFile.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {(completedCount > 0 || errorCount > 0 || inProgressCount > 0) && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                {completedCount > 0 && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    {completedCount} ready
                  </span>
                )}
                {inProgressCount > 0 && (
                  <span className="text-blue-600 flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {inProgressCount} in progress
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errorCount} failed
                  </span>
                )}
              </div>
              {completedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Documents will appear in the Documents tab once OCR completes
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
