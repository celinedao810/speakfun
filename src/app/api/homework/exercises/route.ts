import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchLessonExercisesForLessons } from '@/lib/supabase/queries/homework';

/**
 * GET /api/homework/exercises?lessonIds=a,b,c
 *
 * Returns exercise data (vocab, structures, dialogues) for the given lesson IDs.
 * Used by learners to load their homework session.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lessonIdsParam = searchParams.get('lessonIds');
    if (!lessonIdsParam) {
      return NextResponse.json({ error: 'lessonIds is required' }, { status: 400 });
    }

    const lessonIds = lessonIdsParam.split(',').filter(Boolean);
    if (lessonIds.length === 0) {
      return NextResponse.json([]);
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const exercises = await fetchLessonExercisesForLessons(supabase, lessonIds);
    return NextResponse.json(exercises);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch exercises';
    console.error('[homework/exercises] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
