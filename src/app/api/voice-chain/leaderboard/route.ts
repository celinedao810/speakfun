import { NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { errorResponse, requireUser, serviceClient, weekStartUtc7 } from '@/lib/voiceChain/server';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/voiceChain/types';

/**
 * GET /api/voice-chain/leaderboard — this week's (Mon–Sun, UTC+7) totals across SpeakFun
 * (nicknames only), plus the length of the longest chain with a message sent this week.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const weekStart = weekStartUtc7();
    const svc = serviceClient();
    const [{ data, error }, longest] = await Promise.all([
      svc.rpc('voice_chain_leaderboard', { p_from: weekStart }),
      // A chain's length is its highest chain_position; a chain that started before Monday counts in full
      svc.from('voice_chain_messages').select('chain_position')
        .gte('day', weekStart).neq('status', 'removed')
        .order('chain_position', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    const all: LeaderboardRow[] = ((data ?? []) as Record<string, unknown>[]).map((r, i) => ({
      rank: i + 1,
      nickname: r.nickname as string,
      messagesSent: Number(r.messages_sent) || 0,
      speakingSeconds: Number(r.speaking_seconds) || 0,
      totalScore: Number(r.total_score) || 0,
      isMe: r.user_id === auth.user.id,
    }));
    const rows = all.slice(0, VOICE_CHAIN.leaderboardSize);
    const me = rows.some(r => r.isMe) ? null : all.find(r => r.isMe) ?? null;

    const body: LeaderboardResponse = { weekStart, rows, me, longestChain: Number(longest.data?.chain_position) || 0 };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse('leaderboard', err);
  }
}
