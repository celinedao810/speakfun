import { NextRequest, NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { buildClaimView, errorResponse, MessageRow, requireUser, serviceClient } from '@/lib/voiceChain/server';

/**
 * POST /api/voice-chain/open { messageId }
 * Opens the envelope the caller is holding: from now on they have
 * VOICE_CHAIN.claimSeconds to start answering. Opening an already-open claim just
 * returns it. If the hold ran out first, the message went back to the mailbox (410).
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
      return NextResponse.json({ error: 'That envelope went back to the mailbox — tap to check again.' }, { status: 410 });
    }
    if (row.claim_opened_at) return NextResponse.json({ claim: await buildClaimView(svc, row) });

    const now = new Date();
    const { data: opened, error } = await svc
      .from('voice_chain_messages')
      .update({
        claim_opened_at: now.toISOString(),
        claim_expires_at: new Date(now.getTime() + VOICE_CHAIN.claimSeconds * 1000).toISOString(),
      })
      .eq('id', row.id)
      .eq('claimed_by', auth.user.id)
      .eq('status', 'claimed')
      .is('claim_opened_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!opened) {
      // Opened by a parallel request a moment ago: return the current state
      const { data: latest } = await svc.from('voice_chain_messages').select('*').eq('id', row.id).maybeSingle();
      if (!latest) return NextResponse.json({ error: 'That envelope went back to the mailbox — tap to check again.' }, { status: 410 });
      return NextResponse.json({ claim: await buildClaimView(svc, latest as MessageRow) });
    }
    return NextResponse.json({ claim: await buildClaimView(svc, opened as MessageRow) });
  } catch (err) {
    return errorResponse('open', err);
  }
}
