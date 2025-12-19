import { NextRequest, NextResponse } from 'next/server';
import { db, appSettings } from '@/lib/db';
import { eq } from 'drizzle-orm';

const SETTINGS_ID = 'default';

// GET /api/settings - Get app settings
export async function GET() {
  try {
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

// PUT /api/settings - Update app settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { firmName, logoData, logoMimeType } = body;

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
