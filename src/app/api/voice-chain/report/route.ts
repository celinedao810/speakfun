import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, releaseClaim, requireUser, serviceClient } from '@/lib/voiceChain/server';

/** POST /api/voice-chain/report { messageId } — the recipient flags a message; it leaves the pool for good. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.messageId !== 'string') return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  try {
    const removed = await releaseClaim(serviceClient(), body.messageId, auth.user.id, 'removed');
    if (removed) console.warn(`[voice-chain/report] Message ${body.messageId} reported by ${auth.user.id}`);
    return NextResponse.json({ removed });
  } catch (err) {
    return errorResponse('report', err);
  }
}
