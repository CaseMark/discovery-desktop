# Case.dev API Reference

Detailed patterns for integrating with Case.dev APIs in discovery-desktop.

## Base Configuration

```typescript
// lib/casedev/client.ts
const BASE_URL = 'https://api.case.dev/v1';
const API_KEY = process.env.CASEDEV_API_KEY;

async function casedevFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new CaseDevError(error.message, response.status);
  }
  
  return response.json();
}
```

## Vault Operations

### Create Vault
```typescript
interface CreateVaultRequest {
  name: string;
  password?: string;
}

interface VaultResponse {
  vault_id: string;
  name: string;
  created_at: string;
}

async function createVault(data: CreateVaultRequest): Promise<VaultResponse> {
  return casedevFetch('/vaults', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

### Get Vault
```typescript
async function getVault(vaultId: string): Promise<VaultResponse> {
  return casedevFetch(`/vaults/${vaultId}`);
}
```

## Document Operations

### Upload Document
```typescript
interface UploadDocumentRequest {
  vault_id: string;
  file: File | Buffer;
  filename: string;
  metadata?: Record<string, string>;
}

interface DocumentResponse {
  document_id: string;
  vault_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  created_at: string;
}

async function uploadDocument(data: UploadDocumentRequest): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append('vault_id', data.vault_id);
  formData.append('file', data.file, data.filename);
  if (data.metadata) {
    formData.append('metadata', JSON.stringify(data.metadata));
  }
  
  return fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData,
  }).then(r => r.json());
}
```

### Check OCR Status
```typescript
interface OCRStatusResponse {
  document_id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress?: number;
  error?: string;
  page_count?: number;
  extracted_text?: string;
}

async function getDocumentStatus(documentId: string): Promise<OCRStatusResponse> {
  return casedevFetch(`/documents/${documentId}/status`);
}
```

### Polling Pattern
```typescript
async function waitForOCR(
  documentId: string, 
  onProgress?: (progress: number) => void,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<OCRStatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getDocumentStatus(documentId);
    
    if (status.status === 'complete') return status;
    if (status.status === 'failed') throw new Error(`OCR failed: ${status.error}`);
    if (onProgress && status.progress) onProgress(status.progress);
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('OCR timeout');
}
```

## Search Operations

### Semantic Search
```typescript
interface SearchRequest {
  vault_id: string;
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    date_range?: { start: string; end: string };
    document_ids?: string[];
    file_types?: string[];
  };
}

interface SearchResult {
  document_id: string;
  filename: string;
  passage: string;
  relevance_score: number;
  page_number?: number;
  highlights: string[];
}

interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  query: string;
}

async function semanticSearch(data: SearchRequest): Promise<SearchResponse> {
  return casedevFetch('/search', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

### Example Queries
- "settlement negotiations before March"
- "testimony about standard of care"
- "emails mentioning the contract deadline"

## Error Handling

```typescript
class CaseDevError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'CaseDevError';
  }
}

const ERROR_CODES = {
  VAULT_NOT_FOUND: 'vault_not_found',
  DOCUMENT_NOT_FOUND: 'document_not_found',
  OCR_FAILED: 'ocr_failed',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INVALID_FILE_TYPE: 'invalid_file_type',
  FILE_TOO_LARGE: 'file_too_large',
} as const;
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Document upload | 100 | per minute |
| Search | 60 | per minute |
| Status polling | 120 | per minute |

## File Limits

- Maximum single file: 100MB
- Maximum batch upload: 500MB total
