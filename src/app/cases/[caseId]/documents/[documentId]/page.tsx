'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface DocumentData {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  pageCount: number | null;
  ingestionStatus: string;
  uploadedAt: string;
  objectId: string;
}

interface DocumentText {
  text: string;
  textLength?: number;
  pageCount?: number;
}

export default function DocumentViewer({ 
  params 
}: { 
  params: Promise<{ caseId: string; documentId: string }> 
}) {
  const { caseId, documentId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [documentText, setDocumentText] = useState<DocumentText | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  
  const contentRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLElement | null>(null);

  // Get segment text from URL params (the chunk to highlight)
  const segmentText = searchParams.get('segment') || '';
  // Get the search ID to navigate back to search results
  const fromSearchId = searchParams.get('from') || '';
  
  // Determine back navigation URL
  const backUrl = fromSearchId 
    ? `/cases/${caseId}/search/${fromSearchId}` 
    : `/cases/${caseId}?tab=searches`;

  useEffect(() => {
    // Check authentication
    if (typeof window !== 'undefined') {
      const isAuthenticated = sessionStorage.getItem(`case_${caseId}`) === 'authenticated';
      if (!isAuthenticated) {
        router.push('/');
        return;
      }
    }
    fetchDocument();
  }, [caseId, documentId, router]);

  // Scroll to highlighted segment when document loads
  useEffect(() => {
    if (documentText && segmentText && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [documentText, segmentText]);

  const fetchDocument = async () => {
    try {
      // Fetch document metadata
      const metaResponse = await fetch(`/api/cases/${caseId}/documents/${documentId}`);
      if (!metaResponse.ok) {
        if (metaResponse.status === 404) {
          setError('Document not found');
        } else {
          setError('Failed to load document');
        }
        setLoading(false);
        return;
      }
      const metaData = await metaResponse.json();
      setDocument(metaData.document);

      // Fetch document text
      const textResponse = await fetch(`/api/cases/${caseId}/documents/${documentId}/text`);
      if (textResponse.ok) {
        const textData = await textResponse.json();
        setDocumentText(textData);
      } else if (textResponse.status === 404) {
        // Document text not available yet (still processing)
        setDocumentText(null);
      }
    } catch (err) {
      console.error('Failed to fetch document:', err);
      setError('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  // Render text with inline highlighting that doesn't break formatting
  const renderHighlightedText = (text: string) => {
    // If there's a segment to highlight, find and highlight it inline
    if (segmentText && !localSearch) {
      // Normalize whitespace for matching
      const normalizedText = text.replace(/\s+/g, ' ');
      const normalizedSegment = segmentText.replace(/\s+/g, ' ').trim();
      
      // Find the segment in the text (case-insensitive)
      const lowerText = normalizedText.toLowerCase();
      const lowerSegment = normalizedSegment.toLowerCase();
      let segmentIndex = lowerText.indexOf(lowerSegment);
      
      // If exact match not found, try partial match (first 100 chars)
      if (segmentIndex === -1) {
        const partialSegment = lowerSegment.slice(0, 100);
        segmentIndex = lowerText.indexOf(partialSegment);
      }
      
      if (segmentIndex !== -1) {
        // Calculate the actual end position
        const matchLength = Math.min(normalizedSegment.length, text.length - segmentIndex);
        
        // Split text into before, segment, and after
        const before = text.slice(0, segmentIndex);
        const matched = text.slice(segmentIndex, segmentIndex + matchLength);
        const after = text.slice(segmentIndex + matchLength);
        
        return (
          <span className="whitespace-pre-wrap">
            <span>{before}</span>
            <span
              ref={(el) => { highlightRef.current = el; }}
              className="bg-yellow-200 dark:bg-yellow-800/50 scroll-mt-32"
            >
              {matched}
            </span>
            <span>{after}</span>
          </span>
        );
      }
    }
    
    // If there's a local search, highlight matching words inline
    if (localSearch) {
      const words = localSearch.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      
      if (words.length === 0) {
        return <span className="whitespace-pre-wrap">{text}</span>;
      }

      // Create regex pattern for all words
      const pattern = new RegExp(`(${words.map((w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
      const parts = text.split(pattern);
      
      let matchCount = 0;

      return (
        <span className="whitespace-pre-wrap">
          {parts.map((part, index) => {
            const isMatch = words.some((w: string) => part.toLowerCase() === w.toLowerCase());
            if (isMatch) {
              const isFirstMatch = matchCount === 0;
              matchCount++;
              return (
                <span
                  key={index}
                  ref={isFirstMatch ? (el) => { highlightRef.current = el; } : undefined}
                  className="bg-yellow-200 dark:bg-yellow-800/50 scroll-mt-32"
                >
                  {part}
                </span>
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </span>
      );
    }
    
    // No highlighting
    return <span className="whitespace-pre-wrap">{text}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error || 'Document not found'}</h2>
            <Link href={`/cases/${caseId}`}>
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Case
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={backUrl}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <div>
                  <h1 className="text-lg font-semibold">{document.filename}</h1>
                  <p className="text-sm text-muted-foreground">
                    {document.pageCount ? `${document.pageCount} pages • ` : ''}
                    {document.ingestionStatus === 'completed' ? 'OCR Complete' : document.ingestionStatus}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Local search within document */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in document..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Segment highlight indicator */}
      {segmentText && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border-b px-4 py-2">
          <div className="container mx-auto flex items-center gap-2">
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              Scrolled to relevant section from search results
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => router.push(`/cases/${caseId}/documents/${documentId}`)}
            >
              Clear highlight
            </Button>
          </div>
        </div>
      )}

      {/* Document Content - Full scrollable document */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {document.ingestionStatus !== 'completed' ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
              <h2 className="text-xl font-semibold mb-2">Document Processing</h2>
              <p className="text-muted-foreground">
                This document is still being processed. OCR text will be available once processing is complete.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Status: <span className="capitalize">{document.ingestionStatus}</span>
              </p>
            </CardContent>
          </Card>
        ) : documentText ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Document Text</span>
                <span className="text-muted-foreground font-normal">
                  {(documentText.textLength || documentText.text?.length || 0).toLocaleString()} characters
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6" ref={contentRef}>
              <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-sm leading-relaxed">
                {renderHighlightedText(documentText.text)}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Text Available</h2>
              <p className="text-muted-foreground">
                The OCR text for this document is not available yet.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
