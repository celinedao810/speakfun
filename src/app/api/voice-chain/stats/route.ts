import { NextRequest, NextResponse } from 'next/server';
import { emptyDay, errorResponse, requireUser, serviceClient, shiftDay, toDayStats, todayUtc7 } from '@/lib/voiceChain/server';
import type { DayStats } from '@/lib/voiceChain/types';

/** GET /api/voice-chain/stats?days=7 — the caller's daily totals, oldest first, gaps filled with zeros. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '7', 10) || 7));
  const today = todayUtc7();
  const from = shiftDay(today, days - 1);

  try {
    const { data, error } = await serviceClient()
      .from('voice_chain_daily_stats')
      .select('*')
      .eq('user_id', auth.user.id)
      .gte('day', from);
    if (error) throw new Error(error.message);

    const byDay = new Map((data ?? []).map(r => [r.day as string, toDayStats(r)]));
    const series: DayStats[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = shiftDay(today, i);
      series.push(byDay.get(day) ?? emptyDay(day));
    }
    return NextResponse.json({ days: series });
  } catch (err) {
    return errorResponse('stats', err);
  }
}
