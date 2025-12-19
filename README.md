# Discovery Dashboard

A web application for e-discovery teams to upload, OCR, and semantically search legal documents.

## Features

- **Case Management**: Create password-protected case vaults
- **Bulk Document Upload**: Drag & drop hundreds of files at once
- **Automatic OCR**: Documents are automatically processed for text extraction
- **Semantic Search**: Search by meaning, not just keywords
- **Real-time Progress**: Watch OCR processing status in real-time
- **Export Results**: Download search results as CSV

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite with Drizzle ORM
- **APIs**: Case.dev (Vaults, OCR, Search, LLMs)

## Getting Started

### Prerequisites

- Node.js 18+
- A Case.dev API key (get one at https://app.case.dev)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd DiscoveryDesktop
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your Case.dev API key:
```
CASEDEV_API_KEY=sk_case_your_api_key_here
```

5. Initialize the database:
```bash
npm run db:push
```

6. Start the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Creating a Case

1. Click "New Case" on the home page
2. Enter a case name, description, and password
3. The password protects access to this case vault

### Uploading Documents

1. Open a case and go to the "Upload" tab
2. Drag & drop files or click to select
3. Supported formats: PDF, Word (.doc, .docx), TXT, images (JPG, PNG, TIFF)
4. Click "Upload" to start processing
5. Documents are automatically OCR'd and indexed

### Searching Documents

1. Enter a natural language query in the search bar
2. Examples:
   - "settlement negotiations before March"
   - "testimony about standard of care"
   - "emails mentioning the contract deadline"
3. Results show relevant passages with relevance scores
4. Export results to CSV for further analysis

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   └── cases/              # Case management APIs
│   ├── cases/[caseId]/         # Case dashboard page
│   └── page.tsx                # Home page
├── components/
│   ├── ui/                     # Reusable UI components
│   ├── upload/                 # Upload components
│   └── search/                 # Search components
└── lib/
    ├── db/                     # Database schema and client
    ├── casedev/                # Case.dev API client
    └── utils.ts                # Utility functions
```

## Database Commands

```bash
# Generate migrations
npm run db:generate

# Push schema changes
npm run db:push

# Open Drizzle Studio (database viewer)
npm run db:studio
```

## Deployment

This app is designed to be deployed on Orbit or any platform that supports Next.js:

1. Set the `CASEDEV_API_KEY` environment variable
2. Build the application: `npm run build`
3. Start the server: `npm start`

For Orbit deployment, the SQLite database will be persisted in the container's filesystem.

## License

Private - All rights reserved
