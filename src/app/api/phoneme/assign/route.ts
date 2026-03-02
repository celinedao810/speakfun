import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { PHONETIC_SOUNDS } from '@/lib/constants';
import { ExerciseType } from '@/lib/types';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

/**
 * POST /api/phoneme/assign
 * Body: { soundId: string, learnerId: string }
 *
 * Creates a phoneme assignment for a learner in one of the teacher's classes.
 * Uses service-role client to bypass RLS (teacher writes for another user).
 */
export async function POST(request: NextRequest) {
  try {
    const { soundId, learnerId } = await request.json();

    if (!soundId || !learnerId) {
      return NextResponse.json({ error: 'soundId and learnerId are required' }, { status: 400 });
    }

    // 1. Auth: teacher must be logged in
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Security: verify learner is enrolled in one of this teacher's classes
    const { data: teacherClasses } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', user.id);

    const classIds = (teacherClasses ?? []).map((c: { id: string }) => c.id);
    if (classIds.length === 0) {
      return NextResponse.json({ error: 'You have no classes' }, { status: 403 });
    }

    const { data: enrollment } = await supabase
      .from('class_enrollments')
      .select('id')
      .eq('learner_id', learnerId)
      .in('class_id', classIds)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ error: 'Learner is not enrolled in any of your classes' }, { status: 403 });
    }

    // 3. Look up the sound
    const sound = PHONETIC_SOUNDS.find(s => s.id === soundId);
    if (!sound) {
      return NextResponse.json({ error: 'Unknown sound id' }, { status: 400 });
    }

    // 4. Determine exercise type
    const type: ExerciseType =
      sound.type === 'ENDING_PATTERN' ? 'ENDING_SOUNDS' :
      sound.type === 'LINKING_PATTERN' ? 'LINKING_SOUNDS' :
      'PHONETIC_DAY';

    // 5. Build assignment row
    const now = new Date().toISOString();
    const assignmentId = Math.random().toString(36).substr(2, 9);
    const row = {
      id: assignmentId,
      learner_id: learnerId,
      sound,
      exercise_type: type,
      duration_days: 1,
      start_date: now,
      current_day: 1,
      status: 'ACTIVE',
      last_activity: null,
      lock_until: null,
    };

    // 6. Insert using service role to bypass RLS
    const serviceClient = makeServiceClient();
    const { error } = await serviceClient
      .from('assignments')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ success: true, assignmentId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign phoneme';
    console.error('[phoneme/assign] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
