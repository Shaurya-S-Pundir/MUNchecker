import { NextRequest, NextResponse } from 'next/server';
import { lookupDelegate } from '@/services/delegateService';

export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;

  if (!uuid) {
    return NextResponse.json(
      { status: 'error', message: 'UUID parameter is required.' },
      { status: 400 }
    );
  }

  const result = await lookupDelegate(uuid);

  switch (result.status) {
    case 'verified':
      return NextResponse.json({ status: 'verified', delegate: result.delegate });

    case 'already_checked_in':
      return NextResponse.json({
        status: 'already_checked_in',
        delegate: result.delegate,
      });

    case 'invalid':
      return NextResponse.json({ status: 'invalid' }, { status: 200 });

    case 'error':
      return NextResponse.json(
        { status: 'error', message: result.message },
        { status: 500 }
      );
  }
}
