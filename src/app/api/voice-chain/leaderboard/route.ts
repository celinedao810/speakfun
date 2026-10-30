import { NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { errorResponse, requireUser, serviceClient, weekStartUtc7 } from '@/lib/voiceChain/server';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/voiceChain/types';

/** GET /api/voice-chain/leaderboard — this week's (Mon–Sun, UTC+7) totals across SpeakFun. Nicknames only. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const weekStart = weekStartUtc7();
    const { data, error } = await serviceClient().rpc('voice_chain_leaderboard', { p_from: weekStart });
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

    const body: LeaderboardResponse = { weekStart, rows, me };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse('leaderboard', err);
  }
}
