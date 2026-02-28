import { SupabaseClient } from '@supabase/supabase-js';
import { Assignment, DailyRecord, PhonicSound, ExerciseType } from '@/lib/types';

// --- Row types (snake_case, matching DB columns) ---

interface AssignmentRow {
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
  created_at: string;
}

interface RecordRow {
  id: string;
  assignment_id: string;
  day_number: number;
  date: string;
  score: number;
  completed: boolean;
  exercise_scores: Record<string, number> | null;
}

// --- Conversion helpers ---

function toAssignment(row: AssignmentRow, records: RecordRow[]): Assignment {
  return {
    id: row.id,
    sound: row.sound,
    learnerId: row.learner_id,
    durationDays: row.duration_days,
    startDate: row.start_date,
    currentDay: row.current_day,
    records: records
      .sort((a, b) => a.day_number - b.day_number)
      .map(r => ({
        dayNumber: r.day_number,
        date: r.date,
        score: r.score,
        completed: r.completed,
        exerciseScores: r.exercise_scores || {},
      })),
    status: row.status,
    lastActivityDate: row.last_activity,
    type: row.exercise_type,
    lockUntil: row.lock_until || undefined,
  };
}

function toAssignmentRow(a: Assignment, learnerId: string) {
  return {
    id: a.id,
    learner_id: learnerId,
    sound: a.sound,
    exercise_type: a.type,
    duration_days: a.durationDays,
    start_date: a.startDate,
    current_day: a.currentDay,
    status: a.status,
    last_activity: a.lastActivityDate,
    lock_until: a.lockUntil || null,
  };
}

function toRecordRow(r: DailyRecord, assignmentId: string) {
  return {
    assignment_id: assignmentId,
    day_number: r.dayNumber,
    date: r.date,
    score: r.score,
    completed: r.completed,
    exercise_scores: r.exerciseScores,
  };
}

// --- Query functions ---

export async function fetchAssignments(
  supabase: SupabaseClient,
  learnerId: string
): Promise<Assignment[]> {
  const { data: assignmentRows, error: aErr } = await supabase
    .from('assignments')
    .select('*')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false });

  if (aErr) throw aErr;
  if (!assignmentRows || assignmentRows.length === 0) return [];

  const assignmentIds = assignmentRows.map((a: AssignmentRow) => a.id);

  const { data: recordRows, error: rErr } = await supabase
    .from('assignment_records')
    .select('*')
    .in('assignment_id', assignmentIds);

  if (rErr) throw rErr;

  const recordsByAssignment = new Map<string, RecordRow[]>();
  for (const r of (recordRows || []) as RecordRow[]) {
    const existing = recordsByAssignment.get(r.assignment_id) || [];
    existing.push(r);
    recordsByAssignment.set(r.assignment_id, existing);
  }

  return assignmentRows.map((row: AssignmentRow) =>
    toAssignment(row, recordsByAssignment.get(row.id) || [])
  );
}

export async function insertAssignment(
  supabase: SupabaseClient,
  assignment: Assignment,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .upsert(toAssignmentRow(assignment, learnerId), { onConflict: 'id' });

  if (error) throw error;
}

export async function insertAssignments(
  supabase: SupabaseClient,
  assignments: Assignment[],
  learnerId: string
): Promise<void> {
  if (assignments.length === 0) return;

  const rows = assignments.map(a => toAssignmentRow(a, learnerId));
  const { error } = await supabase
    .from('assignments')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

export async function updateAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  updates: {
    status?: 'ACTIVE' | 'COMPLETED' | 'FAILED';
    lock_until?: string | null;
    last_activity?: string | null;
    current_day?: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update(updates)
    .eq('id', assignmentId);

  if (error) throw error;
}

export async function insertRecord(
  supabase: SupabaseClient,
  record: DailyRecord,
  assignmentId: string
): Promise<void> {
  const { error } = await supabase
    .from('assignment_records')
    .upsert(toRecordRow(record, assignmentId), {
      onConflict: 'assignment_id,day_number',
    });

  if (error) throw error;
}

export async function insertRecords(
  supabase: SupabaseClient,
  records: { record: DailyRecord; assignmentId: string }[]
): Promise<void> {
  if (records.length === 0) return;

  const rows = records.map(({ record, assignmentId }) =>
    toRecordRow(record, assignmentId)
  );
  const { error } = await supabase
    .from('assignment_records')
    .upsert(rows, { onConflict: 'assignment_id,day_number' });

  if (error) throw error;
}

export async function resetAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<void> {
  // Delete all records for this assignment
  const { error: delErr } = await supabase
    .from('assignment_records')
    .delete()
    .eq('assignment_id', assignmentId);

  if (delErr) throw delErr;

  // Reset assignment fields
  const { error: updErr } = await supabase
    .from('assignments')
    .update({
      current_day: 1,
      status: 'ACTIVE',
      last_activity: null,
      lock_until: null,
    })
    .eq('id', assignmentId);

  if (updErr) throw updErr;
}
