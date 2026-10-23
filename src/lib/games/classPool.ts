import type { SupabaseClient } from '@supabase/supabase-js';
import { plainStructure, structureKey, vocabKey, type GamePool, type PoolStructure, type PoolVocab } from '@/lib/games/sentenceBuilder';
import type { StructureExerciseItem, VocabExerciseItem } from '@/lib/types';

/*
 * One class's game pool: the vocabulary and structures saved for every lesson uploaded to the
 * class's courses (the same items homework uses), so each class only sees its own material and a
 * newly uploaded lesson joins the pool by itself. Needs a client that can read the class's rows.
 */
export async function buildClassPool(db: SupabaseClient, cls: { id: string; name: string; teacher_id: string }, withRoster: boolean): Promise<GamePool> {
  const classId = cls.id;
  // Lessons in course order (the class's course list, then each course's lesson order)
  const { data: links } = await db.from('class_courses').select('course_id, position').eq('class_id', classId);
  const coursePos = new Map((links ?? []).map(l => [l.course_id as string, l.position as number]));
  const { data: lessonRows } = coursePos.size
    ? await db.from('lessons').select('id, title, course_id, sort_order, created_at').in('course_id', [...coursePos.keys()])
    : { data: [] };
  const lessons = (lessonRows ?? []).sort((a, b) =>
    (coursePos.get(a.course_id)! - coursePos.get(b.course_id)!) || (a.sort_order - b.sort_order)
    || String(a.created_at).localeCompare(String(b.created_at)));
  const lessonNo = new Map(lessons.map((l, i) => [l.id as string, i + 1]));

  const [{ data: exercises }, { data: topics }, roster] = await Promise.all([
    lessons.length
      ? db.from('lesson_exercises').select('lesson_id, vocab_items, structure_items')
          .in('lesson_id', lessons.map(l => l.id)).eq('generation_status', 'DONE')
      : Promise.resolve({ data: [] as { lesson_id: string; vocab_items: unknown; structure_items: unknown }[] }),
    // Lesson Plans frames, used only to put the [slot] brackets back into saved patterns
    db.from('lesson_topics').select('structures:data->structures').eq('teacher_id', cls.teacher_id),
    withRoster
      ? db.from('class_enrollments').select('profiles:learner_id(full_name)').eq('class_id', classId).order('enrolled_at')
      : Promise.resolve({ data: null }),
  ]);

  const framed = new Map<string, string>();
  for (const t of topics ?? []) {
    for (const s of ((t as { structures?: { structure?: string }[] }).structures ?? [])) {
      if (s.structure?.includes('[')) framed.set(plainStructure(s.structure), s.structure);
    }
  }

  const vocab: PoolVocab[] = [];
  const structures: PoolStructure[] = [];
  const seen = new Set<string>();
  const rows = (exercises ?? []).sort((a, b) => lessonNo.get(a.lesson_id)! - lessonNo.get(b.lesson_id)!);
  for (const ex of rows) {
    const lesson = lessonNo.get(ex.lesson_id)!;
    for (const v of (ex.vocab_items ?? []) as VocabExerciseItem[]) {
      if (!v.word?.trim()) continue;
      const key = vocabKey(v.word);
      if (seen.has(key)) continue;     // the same word in two lessons: keep the first
      seen.add(key);
      // clues are saved as "(phr.v): definition"
      const m = /^\s*\(([^)]+)\)\s*:?\s*/.exec(v.clue ?? '');
      vocab.push({ key, word: v.word.trim(), pos: m ? m[1] : '', definition: m ? v.clue.slice(m[0].length) : (v.clue ?? ''),
        example: v.exampleSentence ?? '', lesson });
    }
    for (const s of (ex.structure_items ?? []) as StructureExerciseItem[]) {
      if (!s.pattern?.trim()) continue;
      const pattern = s.pattern.trim().replace(/^"(.*)"$/, '$1');
      const key = structureKey(pattern);
      if (seen.has(key)) continue;
      seen.add(key);
      structures.push({ key, text: framed.get(plainStructure(pattern)) ?? pattern, pattern: s.pattern,
        intent: s.explanation ?? '', example: s.exampleSentence ?? '', lesson });
    }
  }

  const pool: GamePool = {
    classId, className: cls.name,
    lessons: lessons.map((l, i) => ({ no: i + 1, title: l.title })),
    vocab, structures,
    ...(roster.data ? { learners: (roster.data as unknown as { profiles: { full_name?: string } | null }[])
      .map(r => r.profiles?.full_name?.trim()).filter((n): n is string => !!n) } : {}),
  };
  return pool;
}
