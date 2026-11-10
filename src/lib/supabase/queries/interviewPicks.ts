import { SupabaseClient } from '@supabase/supabase-js';
import type { InterviewPicks } from '@/lib/lessonHub/types';

// The class's interview pick list, one row per track. Used from the lesson hub (RLS-scoped
// client) and read by the MCP connector (service-role client), so every query filters by teacher.

interface Row { track: string; picks: InterviewPicks['picks'] | null; requested: InterviewPicks['requested'] | null; updated_at: string | null }

const fromRow = (r: Row): InterviewPicks => ({
  track: r.track, picks: r.picks ?? [], requested: r.requested ?? [], updatedAt: r.updated_at,
});

/** Every track's list, keyed by track. */
export async function fetchInterviewPicks(supabase: SupabaseClient, teacherId: string): Promise<Record<string, InterviewPicks>> {
  const { data, error } = await supabase.from('interview_picks')
    .select('track, picks, requested, updated_at').eq('teacher_id', teacherId);
  if (error) throw new Error(`Loading interview picks failed: ${error.message}`);
  return Object.fromEntries(((data ?? []) as Row[]).map(r => [r.track, fromRow(r)]));
}

export async function saveInterviewPicks(supabase: SupabaseClient, teacherId: string, p: InterviewPicks): Promise<void> {
  const { error } = await supabase.from('interview_picks').upsert({
    teacher_id: teacherId, track: p.track, picks: p.picks, requested: p.requested,
    updated_at: p.updatedAt ?? new Date().toISOString(),
  }, { onConflict: 'teacher_id,track' });
  if (error) throw new Error(`Saving interview picks failed: ${error.message}`);
}

/** The series is over: empty the list for the next class. The bank is untouched. */
export async function clearInterviewPicks(supabase: SupabaseClient, teacherId: string, track: string): Promise<void> {
  const { error } = await supabase.from('interview_picks').delete().eq('teacher_id', teacherId).eq('track', track);
  if (error) throw new Error(`Clearing interview picks failed: ${error.message}`);
}
