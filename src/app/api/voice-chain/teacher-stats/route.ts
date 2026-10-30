import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { emptyDay, errorResponse, serviceClient, shiftDay, toDayStats, todayUtc7 } from '@/lib/voiceChain/server';
import type { DayStats, TeacherLearnerStats } from '@/lib/voiceChain/types';

/**
 * GET /api/voice-chain/teacher-stats?classId=&days=7
 * Voice Chain activity of the learners enrolled in one of the caller's classes,
 * by real name. Nicknames are not included, so learners stay anonymous in the game.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const classId = request.nextUrl.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });
  const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '7', 10) || 7));

  try {
    const { data: cls } = await supabase.from('classes').select('id').eq('id', classId).eq('teacher_id', user.id).maybeSingle();
    if (!cls) return NextResponse.json({ error: 'Not your class' }, { status: 403 });

    const svc = serviceClient();
    const { data: enrollments, error: enrollError } = await svc
      .from('class_enrollments')
      .select('learner_id, profiles(full_name)')
      .eq('class_id', classId);
    if (enrollError) throw new Error(enrollError.message);

    const learners = (enrollments ?? []).map(e => ({
      id: e.learner_id as string,
      name: ((e.profiles as unknown as { full_name?: string } | null)?.full_name) || 'Learner',
    }));
    if (learners.length === 0) return NextResponse.json({ learners: [] });

    const today = todayUtc7();
    const from = shiftDay(today, days - 1);
    const { data: statRows, error: statsError } = await svc
      .from('voice_chain_daily_stats')
      .select('*')
      .in('user_id', learners.map(l => l.id))
      .gte('day', from);
    if (statsError) throw new Error(statsError.message);

    const byLearner = new Map<string, Map<string, DayStats>>();
    for (const r of statRows ?? []) {
      const uid = r.user_id as string;
      if (!byLearner.has(uid)) byLearner.set(uid, new Map());
      byLearner.get(uid)!.set(r.day as string, toDayStats(r));
    }

    const result: TeacherLearnerStats[] = learners.map(l => {
      const map = byLearner.get(l.id) ?? new Map<string, DayStats>();
      const series: DayStats[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const day = shiftDay(today, i);
        series.push(map.get(day) ?? emptyDay(day));
      }
      return {
        learnerId: l.id,
        name: l.name,
        days: series,
        messagesSent: series.reduce((s, d) => s + d.messagesSent, 0),
        speakingSeconds: series.reduce((s, d) => s + d.speakingSeconds, 0),
        totalScore: series.reduce((s, d) => s + d.totalScore, 0),
        activeDays: series.filter(d => d.messagesSent > 0).length,
      };
    });
    result.sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name));
    return NextResponse.json({ learners: result });
  } catch (err) {
    return errorResponse('teacher-stats', err);
  }
}
