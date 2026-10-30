import { NextResponse } from 'next/server';
import { BadgeStats, computeStreaks } from '@/lib/voiceChain/badges';
import { errorResponse, requireUser, serviceClient, todayUtc7 } from '@/lib/voiceChain/server';

/**
 * GET /api/voice-chain/badges — the numbers badges are based on, for the caller.
 * Derived from the message history (rows outlive the 24h audio purge); the
 * client decides which badges are earned with evaluateBadges().
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  try {
    const svc = serviceClient();
    const [daysRes, bestRes, earsRes, realTalkRes] = await Promise.all([
      svc.from('voice_chain_daily_stats').select('day, messages_sent, speaking_seconds, total_score').eq('user_id', userId),
      svc.from('voice_chain_messages').select('score_total').eq('sender_id', userId).neq('status', 'removed')
        .order('score_total', { ascending: false }).limit(1).maybeSingle(),
      svc.from('voice_chain_messages').select('id', { count: 'exact', head: true })
        .eq('sender_id', userId).gt('chain_position', 1).eq('letter_revealed', false).neq('status', 'removed'),
      svc.from('voice_chain_messages').select('id', { count: 'exact', head: true })
        .eq('sender_id', userId).eq('mode', 'realtalk').neq('status', 'removed'),
    ]);
    if (daysRes.error) throw new Error(daysRes.error.message);

    const days = daysRes.data ?? [];
    const streaks = computeStreaks(
      days.filter(d => Number(d.messages_sent) > 0).map(d => d.day as string),
      todayUtc7(),
    );
    const stats: BadgeStats = {
      messages: days.reduce((s, d) => s + (Number(d.messages_sent) || 0), 0),
      speakingSeconds: days.reduce((s, d) => s + (Number(d.speaking_seconds) || 0), 0),
      totalScore: days.reduce((s, d) => s + (Number(d.total_score) || 0), 0),
      bestScore: Number(bestRes.data?.score_total) || 0,
      sharpEars: earsRes.count ?? 0,
      realTalk: realTalkRes.count ?? 0,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
    };
    return NextResponse.json({ stats });
  } catch (err) {
    return errorResponse('badges', err);
  }
}
