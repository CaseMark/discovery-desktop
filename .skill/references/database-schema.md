# Database Schema Reference

SQLite database managed with Drizzle ORM.

**Schema location**: `src/lib/db/schema.ts`

## Tables

### cases
```typescript
export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  passwordHash: text('password_hash').notNull(),
  vaultId: text('vault_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
});
```

### documents
```typescript
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  status: text('status', { 
    enum: ['pending', 'processing', 'complete', 'failed'] 
  }).notNull().default('pending'),
  casedevDocId: text('casedev_doc_id'),
  ocrText: text('ocr_text'),
  pageCount: integer('page_count'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
});
```

## Relationships

```typescript
export const casesRelations = relations(cases, ({ many }) => ({
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  case: one(cases, {
    fields: [documents.caseId],
    references: [cases.id],
  }),
}));
```

## Common Queries

### Get case with document count
```typescript
const caseWithCount = await db
  .select({
    ...cases,
    documentCount: count(documents.id),
  })
  .from(cases)
  .leftJoin(documents, eq(cases.id, documents.caseId))
  .where(eq(cases.id, caseId))
  .groupBy(cases.id);
```

### Get pending OCR documents
```typescript
const pendingDocs = await db
  .select()
  .from(documents)
  .where(
    or(
      eq(documents.status, 'pending'),
      eq(documents.status, 'processing')
    )
  );
```

### Update document status
```typescript
await db
  .update(documents)
  .set({
    status: 'complete',
    ocrText: extractedText,
    pageCount: pages,
    processedAt: new Date(),
  })
  .where(eq(documents.id, documentId));
```

## Type Exports

```typescript
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
```

## Commands

```bash
npm run db:generate  # Create migration from schema changes
npm run db:push      # Apply schema directly (dev)
npm run db:studio    # Visual database browser
```

## Database Location

- Development: `./sqlite.db`
- Config: `drizzle.config.ts`
