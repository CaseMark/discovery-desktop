# Discovery Desktop Skill

Agent skill for developing the discovery-desktop e-discovery application.

## Directory Structure

```
.skill/
├── SKILL.md                        # Core skill (always read first)
└── references/
    ├── casedev-api.md              # Case.dev API integration
    ├── database-schema.md          # Drizzle ORM schema
    └── ediscovery-glossary.md      # Legal terminology
```

---

## File Descriptions

### SKILL.md
**Purpose**: Primary entry point for the skill

**Contains**:
- Application architecture overview
- Tech stack summary (Next.js 16, React 19, Drizzle, SQLite)
- Core workflow diagram (upload → OCR → search → export)
- Development setup commands
- Common task patterns (adding routes, extending schema)
- Troubleshooting table

**When loaded**: Automatically when skill triggers on queries about discovery-desktop, e-discovery features, or Case.dev integration

**Size**: ~150 lines

---

### references/casedev-api.md
**Purpose**: Detailed Case.dev API integration patterns

**Contains**:
- Base fetch wrapper with authentication
- Vault CRUD operations (TypeScript interfaces + functions)
- Document upload with FormData handling
- OCR status polling pattern with timeout
- Semantic search request/response types
- Error handling class and error codes
- Rate limits and file size limits

**When to read**: Working on API integration, debugging Case.dev calls, adding new endpoints

**Size**: ~150 lines

---

### references/database-schema.md
**Purpose**: Drizzle ORM schema reference

**Contains**:
- Complete `cases` and `documents` table definitions
- Relationship definitions
- Common query examples (joins, filters, updates)
- Type export patterns (`$inferSelect`, `$inferInsert`)
- Drizzle CLI commands

**When to read**: Modifying database schema, writing complex queries, adding new tables

**Size**: ~100 lines

---

### references/ediscovery-glossary.md
**Purpose**: Legal domain knowledge for e-discovery

**Contains**:
- Core e-discovery concepts (ESI, discovery, privilege)
- Document type definitions (pleadings, depositions, RFPs)
- Six-stage discovery process explanation
- Search terminology (semantic search, relevance scoring, TAR)
- Common legal abbreviations
- Mapping of legal concepts to app features

**When to read**: Building features that need legal context, writing user-facing copy, understanding search result terminology

**Size**: ~80 lines

---

## Progressive Disclosure

The skill uses three loading levels to minimize context usage:

| Level | What Loads | Token Cost |
|-------|------------|------------|
| 1 | Frontmatter (name + description) | ~50 tokens |
| 2 | SKILL.md body | ~800 tokens |
| 3 | Reference files (as needed) | ~400 tokens each |

An agent working on a simple UI change loads only SKILL.md.
An agent modifying the database also loads `database-schema.md`.
An agent building a new Case.dev integration loads `casedev-api.md`.

---

## Installation

Copy the `.skill/` directory to your repository root:

```bash
# From discovery-desktop repo root
mkdir -p .skill/references
# Copy files into place
git add .skill/
git commit -m "Add agent skill for development"
```

---

## Trigger Examples

| Query | Loads |
|-------|-------|
| "Fix the upload button styling" | SKILL.md only |
| "Add a new field to track document dates" | SKILL.md + database-schema.md |
| "Why is OCR failing?" | SKILL.md + casedev-api.md |
| "What does 'privilege review' mean?" | SKILL.md + ediscovery-glossary.md |
| "Build a new search filter feature" | SKILL.md + casedev-api.md + database-schema.md |
