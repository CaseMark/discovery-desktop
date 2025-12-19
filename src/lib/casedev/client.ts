/**
 * Case.dev API Client
 * 
 * Wrapper for Case.dev API calls. Uses fetch directly since we're
 * building a lightweight integration.
 */

const CASEDEV_API_BASE = 'https://api.case.dev';

interface CasedevConfig {
  apiKey: string;
}

class CasedevClient {
  private apiKey: string;

  constructor(config: CasedevConfig) {
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${CASEDEV_API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API request failed: ${response.status}`);
    }

    return response.json();
  }

  // Vault operations
  vault = {
    create: async (params: { name: string; description?: string; enableGraph?: boolean }) => {
      return this.request<{
        id: string;
        name: string;
        description?: string;
        filesBucket: string;
        vectorBucket: string;
        indexName: string;
        region: string;
        createdAt: string;
      }>('/vault', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },

    get: async (vaultId: string) => {
      return this.request<{
        id: string;
        name: string;
        description?: string;
        createdAt: string;
      }>(`/vault/${vaultId}`);
    },

    delete: async (vaultId: string) => {
      return this.request<{ success: boolean }>(`/vault/${vaultId}`, {
        method: 'DELETE',
      });
    },

    upload: async (vaultId: string, params: {
      filename: string;
      contentType: string;
      metadata?: Record<string, unknown>;
      auto_index?: boolean;
    }) => {
      return this.request<{
        objectId: string;
        uploadUrl: string;
        expiresIn: number;
        instructions: {
          method: string;
          headers: Record<string, string>;
        };
      }>(`/vault/${vaultId}/upload`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },

    objects: {
      list: async (vaultId: string) => {
        return this.request<{
          vaultId: string;
          objects: Array<{
            id: string;
            filename: string;
            contentType: string;
            sizeBytes: number;
            ingestionStatus: string;
            pageCount?: number;
            chunkCount?: number;
            metadata?: Record<string, unknown>;
            createdAt: string;
          }>;
          count: number;
        }>(`/vault/${vaultId}/objects`);
      },

      get: async (vaultId: string, objectId: string) => {
        return this.request<{
          id: string;
          filename: string;
          contentType: string;
          sizeBytes: number;
          downloadUrl: string;
          expiresIn: number;
          ingestionStatus: string;
          pageCount?: number;
          textLength?: number;
          chunkCount?: number;
        }>(`/vault/${vaultId}/objects/${objectId}`);
      },

      getText: async (vaultId: string, objectId: string) => {
        return this.request<{
          objectId: string;
          filename: string;
          text: string;
          textLength: number;
          pageCount?: number;
        }>(`/vault/${vaultId}/objects/${objectId}/text`);
      },

      delete: async (vaultId: string, objectId: string) => {
        return this.request<{ success: boolean }>(`/vault/${vaultId}/objects/${objectId}`, {
          method: 'DELETE',
        });
      },
    },

    search: async (vaultId: string, params: {
      query: string;
      method?: 'hybrid' | 'fast' | 'global' | 'local';
      topK?: number;
      filters?: Record<string, unknown>;
    }) => {
      return this.request<{
        method: string;
        query: string;
        chunks: Array<{
          text: string;
          object_id: string;
          chunk_index: number;
          hybridScore: number;
          vectorScore: number;
          bm25Score: number;
        }>;
        sources: Array<{
          id: string;
          filename: string;
          pageCount?: number;
        }>;
        response?: string; // For global/local GraphRAG methods
      }>(`/vault/${vaultId}/search`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },

    ingest: async (vaultId: string, objectId: string) => {
      return this.request<{
        objectId: string;
        workflowId: string;
        status: string;
        message: string;
        enableGraphRAG: boolean;
      }>(`/vault/${vaultId}/ingest/${objectId}`, {
        method: 'POST',
      });
    },
  };

  // LLM operations
  llm = {
    chat: async (params: {
      model?: string;
      messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }>;
      max_tokens?: number;
      temperature?: number;
    }) => {
      return this.request<{
        id: string;
        object: string;
        model: string;
        choices: Array<{
          index: number;
          message: {
            role: string;
            content: string;
          };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          cost: number;
        };
      }>('/llm/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: params.model || 'anthropic/claude-sonnet-4-20250514',
          ...params,
        }),
      });
    },
  };
}

// Singleton instance
let client: CasedevClient | null = null;

export function getCasedevClient(): CasedevClient {
  if (!client) {
    const apiKey = process.env.CASEDEV_API_KEY;
    if (!apiKey) {
      throw new Error('CASEDEV_API_KEY environment variable is not set');
    }
    client = new CasedevClient({ apiKey });
  }
  return client;
}

export type { CasedevClient };
