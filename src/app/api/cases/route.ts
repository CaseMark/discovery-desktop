import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, count } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { setAuthCookie } from '@/lib/auth';
import { checkApiRateLimit } from '@/lib/rate-limit';

// GET /api/cases - List all cases
// Note: This endpoint lists case metadata only (names, counts)
// Actual case content requires authentication per-case
export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, 'cases:list');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get cases with document counts using LEFT JOIN
    const casesWithCounts = await db
      .select({
        id: cases.id,
        name: cases.name,
        description: cases.description,
        tags: cases.tags,
        createdAt: cases.createdAt,
        documentCount: count(documents.id),
      })
      .from(cases)
      .leftJoin(documents, eq(documents.caseId, cases.id))
      .groupBy(cases.id, cases.name, cases.description, cases.tags, cases.createdAt)
      .orderBy(cases.createdAt);

    return NextResponse.json({
      cases: casesWithCounts.map((c) => ({
        ...c,
        tags: c.tags ? JSON.parse(c.tags) : [],
        documentCount: Number(c.documentCount) || 0,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases' },
      { status: 500 }
    );
  }
}

// POST /api/cases - Create a new case
export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, 'cases:create');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const { name, description, password } = body;

    // Validate input
    if (!name || !password) {
      return NextResponse.json(
        { error: 'Name and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create vault in Case.dev
    const client = getCasedevClient();
    const vault = await client.vault.create({
      name,
      description: description || undefined,
      enableGraph: true,
    });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create case in local database
    const caseId = uuidv4();
    const now = new Date();

    await db.insert(cases).values({
      id: caseId,
      name,
      description: description || null,
      vaultId: vault.id,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Automatically authenticate the creator
    await setAuthCookie(caseId);

    return NextResponse.json({
      case: {
        id: caseId,
        name,
        description,
        vaultId: vault.id,
        createdAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to create case:', error);
    return NextResponse.json(
      { error: 'Failed to create case' },
      { status: 500 }
    );
  }
}
