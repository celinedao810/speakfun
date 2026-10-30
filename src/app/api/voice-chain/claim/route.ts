import { NextRequest, NextResponse } from 'next/server';
import { isMode, VOICE_CHAIN } from '@/lib/voiceChain/config';
import { buildClaimView, errorResponse, getNickname, MessageRow, requireUser, serviceClient } from '@/lib/voiceChain/server';

/**
 * POST /api/voice-chain/claim { mode }
 * Picks up the oldest message the caller may answer (first come, first served),
 * or returns the claim they already hold. Never returns the letter.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  if (!isMode(body.mode)) return NextResponse.json({ error: 'mode must be relaxed or realtalk' }, { status: 400 });

  try {
    const svc = serviceClient();
    if (!(await getNickname(svc, auth.user.id))) {
      return NextResponse.json({ error: 'Set a nickname first' }, { status: 403 });
    }

    const { data, error } = await svc.rpc('voice_chain_claim_next', {
      p_user: auth.user.id,
      p_mode: body.mode,
      p_hold_seconds: VOICE_CHAIN.envelopeHoldSeconds,
      p_claim_seconds: VOICE_CHAIN.claimSeconds,
      p_grace_seconds: VOICE_CHAIN.claimGraceSeconds,
    });
    if (error) {
      // Two claim requests raced: the unique "one claim per user" index rejected the second.
      if (error.code === '23505') return NextResponse.json({ error: 'You already have a message open' }, { status: 409 });
      throw new Error(error.message);
    }

    const row = (data as MessageRow[] | null)?.[0];
    if (!row) return NextResponse.json({ claim: null });
    return NextResponse.json({ claim: await buildClaimView(svc, row) });
  } catch (err) {
    return errorResponse('claim', err);
  }
}
