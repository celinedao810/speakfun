import { NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import {
  buildClaimView, errorResponse, getNickname, getTodayStats, MessageRow, purgeExpired, requireUser, serviceClient, todayUtc7,
} from '@/lib/voiceChain/server';
import type { StatusResponse } from '@/lib/voiceChain/types';

/** GET /api/voice-chain/status — everything the Play screen needs in one call. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  try {
    const svc = serviceClient();
    // Cheap housekeeping: frees timed-out claims and purges a few expired recordings.
    await purgeExpired(svc, 20).catch(err => console.error('[voice-chain/status] purge failed:', err));

    const minExpiry = new Date(Date.now() + (VOICE_CHAIN.claimSeconds + VOICE_CHAIN.claimGraceSeconds) * 1000).toISOString();
    const [nickname, openRes, startersRes, claimRes, today] = await Promise.all([
      getNickname(svc, userId),
      svc.from('voice_chain_messages').select('id', { count: 'exact', head: true })
        .eq('status', 'open').neq('sender_id', userId).gt('expires_at', minExpiry),
      svc.from('voice_chain_messages').select('id', { count: 'exact', head: true })
        .eq('sender_id', userId).eq('day', todayUtc7()).eq('chain_position', 1),
      svc.from('voice_chain_messages').select('*').eq('claimed_by', userId).eq('status', 'claimed')
        .gt('claim_expires_at', new Date().toISOString()).maybeSingle(),
      getTodayStats(svc, userId),
    ]);

    const body: StatusResponse = {
      nickname,
      openCount: openRes.count ?? 0,
      startersLeft: Math.max(0, VOICE_CHAIN.startersPerDay - (startersRes.count ?? 0)),
      activeClaim: claimRes.data ? await buildClaimView(svc, claimRes.data as MessageRow) : null,
      today,
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse('status', err);
  }
}
