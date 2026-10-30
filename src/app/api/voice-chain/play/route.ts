import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, MessageRow, playsLeft, requireUser, serviceClient } from '@/lib/voiceChain/server';

/**
 * POST /api/voice-chain/play { messageId }
 * Uses one play of the picked-up message. Counted on the server so leaving and
 * coming back doesn't give extra plays. Returns { allowed, playsLeft }.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.messageId !== 'string') return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  try {
    const svc = serviceClient();
    const { data } = await svc
      .from('voice_chain_messages')
      .select('*')
      .eq('id', body.messageId)
      .eq('claimed_by', auth.user.id)
      .eq('status', 'claimed')
      .maybeSingle();
    const row = data as MessageRow | null;
    if (!row || new Date(row.claim_expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This message is no longer yours to answer' }, { status: 410 });
    }

    const left = playsLeft(row);
    if (left <= 0) return NextResponse.json({ allowed: false, playsLeft: 0 });

    const used = row.claim_plays ?? 0;
    const { data: updated, error } = await svc
      .from('voice_chain_messages')
      .update({ claim_plays: used + 1 })
      .eq('id', row.id)
      .eq('claimed_by', auth.user.id)
      .eq('claim_plays', used)
      .select('id');
    if (error) throw new Error(error.message);
    // Lost a race with another play request from the same user: treat as not allowed.
    if (!updated?.length) return NextResponse.json({ allowed: false, playsLeft: Math.max(0, left - 1) });

    return NextResponse.json({ allowed: true, playsLeft: left - 1 });
  } catch (err) {
    return errorResponse('play', err);
  }
}
