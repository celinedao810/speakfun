import type { SupabaseClient } from '@supabase/supabase-js';
import { plainStructure } from '@/lib/games/sentenceBuilder';

/*
 * Saved homework patterns lose their [slot] brackets when a lesson is extracted
 * ("Today I'd like to show you feature."). The scorer needs to know which words are the
 * frame and which are slots, so this finds the same structure in the lesson's teacher's
 * Lesson Plans topics and returns it with its brackets. lesson_topics is teacher-only,
 * so pass a service-role client. Returns null when no hub frame matches.
 */
export async function findStructureFrame(db: SupabaseClient, lessonId: string, pattern: string): Promise<string | null> {
  const { data: lesson } = await db.from('lessons').select('courses(teacher_id)').eq('id', lessonId).maybeSingle();
  const teacherId = (lesson?.courses as { teacher_id?: string } | null)?.teacher_id;
  if (!teacherId) return null;

  const { data: topics } = await db.from('lesson_topics').select('structures:data->structures').eq('teacher_id', teacherId);
  const target = plainStructure(pattern.trim().replace(/^"(.*)"$/, '$1'));
  for (const t of topics ?? []) {
    for (const s of ((t as { structures?: { structure?: string }[] }).structures ?? [])) {
      if (s.structure?.includes('[') && plainStructure(s.structure) === target) return s.structure;
    }
  }
  return null;
}
