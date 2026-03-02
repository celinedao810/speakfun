import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { Assignment, DailyRecord, PhonicSound, ExerciseType } from '@/lib/types';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export interface LearnerAssignmentGroup {
  learnerId: string;
  learnerName: string;
  assignments: Assignment[];
}

/**
 * GET /api/phoneme/learner-assignments
 *
 * Returns all phoneme assignments (with session records) for every learner
 * enrolled in any of the authenticated teacher's classes.
 * Uses service role to bypass RLS.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = makeServiceClient();

    // 1. Teacher's class IDs
    const { data: teacherClasses } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', user.id);

    const classIds = (teacherClasses ?? []).map((c: { id: string }) => c.id);
    if (classIds.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    // 2. Enrolled learners
    const { data: enrollmentRows } = await serviceClient
      .from('class_enrollments')
      .select('learner_id, profiles:learner_id(full_name)')
      .in('class_id', classIds);

    if (!enrollmentRows || enrollmentRows.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    // Deduplicate (learner may be in multiple classes)
    const learnerMap = new Map<string, string>();
    for (const row of (enrollmentRows as unknown) as Array<{ learner_id: string; profiles: { full_name: string } | null }>) {
      if (!learnerMap.has(row.learner_id)) {
        learnerMap.set(row.learner_id, row.profiles?.full_name ?? 'Unknown');
      }
    }
    const learnerIds = [...learnerMap.keys()];

    // 3. Assignments for those learners
    const { data: assignmentRows } = await serviceClient
      .from('assignments')
      .select('*')
      .in('learner_id', learnerIds)
      .order('created_at', { ascending: false });

    if (!assignmentRows || assignmentRows.length === 0) {
      const groups: LearnerAssignmentGroup[] = learnerIds.map(id => ({
        learnerId: id,
        learnerName: learnerMap.get(id) ?? 'Unknown',
        assignments: [],
      }));
      return NextResponse.json({ groups });
    }

    const assignmentIds = assignmentRows.map((a: { id: string }) => a.id);

    // 4. Records for those assignments
    const { data: recordRows } = await serviceClient
      .from('assignment_records')
      .select('*')
      .in('assignment_id', assignmentIds)
      .order('day_number', { ascending: true });

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

    // 5. Assemble groups
    const assignmentsByLearner = new Map<string, Assignment[]>();
    for (const row of assignmentRows as Array<{
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
    }>) {
      const assignment: Assignment = {
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
      };
      const arr = assignmentsByLearner.get(row.learner_id) ?? [];
      arr.push(assignment);
      assignmentsByLearner.set(row.learner_id, arr);
    }

    const groups: LearnerAssignmentGroup[] = learnerIds.map(id => ({
      learnerId: id,
      learnerName: learnerMap.get(id) ?? 'Unknown',
      assignments: assignmentsByLearner.get(id) ?? [],
    }));

    // Sort: learners with active assignments first
    groups.sort((a, b) => {
      const aActive = a.assignments.filter(x => x.status === 'ACTIVE').length;
      const bActive = b.assignments.filter(x => x.status === 'ACTIVE').length;
      return bActive - aActive;
    });

    return NextResponse.json({ groups });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch learner assignments';
    console.error('[phoneme/learner-assignments] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
