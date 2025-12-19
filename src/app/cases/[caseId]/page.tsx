'use client';

import { useState, useEffect, useRef, useCallback, use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  Search,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  CloudUpload,
  Cpu,
  RefreshCw,
  Trash2,
  History,
  Filter,
  Settings2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatFileSize } from '@/lib/utils';
import { DropZone } from '@/components/upload/DropZone';
import { useUpload } from '@/lib/upload-context';

interface CaseData {
  id: string;
  name: string;
  description: string | null;
  vaultId: string;
  documentCount: number;
  createdAt: string;
}

interface AnalysisData {
  tags: string[];
  aiSummary: string | null;
}

interface Document {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  pageCount: number | null;
  ingestionStatus: string;
  uploadedAt: string;
  objectId?: string;
}

interface RecentSearch {
  id: string;
  query: string;
  resultCount: number | null;
  totalResultCount: number | null;
  relevanceThreshold: number | null;
  searchedAt: string;
}

// Processing step indicator component
function ProcessingStep({ 
  icon, 
  label, 
  count, 
  total, 
  color, 
  active = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  count: number; 
  total: number; 
  color: 'blue' | 'amber' | 'green';
  active?: boolean;
}) {
  const colorClasses = {
    blue: active ? 'text-blue-600 bg-blue-100 dark:bg-blue-900' : 'text-blue-500',
    amber: active ? 'text-amber-600 bg-amber-100 dark:bg-amber-900' : 'text-amber-500',
    green: active ? 'text-green-600 bg-green-100 dark:bg-green-900' : 'text-green-500',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${active ? colorClasses[color] : ''}`}>
      <span className={colorClasses[color]}>{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

export default function CaseDashboard({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Initialize activeTab from URL query parameter
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam && ['documents', 'upload', 'searches'].includes(tabParam) ? tabParam : 'documents';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [showSearchSettings, setShowSearchSettings] = useState(false);
  const [relevanceThreshold, setRelevanceThreshold] = useState(75);
  const [searchMethod, setSearchMethod] = useState<'hybrid' | 'fast' | 'global' | 'local'>('hybrid');
  const [hoveredMethod, setHoveredMethod] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check authentication
    if (typeof window !== 'undefined') {
      const isAuthenticated = sessionStorage.getItem(`case_${caseId}`) === 'authenticated';
      if (!isAuthenticated) {
        router.push('/');
        return;
      }
    }
    // PARALLEL: Fetch all data concurrently for faster page load
    Promise.all([fetchCaseData(), fetchDocuments(), fetchRecentSearches(), fetchAnalysis()]);
  }, [caseId, router]);

  // Handler to clear auth when navigating back to home
  const handleBackToHome = () => {
    sessionStorage.removeItem(`case_${caseId}`);
  };

  // Poll for document status updates when there are processing documents
  // Uses exponential backoff: starts at 2s, maxes at 15s, resets on status change
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const documentsRef = useRef(documents);
  const pollIntervalRef = useRef(2000); // Start at 2 seconds
  const lastStatusHashRef = useRef('');
  
  const MIN_POLL_INTERVAL = 2000;  // 2 seconds minimum
  const MAX_POLL_INTERVAL = 15000; // 15 seconds maximum
  const BACKOFF_FACTOR = 1.5;      // Increase by 50% each unchanged poll
  
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    let isMounted = true;

    const pollDocuments = async () => {
      const hasProcessingDocs = documentsRef.current.some(
        d => d.ingestionStatus === 'processing' || d.ingestionStatus === 'pending'
      );
      
      if (!hasProcessingDocs || !isMounted) {
        pollingRef.current = null;
        pollIntervalRef.current = MIN_POLL_INTERVAL; // Reset interval
        return;
      }
      
      try {
        const response = await fetch(`/api/cases/${caseId}/documents`);
        if (response.ok && isMounted) {
          const data = await response.json();
          
          // Check if any status changed (to adjust backoff)
          const currentStatusHash = data.documents
            .map((d: Document) => `${d.id}:${d.ingestionStatus}`)
            .join('|');
          
          const statusChanged = currentStatusHash !== lastStatusHashRef.current;
          lastStatusHashRef.current = currentStatusHash;
          
          if (statusChanged) {
            // Status changed! Reset to fast polling
            pollIntervalRef.current = MIN_POLL_INTERVAL;
            console.log('[Poll] Status changed, resetting to fast polling');
          } else {
            // No change - apply exponential backoff
            pollIntervalRef.current = Math.min(
              pollIntervalRef.current * BACKOFF_FACTOR,
              MAX_POLL_INTERVAL
            );
          }
          
          setDocuments(data.documents);
          documentsRef.current = data.documents;
          
          const stillProcessing = data.documents.some(
            (d: Document) => d.ingestionStatus === 'processing' || d.ingestionStatus === 'pending'
          );
          
          if (stillProcessing && isMounted) {
            pollingRef.current = setTimeout(pollDocuments, pollIntervalRef.current);
          } else {
            pollingRef.current = null;
            pollIntervalRef.current = MIN_POLL_INTERVAL; // Reset for next time
          }
        }
      } catch (err) {
        console.error('Failed to poll documents:', err);
        if (isMounted) {
          // On error, use max interval to reduce load
          pollingRef.current = setTimeout(pollDocuments, MAX_POLL_INTERVAL);
        }
      }
    };

    const startPolling = () => {
      if (pollingRef.current) return;
      
      const hasProcessingDocs = documentsRef.current.some(
        d => d.ingestionStatus === 'processing' || d.ingestionStatus === 'pending'
      );
      
      if (hasProcessingDocs) {
        pollIntervalRef.current = MIN_POLL_INTERVAL; // Reset on start
        pollingRef.current = setTimeout(pollDocuments, MIN_POLL_INTERVAL);
      }
    };

    const initialCheck = setTimeout(startPolling, 1000);
    
    return () => {
      isMounted = false;
      clearTimeout(initialCheck);
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [caseId]);

  const triggerPolling = useCallback(() => {
    if (pollingRef.current) return;
    
    const hasProcessingDocs = documentsRef.current.some(
      d => d.ingestionStatus === 'processing' || d.ingestionStatus === 'pending'
    );
    
    if (hasProcessingDocs) {
      // Reset to fast polling when triggered manually (e.g., after upload)
      pollIntervalRef.current = MIN_POLL_INTERVAL;
      lastStatusHashRef.current = ''; // Force status check
      
      const poll = async () => {
        try {
          const response = await fetch(`/api/cases/${caseId}/documents`);
          if (response.ok) {
            const data = await response.json();
            
            // Check for status changes
            const currentStatusHash = data.documents
              .map((d: Document) => `${d.id}:${d.ingestionStatus}`)
              .join('|');
            
            const statusChanged = currentStatusHash !== lastStatusHashRef.current;
            lastStatusHashRef.current = currentStatusHash;
            
            if (statusChanged) {
              pollIntervalRef.current = MIN_POLL_INTERVAL;
            } else {
              pollIntervalRef.current = Math.min(
                pollIntervalRef.current * BACKOFF_FACTOR,
                MAX_POLL_INTERVAL
              );
            }
            
            setDocuments(data.documents);
            documentsRef.current = data.documents;
            
            const stillProcessing = data.documents.some(
              (d: Document) => d.ingestionStatus === 'processing' || d.ingestionStatus === 'pending'
            );
            
            if (stillProcessing) {
              pollingRef.current = setTimeout(poll, pollIntervalRef.current);
            } else {
              pollingRef.current = null;
              pollIntervalRef.current = MIN_POLL_INTERVAL;
            }
          } else if (response.status === 404) {
            // Case was deleted, stop polling
            pollingRef.current = null;
          }
        } catch (err) {
          // Network error or case deleted - stop polling silently
          console.error('Polling stopped:', err);
          pollingRef.current = null;
        }
      };
      
      pollingRef.current = setTimeout(poll, MIN_POLL_INTERVAL);
    }
  }, [caseId]);

  const fetchCaseData = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}`);
      if (response.ok) {
        const data = await response.json();
        setCaseData(data.case);
      } else if (response.status === 404) {
        router.push('/');
      }
    } catch (err) {
      console.error('Failed to fetch case:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchRecentSearches = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/searches?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setRecentSearches(data.searches);
      }
    } catch (err) {
      console.error('Failed to fetch recent searches:', err);
    }
  };

  const fetchAnalysis = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/analyze`);
      if (response.ok) {
        const data = await response.json();
        setAnalysisData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analysis:', err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !caseData) return;

    setSearching(true);

    try {
      const response = await fetch(`/api/cases/${caseId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: searchQuery,
          method: searchMethod,
          minRelevance: relevanceThreshold / 100,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Navigate to the search results page
        router.push(`/cases/${caseId}/search/${data.searchId}`);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleUploadComplete = async () => {
    await fetchDocuments();
    await fetchCaseData();
    triggerPolling();
  };

  const [retrying, setRetrying] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const [deletingDocIds, setDeletingDocIds] = useState<Set<string>>(new Set());

  const handleDeleteDocument = async (documentId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    // Add to deleting set
    setDeletingDocIds(prev => new Set(prev).add(documentId));
    
    try {
      const response = await fetch(`/api/cases/${caseId}/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDocuments(prev => prev.filter(d => d.id !== documentId));
        documentsRef.current = documentsRef.current.filter(d => d.id !== documentId);
        // Don't await - let it update in background
        fetchCaseData();
      } else {
        const error = await response.json();
        alert(`Failed to delete "${filename}": ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert(`Failed to delete "${filename}". Please try again.`);
    } finally {
      // Remove from deleting set
      setDeletingDocIds(prev => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  };

  const handleRetryProcessing = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/documents`, {
        method: 'PATCH',
      });
      
      if (response.ok) {
        await fetchDocuments();
        triggerPolling();
      }
    } catch (err) {
      console.error('Failed to retry processing:', err);
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryDocument = async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setRetryingDocId(documentId);
    try {
      const response = await fetch(`/api/cases/${caseId}/documents/${documentId}`, {
        method: 'PATCH',
      });
      
      if (response.ok) {
        // Update local state to show processing
        setDocuments(prev => prev.map(d => 
          d.id === documentId ? { ...d, ingestionStatus: 'processing' } : d
        ));
        documentsRef.current = documentsRef.current.map(d => 
          d.id === documentId ? { ...d, ingestionStatus: 'processing' } : d
        );
        triggerPolling();
      } else {
        const error = await response.json();
        alert(`Failed to retry: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to retry document:', err);
      alert('Failed to retry document. Please try again.');
    } finally {
      setRetryingDocId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Sort documents alphabetically by filename
  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => 
      a.filename.toLowerCase().localeCompare(b.filename.toLowerCase())
    );
  }, [documents]);

  // Document status counts
  const pendingCount = documents.filter(d => d.ingestionStatus === 'pending').length;
  const processingCount = documents.filter(d => d.ingestionStatus === 'processing').length;
  const totalProcessingCount = pendingCount + processingCount;
  const completedCount = documents.filter(d => d.ingestionStatus === 'completed').length;
  const processingProgress = documents.length > 0 ? (completedCount / documents.length) * 100 : 0;

  // Upload context for showing upload indicator
  const { getFilesForCase, isUploadingForCase } = useUpload();
  const uploadFiles = getFilesForCase(caseId);
  const isUploading = isUploadingForCase(caseId);
  const uploadingFileCount = uploadFiles.filter(f => f.status === 'uploading' || f.status === 'queued').length;
  const hasActiveUploads = isUploading || uploadingFileCount > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" onClick={handleBackToHome}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">{caseData.name}</h1>
                {caseData.description && (
                  <p className="text-sm text-muted-foreground">{caseData.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {documents.length} documents
              </span>
            </div>
          </div>

          {/* Search Bar with Settings */}
          <form onSubmit={handleSearch} className="mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents by meaning... (e.g., 'settlement negotiations before March')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowSearchSettings(!showSearchSettings)}
                className={showSearchSettings ? 'bg-muted' : ''}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button type="submit" disabled={searching || !searchQuery.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>
            
            {/* Search Settings Panel */}
            {showSearchSettings && (
              <div className="mt-3 p-4 bg-muted/50 rounded-lg border space-y-4">
                {/* Search Method Selector */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Search Method</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { 
                        value: 'hybrid', 
                        label: 'Hybrid', 
                        description: 'Combines semantic understanding with keyword matching for the best overall results. Recommended for most searches.' 
                      },
                      { 
                        value: 'fast', 
                        label: 'Fast', 
                        description: 'Optimized for speed using efficient keyword-based search. Best for quick lookups when you know exact terms.' 
                      },
                      { 
                        value: 'global', 
                        label: 'Global', 
                        description: 'Searches across entire documents for broad context. Best for finding themes and concepts that span multiple sections.' 
                      },
                      { 
                        value: 'local', 
                        label: 'Local', 
                        description: 'Focuses on specific passages and precise matches. Best for finding exact quotes or specific details.' 
                      },
                    ] as const).map((method) => (
                      <div 
                        key={method.value}
                        className="relative"
                        onMouseEnter={() => {
                          setHoveredMethod(method.value);
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                          }
                          hoverTimeoutRef.current = setTimeout(() => {
                            setShowTooltip(true);
                          }, 1000);
                        }}
                        onMouseLeave={() => {
                          setHoveredMethod(null);
                          setShowTooltip(false);
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                          }
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSearchMethod(method.value)}
                          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                            searchMethod === method.value
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted border-border'
                          }`}
                        >
                          {method.label}
                        </button>
                        {/* Tooltip */}
                        {hoveredMethod === method.value && showTooltip && (
                          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg border animate-in fade-in-0 zoom-in-95">
                            <div className="font-medium mb-1">{method.label} Search</div>
                            <p className="text-muted-foreground">{method.description}</p>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-popover border-r border-b" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Relevance Threshold */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Relevance Threshold</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={relevanceThreshold}
                      onChange={(e) => setRelevanceThreshold(parseInt(e.target.value))}
                      className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <span className="text-sm font-mono w-12 text-right">{relevanceThreshold}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only show results with relevance score above this threshold. Higher values = more precise results.
                </p>
              </div>
            )}
          </form>
        </div>
      </header>

      {/* Deletion Status Bar */}
      {deletingDocIds.size > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 border-b px-4 py-3">
          <div className="container mx-auto">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900">
                <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Deleting {deletingDocIds.size} document{deletingDocIds.size > 1 ? 's' : ''}...
                </span>
              </div>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                Please wait while documents are being removed
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Processing Status Bar */}
      {totalProcessingCount > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-b px-4 py-4">
          <div className="container mx-auto">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {totalProcessingCount} document{totalProcessingCount > 1 ? 's' : ''} processing
                </span>
              </div>
              {pendingCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetryProcessing}
                  disabled={retrying}
                  className="text-xs"
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry Processing
                    </>
                  )}
                </Button>
              )}
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {completedCount} / {documents.length} complete
              </span>
            </div>
            
            <div className="mt-3 flex items-center gap-3">
              <ProcessingStep 
                icon={<CloudUpload className="h-4 w-4" />}
                label="Uploaded"
                count={pendingCount}
                total={documents.length}
                color="blue"
                active={pendingCount > 0}
              />
              <div className="h-px flex-1 bg-muted-foreground/20" />
              <ProcessingStep 
                icon={<Cpu className="h-4 w-4" />}
                label="Processing"
                count={processingCount}
                total={documents.length}
                color="amber"
                active={processingCount > 0}
              />
              <div className="h-px flex-1 bg-muted-foreground/20" />
              <ProcessingStep 
                icon={<CheckCircle className="h-4 w-4" />}
                label="Complete"
                count={completedCount}
                total={documents.length}
                color="green"
              />
            </div>
            
            <Progress value={processingProgress} className="h-2 mt-3" />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* AI Summary Section */}
        {analysisData?.aiSummary && (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/50 dark:to-blue-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                  AI Case Summary
                </h3>
                <p className="text-sm text-purple-800 dark:text-purple-200 leading-relaxed">
                  {analysisData.aiSummary}
                </p>
              </div>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="upload">
              {hasActiveUploads ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin text-blue-500" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload
              {hasActiveUploads && (
                <span className="ml-2 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs">
                  {uploadingFileCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="searches">
              <History className="h-4 w-4 mr-2" />
              Recent Searches
              {recentSearches.length > 0 && (
                <span className="ml-2 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
                  {recentSearches.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-6">
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No documents yet</h2>
                <p className="text-muted-foreground mb-4">
                  Upload documents to start searching.
                </p>
                <Button onClick={() => setActiveTab('upload')}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Documents
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Retry All Button - shown when there are non-completed documents */}
                {documents.some(d => d.ingestionStatus !== 'completed') && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div className="text-sm text-muted-foreground">
                      {documents.filter(d => d.ingestionStatus !== 'completed').length} document(s) not yet completed
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRetryProcessing}
                      disabled={retrying}
                    >
                      {retrying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Retrying All...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry All Processing
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                <div className="grid gap-3">
                  {sortedDocuments.map((doc) => (
                    <Card key={doc.id} className="hover:shadow-sm transition-shadow group">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <div>
                              <h3 className="font-medium">{doc.filename}</h3>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                {doc.sizeBytes && <span>{formatFileSize(doc.sizeBytes)}</span>}
                                {doc.pageCount && <span>{doc.pageCount} pages</span>}
                                <span>Uploaded {formatDate(doc.uploadedAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(doc.ingestionStatus)}
                              <span className="text-sm capitalize">{doc.ingestionStatus}</span>
                            </div>
                            {/* Retry button for non-completed documents */}
                            {doc.ingestionStatus !== 'completed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={(e) => handleRetryDocument(doc.id, e)}
                                disabled={retryingDocId === doc.id}
                                title="Retry processing"
                              >
                                {retryingDocId === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 transition-opacity text-muted-foreground hover:text-destructive ${
                                deletingDocIds.has(doc.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                              disabled={deletingDocIds.has(doc.id)}
                              title="Delete document"
                            >
                              {deletingDocIds.has(doc.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-6">
            <DropZone
              caseId={caseId}
              vaultId={caseData.vaultId}
              onUploadComplete={handleUploadComplete}
            />
          </TabsContent>

          <TabsContent value="searches" className="mt-6">
            {recentSearches.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No searches yet</h2>
                <p className="text-muted-foreground mb-4">
                  Use the search bar above to search your documents.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {recentSearches.map((search) => (
                  <Link 
                    key={search.id} 
                    href={`/cases/${caseId}/search/${search.id}`}
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Search className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <h3 className="font-medium">&quot;{search.query}&quot;</h3>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(search.searchedAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-right">
                              <div className="font-medium text-primary">
                                {search.resultCount ?? 0} results
                              </div>
                              {search.totalResultCount !== null && search.totalResultCount > (search.resultCount ?? 0) && (
                                <div className="text-xs text-muted-foreground">
                                  {search.totalResultCount} total
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Filter className="h-3 w-3" />
                              <span className="text-xs">{search.relevanceThreshold ?? 75}%</span>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
