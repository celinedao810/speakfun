import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, releaseClaim, requireUser, serviceClient } from '@/lib/voiceChain/server';

/** POST /api/voice-chain/release { messageId } — give up a picked-up message; it goes back to the pool. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.messageId !== 'string') return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  try {
    const released = await releaseClaim(serviceClient(), body.messageId, auth.user.id);
    return NextResponse.json({ released });
  } catch (err) {
    return errorResponse('release', err);
  }
}
