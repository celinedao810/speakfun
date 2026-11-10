import { SupabaseClient } from '@supabase/supabase-js';
import type { InterviewSelection } from '@/lib/lessonHub/types';

// Interview picks per class × learner × track. Teacher-only data: used from the teacher
// portal (RLS-scoped client) and read by the MCP connector (service-role client), so every
// query filters by teacher explicitly.

interface Row {
  class_id: string;
  learner_id: string;
  track: string;
  intake: InterviewSelection['intake'] | null;
  intake_updated_at: string | null;
  intake_changed: boolean | null;
  picks: InterviewSelection['picks'] | null;
  custom: InterviewSelection['custom'] | null;
  updated_at: string | null;
}

const COLS = 'class_id, learner_id, track, intake, intake_updated_at, intake_changed, picks, custom, updated_at';

const fromRow = (r: Row): InterviewSelection => ({
  classId: r.class_id,
  learnerId: r.learner_id,
  track: r.track,
  intake: r.intake ?? {},
  intakeUpdatedAt: r.intake_updated_at,
  intakeChanged: !!r.intake_changed,
  picks: r.picks ?? [],
  custom: r.custom ?? [],
  updatedAt: r.updated_at,
});

export async function fetchInterviewSelections(
  supabase: SupabaseClient, teacherId: string,
  filter: { track: string; classId?: string; learnerId?: string },
): Promise<InterviewSelection[]> {
  let q = supabase.from('interview_selections').select(COLS).eq('teacher_id', teacherId).eq('track', filter.track);
  if (filter.classId) q = q.eq('class_id', filter.classId);
  if (filter.learnerId) q = q.eq('learner_id', filter.learnerId);
  const { data, error } = await q;
  if (error) throw new Error(`Loading interview picks failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function saveInterviewSelection(
  supabase: SupabaseClient, teacherId: string, sel: InterviewSelection,
): Promise<void> {
  const { error } = await supabase.from('interview_selections').upsert({
    teacher_id: teacherId,
    class_id: sel.classId,
    learner_id: sel.learnerId,
    track: sel.track,
    intake: sel.intake,
    intake_updated_at: sel.intakeUpdatedAt,
    intake_changed: sel.intakeChanged,
    picks: sel.picks,
    custom: sel.custom,
    updated_at: sel.updatedAt ?? new Date().toISOString(),
  }, { onConflict: 'class_id,learner_id,track' });
  if (error) throw new Error(`Saving interview picks failed: ${error.message}`);
}
