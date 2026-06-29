import { NextRequest, NextResponse } from 'next/server';
import { recordAttendance } from '@/services/delegateService';

export async function POST(request: NextRequest) {
  let body: { uuid?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const { uuid } = body;

  if (!uuid) {
    return NextResponse.json(
      { success: false, error: 'uuid is required in the request body.' },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get('user-agent') ?? 'Unknown Device';

  const result = await recordAttendance(uuid, userAgent);

  if (!result.success) {
    // Duplicate check-in → 409 Conflict
    if (result.delegate?.checkedIn) {
      return NextResponse.json(
        { success: false, error: result.error, delegate: result.delegate },
        { status: 409 }
      );
    }

    // Not found
    if (result.error === 'Delegate not found.') {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, delegate: result.delegate });
}
