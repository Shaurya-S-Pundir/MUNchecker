import { findDelegateByUUID, updateDelegateRow } from '@/lib/googleSheets';
import { Delegate, ScanResult } from '@/types/delegate';

/**
 * Look up a delegate by UUID and return the appropriate scan result.
 * Does NOT modify any sheet data.
 */
export async function lookupDelegate(uuid: string): Promise<ScanResult> {
  if (!uuid || typeof uuid !== 'string') {
    return { status: 'invalid' };
  }

  const trimmed = uuid.trim();
  if (!trimmed) return { status: 'invalid' };

  try {
    const delegate = await findDelegateByUUID(trimmed);

    if (!delegate) {
      return { status: 'invalid' };
    }

    if (delegate.checkedIn) {
      return { status: 'already_checked_in', delegate };
    }

    return { status: 'verified', delegate };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { status: 'error', message };
  }
}

/**
 * Record attendance for a delegate.
 * - Checks for duplicate check-in before writing.
 * - Only updates: Checked In, Check In Time, Device.
 * - Returns the updated delegate.
 */
export async function recordAttendance(
  uuid: string,
  userAgent: string
): Promise<{ success: boolean; delegate?: Delegate; error?: string }> {
  if (!uuid) {
    return { success: false, error: 'UUID is required.' };
  }

  try {
    const delegate = await findDelegateByUUID(uuid.trim());

    if (!delegate) {
      return { success: false, error: 'Delegate not found.' };
    }

    // Guard: prevent duplicate check-in
    if (delegate.checkedIn) {
      return {
        success: false,
        error: `Delegate already checked in at ${delegate.checkInTime}.`,
        delegate,
      };
    }

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    await updateDelegateRow(delegate, {
      checkedIn: 'TRUE',
      checkInTime: now,
      device: userAgent.slice(0, 500), // cap length
    });

    return {
      success: true,
      delegate: {
        ...delegate,
        checkedIn: true,
        checkInTime: now,
        device: userAgent,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to record attendance.';
    return { success: false, error: message };
  }
}
