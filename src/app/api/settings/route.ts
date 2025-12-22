import { NextRequest, NextResponse } from 'next/server';
import { db, appSettings } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { checkApiRateLimit } from '@/lib/rate-limit';

const SETTINGS_ID = 'default';

// GET /api/settings - Get app settings (public, rate limited)
export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = checkApiRateLimit(request, 'settings:get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const settings = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
      .limit(1);

    if (settings.length === 0) {
      // Return default settings if none exist
      return NextResponse.json({
        settings: {
          id: SETTINGS_ID,
          firmName: null,
          logoData: null,
          logoMimeType: null,
        },
      });
    }

    return NextResponse.json({
      settings: {
        ...settings[0],
        updatedAt: settings[0].updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update app settings (rate limited, stricter limits)
// Note: In a production environment, this should require admin authentication
// For now, we apply strict rate limiting to prevent abuse
export async function PUT(request: NextRequest) {
  try {
    // Strict rate limit for settings updates (5 per minute)
    const rateLimitResponse = checkApiRateLimit(request, 'settings:update');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const { firmName, logoData, logoMimeType } = body;

    // Validate logo data size (max 500KB base64)
    if (logoData && logoData.length > 500 * 1024) {
      return NextResponse.json(
        { error: 'Logo image is too large. Maximum size is 500KB.' },
        { status: 400 }
      );
    }

    // Validate logo mime type
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'];
    if (logoMimeType && !allowedMimeTypes.includes(logoMimeType)) {
      return NextResponse.json(
        { error: 'Invalid logo format. Allowed formats: PNG, JPEG, GIF, SVG.' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Check if settings exist
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
      .limit(1);

    if (existing.length === 0) {
      // Create new settings
      await db.insert(appSettings).values({
        id: SETTINGS_ID,
        firmName: firmName || null,
        logoData: logoData || null,
        logoMimeType: logoMimeType || null,
        updatedAt: now,
      });
    } else {
      // Update existing settings
      await db
        .update(appSettings)
        .set({
          firmName: firmName !== undefined ? firmName : existing[0].firmName,
          logoData: logoData !== undefined ? logoData : existing[0].logoData,
          logoMimeType: logoMimeType !== undefined ? logoMimeType : existing[0].logoMimeType,
          updatedAt: now,
        })
        .where(eq(appSettings.id, SETTINGS_ID));
    }

    // Fetch and return updated settings
    const updated = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
      .limit(1);

    return NextResponse.json({
      settings: {
        ...updated[0],
        updatedAt: updated[0].updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
