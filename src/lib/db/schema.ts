import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

// Cases table - each case has its own vault
export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  vaultId: text('vault_id').notNull(), // Case.dev vault ID
  passwordHash: text('password_hash').notNull(), // bcrypt hashed password
  tags: text('tags'), // JSON array of AI-generated tags
  aiSummary: text('ai_summary'), // AI-generated summary of discovery contents
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// Documents table - tracks uploaded documents
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  objectId: text('object_id').notNull(), // Case.dev object ID
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes'),
  pageCount: integer('page_count'),
  ingestionStatus: text('ingestion_status').notNull().default('pending'),
  summary: text('summary'), // AI-generated summary (cached)
  uploadedAt: timestamp('uploaded_at').notNull(),
});

// Search history table - tracks searches for analytics
export const searchHistory = pgTable('search_history', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  resultCount: integer('result_count'), // Results after filtering
  totalResultCount: integer('total_result_count'), // Results before filtering
  relevanceThreshold: integer('relevance_threshold'), // Threshold used (stored as percentage, e.g., 75)
  resultsCache: text('results_cache'), // JSON-serialized search results for instant replay
  searchedAt: timestamp('searched_at').notNull(),
});

// App settings table - stores branding and global settings
export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey().default('default'), // Single row for app settings
  firmName: text('firm_name'),
  logoData: text('logo_data'), // Base64 encoded logo image
  logoMimeType: text('logo_mime_type'), // e.g., 'image/png'
  updatedAt: timestamp('updated_at').notNull(),
});

// Type exports for use in application
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type SearchHistory = typeof searchHistory.$inferSelect;
export type NewSearchHistory = typeof searchHistory.$inferInsert;
