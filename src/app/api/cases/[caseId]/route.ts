import { NextRequest, NextResponse } from 'next/server';
import { db, cases, documents } from '@/lib/db';
import { getCasedevClient } from '@/lib/casedev/client';
import { eq, sql, count } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// GET /api/cases/[caseId] - Get case details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;

    const caseData = await db
      .select({
        id: cases.id,
        name: cases.name,
        description: cases.description,
        vaultId: cases.vaultId,
        createdAt: cases.createdAt,
        updatedAt: cases.updatedAt,
        documentCount: count(documents.id),
      })
      .from(cases)
      .leftJoin(documents, eq(documents.caseId, cases.id))
      .where(eq(cases.id, caseId))
      .groupBy(cases.id, cases.name, cases.description, cases.vaultId, cases.createdAt, cases.updatedAt)
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      case: {
        ...caseData[0],
        documentCount: Number(caseData[0].documentCount) || 0,
        createdAt: caseData[0].createdAt.toISOString(),
        updatedAt: caseData[0].updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to fetch case:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case' },
      { status: 500 }
    );
  }
}

// PATCH /api/cases/[caseId] - Update case (name, description, password change/removal)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json();
    const { currentPassword, newPassword, removePassword, name, description } = body;

    // Get the case
    const caseData = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    const now = new Date();

    // Handle name/description update (requires password verification)
    if (name !== undefined || description !== undefined) {
      // Verify password if case has one
      if (caseData[0].passwordHash && caseData[0].passwordHash !== '') {
        if (!currentPassword) {
          return NextResponse.json(
            { error: 'Password is required to update case' },
            { status: 401 }
          );
        }
        const isValid = await bcrypt.compare(currentPassword, caseData[0].passwordHash);
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid password' },
            { status: 401 }
          );
        }
      }

      const updateData: { name?: string; description?: string | null; updatedAt: Date } = { updatedAt: now };
      if (name !== undefined) {
        if (!name || name.trim() === '') {
          return NextResponse.json(
            { error: 'Name cannot be empty' },
            { status: 400 }
          );
        }
        updateData.name = name.trim();
      }
      if (description !== undefined) {
        updateData.description = description?.trim() || null;
      }

      await db
        .update(cases)
        .set(updateData)
        .where(eq(cases.id, caseId));

      return NextResponse.json({
        success: true,
        message: 'Case updated successfully.',
        case: {
          id: caseId,
          name: updateData.name || caseData[0].name,
          description: updateData.description !== undefined ? updateData.description : caseData[0].description,
        },
      });
    }

    // Handle password operations (requires current password verification)
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, caseData[0].passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    if (removePassword) {
      // Set a default empty password hash (user won't need password to access)
      // We use a special marker that the auth endpoint will recognize
      await db
        .update(cases)
        .set({
          passwordHash: '', // Empty string means no password required
          updatedAt: now,
        })
        .where(eq(cases.id, caseId));

      return NextResponse.json({
        success: true,
        message: 'Password removed. Case is now accessible without a password.',
      });
    } else if (newPassword) {
      // Update to new password
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'New password must be at least 6 characters' },
          { status: 400 }
        );
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await db
        .update(cases)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: now,
        })
        .where(eq(cases.id, caseId));

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully.',
      });
    } else {
      return NextResponse.json(
        { error: 'Must provide newPassword or removePassword' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Failed to update case:', error);
    return NextResponse.json(
      { error: 'Failed to update case' },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[caseId] - Delete a case (requires password)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required to delete a case' },
        { status: 400 }
      );
    }

    // Get the case to verify password
    const caseData = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseData.length === 0) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Verify password (if case has a password set)
    if (caseData[0].passwordHash && caseData[0].passwordHash !== '') {
      const isValid = await bcrypt.compare(password, caseData[0].passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid password' },
          { status: 401 }
        );
      }
    }

    // Delete the vault from Case.dev
    const vaultId = caseData[0].vaultId;
    if (vaultId) {
      try {
        const client = getCasedevClient();
        await client.vault.delete(vaultId);
        console.log(`Deleted vault ${vaultId} from Case.dev`);
      } catch (vaultError) {
        // Log the error but continue with local deletion
        // The vault may have already been deleted or may not exist
        console.error(`Failed to delete vault ${vaultId} from Case.dev:`, vaultError);
      }
    }

    // Delete case from local database (documents will cascade delete due to foreign key)
    await db
      .delete(cases)
      .where(eq(cases.id, caseId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete case:', error);
    return NextResponse.json(
      { error: 'Failed to delete case' },
      { status: 500 }
    );
  }
}
