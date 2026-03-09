import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Assignment, DailyRecord, PhonicSound, ExerciseType } from '@/lib/types';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

/**
 * GET /api/phoneme/my-assignments
 * Authorization: Bearer <access_token>
 *
 * Returns all phoneme assignments (with records) for the caller.
 * Accepts the access token via Authorization header so we don't rely on
 * cookie-based session parsing (which can be unreliable with @supabase/ssr).
 * Uses service role to bypass RLS after verifying the token.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Extract access token from Authorization header
    const authHeader = request.headers.get('Authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Verify token and get user using the service client
    const serviceClient = makeServiceClient();
    const { data: { user }, error: authErr } = await serviceClient.auth.getUser(accessToken);

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Fetch assignments for this user
    const { data: assignmentRows, error: aErr } = await serviceClient
      .from('assignments')
      .select('*')
      .eq('learner_id', user.id)
      .order('created_at', { ascending: false });

    if (aErr) throw aErr;
    if (!assignmentRows || assignmentRows.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const assignmentIds = assignmentRows.map((a: { id: string }) => a.id);

    const { data: recordRows, error: rErr } = await serviceClient
      .from('assignment_records')
      .select('*')
      .in('assignment_id', assignmentIds)
      .order('day_number', { ascending: true });

    if (rErr) throw rErr;

    const recordsByAssignment = new Map<string, DailyRecord[]>();
    for (const r of (recordRows ?? []) as Array<{
      assignment_id: string;
      day_number: number;
      date: string;
      score: number;
      completed: boolean;
      exercise_scores: Record<string, number> | null;
    }>) {
      const arr = recordsByAssignment.get(r.assignment_id) ?? [];
      arr.push({
        dayNumber: r.day_number,
        date: r.date,
        score: r.score,
        completed: r.completed,
        exerciseScores: r.exercise_scores ?? {},
      });
      recordsByAssignment.set(r.assignment_id, arr);
    }

    const assignments: Assignment[] = (assignmentRows as Array<{
      id: string;
      learner_id: string;
      sound: PhonicSound;
      exercise_type: ExerciseType;
      duration_days: number;
      start_date: string;
      current_day: number;
      status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
      last_activity: string | null;
      lock_until: string | null;
    }>).map(row => ({
      id: row.id,
      sound: row.sound,
      learnerId: row.learner_id,
      durationDays: row.duration_days,
      startDate: row.start_date,
      currentDay: row.current_day,
      records: recordsByAssignment.get(row.id) ?? [],
      status: row.status,
      lastActivityDate: row.last_activity,
      type: row.exercise_type,
      lockUntil: row.lock_until ?? undefined,
    }));

    return NextResponse.json({ assignments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch assignments';
    console.error('[phoneme/my-assignments] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
