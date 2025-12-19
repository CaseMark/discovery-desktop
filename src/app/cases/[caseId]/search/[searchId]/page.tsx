'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Search,
  Clock,
  Filter,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchResults } from '@/components/search/SearchResults';
import { formatDate } from '@/lib/utils';

interface SearchData {
  id: string;
  query: string;
  resultCount: number | null;
  totalResultCount: number | null;
  relevanceThreshold: number | null;
  searchedAt: string;
}

interface Document {
  id: string;
  filename: string;
  objectId?: string;
}

export default function SearchResultsPage({ 
  params 
}: { 
  params: Promise<{ caseId: string; searchId: string }> 
}) {
  const { caseId, searchId } = use(params);
  const router = useRouter();
  
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check authentication
    if (typeof window !== 'undefined') {
      const isAuthenticated = sessionStorage.getItem(`case_${caseId}`) === 'authenticated';
      if (!isAuthenticated) {
        router.push('/');
        return;
      }
    }
    // PARALLEL: Fetch search data and documents concurrently
    Promise.all([fetchSearchData(), fetchDocuments()]);
  }, [caseId, searchId, router]);

  const fetchSearchData = async () => {
    try {
      // Fetch search metadata with cached results
      const metaResponse = await fetch(`/api/cases/${caseId}/searches/${searchId}`);
      if (!metaResponse.ok) {
        if (metaResponse.status === 404) {
          setError('Search not found');
        } else {
          setError('Failed to load search');
        }
        setLoading(false);
        return;
      }
      const metaData = await metaResponse.json();
      setSearchData(metaData.search);

      // Use cached results if available (INSTANT LOAD)
      if (metaData.cachedResults) {
        setSearchResults(metaData.cachedResults);
        setLoading(false);
        return;
      }

      // Fallback: Re-run search only if no cache exists (legacy searches)
      const searchResponse = await fetch(`/api/cases/${caseId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: metaData.search.query,
          minRelevance: (metaData.search.relevanceThreshold || 75) / 100,
          skipHistory: true,
        }),
      });

      if (searchResponse.ok) {
        const results = await searchResponse.json();
        setSearchResults(results);
      }
    } catch (err) {
      console.error('Failed to fetch search:', err);
      setError('Failed to load search');
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

  // Re-run search with different threshold
  const handleRetryWithThreshold = async (newThreshold: number) => {
    if (!searchData) return;
    
    setLoading(true);
    try {
      const searchResponse = await fetch(`/api/cases/${caseId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: searchData.query,
          minRelevance: newThreshold / 100,
          skipHistory: true,
        }),
      });

      if (searchResponse.ok) {
        const results = await searchResponse.json();
        setSearchResults(results);
        // Update the displayed threshold
        setSearchData(prev => prev ? { ...prev, relevanceThreshold: newThreshold } : null);
      }
    } catch (err) {
      console.error('Failed to retry search:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading search results...</p>
        </div>
      </div>
    );
  }

  if (error || !searchData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error || 'Search not found'}</h2>
            <Link href={`/cases/${caseId}?tab=searches`}>
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Recent Searches
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentThreshold = searchData.relevanceThreshold || 75;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/cases/${caseId}?tab=searches`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Search: &quot;{searchData.query}&quot;
                </h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(searchData.searchedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    {currentThreshold}% threshold
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Results */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {searchResults ? (
          <SearchResults
            results={searchResults}
            query={searchData.query}
            documents={documents}
            caseId={caseId}
            searchId={searchId}
            onRetryWithThreshold={handleRetryWithThreshold}
            currentThreshold={currentThreshold}
          />
        ) : (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading results...</p>
          </div>
        )}
      </main>
    </div>
  );
}
