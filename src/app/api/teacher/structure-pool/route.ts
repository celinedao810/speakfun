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
      return NextResponse.json({ patterns: [], total: 0 });
    }

    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', courseIds);
    const lessonIds = (lessonRows ?? []).map((r: { id: string }) => r.id);

    if (lessonIds.length === 0) {
      return NextResponse.json({ patterns: [], total: 0 });
    }

    const lessonExercises = await fetchLessonExercisesForLessons(supabase, lessonIds);

    const seen = new Set<string>();
    const patterns: string[] = [];
    for (const ex of lessonExercises) {
      for (const item of ex.structureItems) {
        const key = item.pattern.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          patterns.push(item.pattern);
        }
      }
    }

    return NextResponse.json({ patterns, total: patterns.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch structure pool';
    console.error('[teacher/structure-pool] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
