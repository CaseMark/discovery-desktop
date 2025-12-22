'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { FileText, Download, ChevronDown, ChevronUp, Sparkles, ExternalLink, Filter, Settings2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface SearchChunk {
  text: string;
  object_id: string;
  chunk_index: number;
  hybridScore: number;
  vectorScore: number;
  bm25Score: number;
}

interface SearchSource {
  id: string;
  filename: string;
  pageCount?: number;
}

interface SearchResultsProps {
  results: {
    method: string;
    query: string;
    chunks: SearchChunk[];
    sources: SearchSource[];
    response?: string;
    overallSummary?: string;
    chunkSummaries?: Record<string, string>;
    totalBeforeFilter?: number;
    minRelevanceApplied?: number;
  };
  query: string;
  documents: Array<{
    id: string;
    filename: string;
    objectId?: string;
  }>;
  caseId: string;
  searchId?: string;
  onRetryWithThreshold?: (threshold: number) => void;
  currentThreshold?: number;
}

export function SearchResults({ 
  results, 
  query, 
  documents, 
  caseId,
  searchId,
  onRetryWithThreshold,
  currentThreshold = 75,
}: SearchResultsProps) {
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [showThresholdOptions, setShowThresholdOptions] = useState(false);
  const [sliderThreshold, setSliderThreshold] = useState(currentThreshold > 0 ? currentThreshold - 25 : 0);

  // OPTIMIZATION: Pre-compute lookup maps for O(1) access instead of O(n) find() calls
  const sourceMap = useMemo(() => 
    new Map(results.sources.map(s => [s.id, s.filename])), 
    [results.sources]
  );
  
  const documentMap = useMemo(() => 
    new Map(documents.map(d => [d.objectId, d.id])), 
    [documents]
  );

  const toggleChunk = (index: number) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // O(1) lookup using pre-computed Map
  const getSourceFilename = (objectId: string) => {
    return sourceMap.get(objectId) || 'Unknown document';
  };

  // O(1) lookup using pre-computed Map
  const getDocumentId = (objectId: string) => {
    return documentMap.get(objectId);
  };

  const exportResults = () => {
    const csv = [
      ['Rank', 'Score', 'Document', 'Text Excerpt', 'AI Summary'].join(','),
      ...results.chunks.map((chunk, i) => {
        const summaryKey = `${chunk.object_id}-${chunk.chunk_index}`;
        const summary = results.chunkSummaries?.[summaryKey] || '';
        return [
          i + 1,
          chunk.hybridScore.toFixed(3),
          `"${getSourceFilename(chunk.object_id)}"`,
          `"${chunk.text.slice(0, 200).replace(/"/g, '""')}..."`,
          `"${summary.replace(/"/g, '""')}"`,
        ].join(',');
      }),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-results-${query.slice(0, 30).replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results.chunks.length === 0) {
    const hasFilteredResults = results.totalBeforeFilter && results.totalBeforeFilter > 0;
    
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No results found</h2>
        <p className="text-muted-foreground mb-6">
          {hasFilteredResults ? (
            <>
              {results.totalBeforeFilter} results were found but filtered out due to low relevance 
              (below {currentThreshold}% threshold).
            </>
          ) : (
            'No matching content found in your documents.'
          )}
        </p>
        
        {/* Threshold adjustment prompt */}
        {hasFilteredResults && onRetryWithThreshold && (
          <Card className="max-w-md mx-auto bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  Adjust relevance threshold
                </span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-5">
                {results.totalBeforeFilter} results found below your current {currentThreshold}% threshold. 
                Lower the threshold to see more results.
              </p>
              
              {/* Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 dark:text-amber-300">New threshold:</span>
                  <span className="font-bold text-amber-800 dark:text-amber-200 text-lg">{sliderThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={currentThreshold > 0 ? currentThreshold - 1 : 0}
                  value={sliderThreshold}
                  onChange={(e) => setSliderThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
                  <span>0% (all results)</span>
                  <span>{currentThreshold - 1}%</span>
                </div>
              </div>

              {/* Apply Button */}
              <Button
                onClick={() => onRetryWithThreshold(sliderThreshold)}
                className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Check className="h-4 w-4 mr-2" />
                Apply {sliderThreshold}% Threshold
              </Button>
              
              <p className="text-xs text-center text-amber-600 dark:text-amber-400 mt-3">
                Lower thresholds show more results but may include less relevant content.
              </p>
            </CardContent>
          </Card>
        )}
        
        {!hasFilteredResults && (
          <p className="text-sm text-muted-foreground">
            Try a different search query or upload more documents.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {results.chunks.length} result{results.chunks.length > 1 ? 's' : ''} for &quot;{query}&quot;
          </h2>
          <p className="text-sm text-muted-foreground">
            Found in {results.sources.length} document{results.sources.length > 1 ? 's' : ''}
            {results.totalBeforeFilter && results.totalBeforeFilter > results.chunks.length && onRetryWithThreshold && (
              <button
                onClick={() => setShowThresholdOptions(true)}
                className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline cursor-pointer transition-colors"
              >
                <Filter className="h-3 w-3" />
                {results.totalBeforeFilter - results.chunks.length} filtered out
              </button>
            )}
            {results.totalBeforeFilter && results.totalBeforeFilter > results.chunks.length && !onRetryWithThreshold && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Filter className="h-3 w-3" />
                {results.totalBeforeFilter - results.chunks.length} filtered out
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportResults}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Threshold Options Dialog */}
      <Dialog open={showThresholdOptions} onOpenChange={(open) => {
        setShowThresholdOptions(open);
        if (open) {
          setSliderThreshold(currentThreshold > 0 ? Math.max(0, currentThreshold - 25) : 0);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-amber-600" />
              Adjust Relevance Threshold
            </DialogTitle>
            <DialogDescription>
              {results.totalBeforeFilter && results.totalBeforeFilter > results.chunks.length && (
                <>
                  {results.totalBeforeFilter - results.chunks.length} additional results are below your current {currentThreshold}% threshold.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">New threshold:</span>
                <span className="font-bold text-lg">{sliderThreshold}%</span>
              </div>
              <input
                type="range"
                min="0"
                max={currentThreshold > 0 ? currentThreshold - 1 : 0}
                value={sliderThreshold}
                onChange={(e) => setSliderThreshold(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0% (all results)</span>
                <span>{currentThreshold - 1}%</span>
              </div>
            </div>
            
            <p className="text-xs text-center text-muted-foreground">
              Lower thresholds show more results but may include less relevant content.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowThresholdOptions(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                onRetryWithThreshold?.(sliderThreshold);
                setShowThresholdOptions(false);
              }}
            >
              <Check className="h-4 w-4 mr-2" />
              Apply {sliderThreshold}%
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results List */}
      <div className="space-y-3">
        {results.chunks.map((chunk, index) => {
          const isExpanded = expandedChunks.has(index);
          const displayText = isExpanded ? chunk.text : chunk.text.slice(0, 300);
          const summaryKey = `${chunk.object_id}-${chunk.chunk_index}`;
          const chunkSummary = results.chunkSummaries?.[summaryKey];
          const documentId = getDocumentId(chunk.object_id);

          return (
            <Card key={`${chunk.object_id}-${chunk.chunk_index}`} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Source Info */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {documentId ? (
                      <Link
                        href={`/cases/${caseId}/documents/${documentId}?segment=${encodeURIComponent(chunk.text)}&chunk=${chunk.chunk_index}&query=${encodeURIComponent(query)}${searchId ? `&from=${searchId}` : ''}`}
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {getSourceFilename(chunk.object_id)}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">
                        {getSourceFilename(chunk.object_id)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Chunk #{chunk.chunk_index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Relevance</span>
                    <Progress value={chunk.hybridScore * 100} className="w-16 h-2" />
                    <span className="text-xs font-medium">
                      {(chunk.hybridScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Text Content */}
                <div className="text-sm leading-relaxed bg-muted/30 p-3 rounded-md border-l-2 border-primary/30">
                  {displayText}{chunk.text.length > 300 && !isExpanded ? '...' : ''}
                </div>

                {/* Expand/Collapse */}
                {chunk.text.length > 300 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-6 text-xs"
                    onClick={() => toggleChunk(index)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show more
                      </>
                    )}
                  </Button>
                )}

                {/* AI Relevance Summary */}
                {chunkSummary && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 rounded-md border border-blue-200/50 dark:border-blue-800/50">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300 block mb-1">
                          Why this is relevant
                        </span>
                        <p className="text-sm text-blue-900 dark:text-blue-100">
                          {chunkSummary}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Score Details */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
                  <span>Hybrid: {chunk.hybridScore.toFixed(3)}</span>
                  <span>Semantic: {chunk.vectorScore.toFixed(3)}</span>
                  <span>Keyword: {chunk.bm25Score.toFixed(3)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
