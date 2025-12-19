import { NextResponse } from 'next/server';

// Simple health check endpoint that doesn't require database access
// Configure App Runner to use /api/health for health checks
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}

