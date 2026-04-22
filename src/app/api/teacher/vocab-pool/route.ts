import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchLessonExercisesForLessons } from '@/lib/supabase/queries/homework';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: courseRows } = await supabase
      .from('courses')
      .select('id')
      .eq('teacher_id', user.id);
    const courseIds = (courseRows ?? []).map((r: { id: string }) => r.id);

    if (courseIds.length === 0) {
      return NextResponse.json({ words: [], total: 0 });
    }

    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', courseIds);
    const lessonIds = (lessonRows ?? []).map((r: { id: string }) => r.id);

    if (lessonIds.length === 0) {
      return NextResponse.json({ words: [], total: 0 });
    }

    const lessonExercises = await fetchLessonExercisesForLessons(supabase, lessonIds);

    const seen = new Set<string>();
    const words: string[] = [];
    for (const ex of lessonExercises) {
      for (const item of ex.vocabItems) {
        const key = item.word.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          words.push(item.word);
        }
      }
    }

    return NextResponse.json({ words, total: words.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vocab pool';
    console.error('[teacher/vocab-pool] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
