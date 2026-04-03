import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fetchLearnerProgressForClass,
  fetchAllLearnersProgressForClass,
  fetchLessonExercisesForLessons,
} from '@/lib/supabase/queries/homework';
import { fetchLessonsForClassCourses } from '@/lib/supabase/queries/sessions';

/**
 * GET /api/homework/progress?classId=xxx
 *   Learner: returns { pairs: { window, submission }[] }
 *
 * GET /api/homework/progress?classId=xxx&all=true
 *   Teacher: returns { windows, enrollments, submissions }
 *   Requires the authenticated user to own the class.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const allFlag = searchParams.get('all') === 'true';

    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (allFlag) {
      // Teacher gate: verify class ownership
      const { data: cls } = await supabase
        .from('classes')
        .select('id')
        .eq('id', classId)
        .eq('teacher_id', user.id)
        .maybeSingle();
      if (!cls) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const data = await fetchAllLearnersProgressForClass(supabase, classId);
      return NextResponse.json(data);
    }

    const pairs = await fetchLearnerProgressForClass(supabase, user.id, classId);

    // Count lessons with ready exercises
    const courseLessons = await fetchLessonsForClassCourses(supabase, classId);
    const allLessonIds = [...new Set(courseLessons.map((cl: { lessonId: string }) => cl.lessonId))];
    const allExercises = await fetchLessonExercisesForLessons(supabase, allLessonIds);
    const readyLessonCount = allExercises.filter(e => e.generationStatus === 'DONE' && e.generatedAt).length;

    // Fetch lesson titles for regular sessions
    const lessonIds = [...new Set(
      pairs.map(p => p.window.cycleLessonId).filter((id): id is string => !!id)
    )];
    const lessonMap: Record<string, string> = {};
    if (lessonIds.length > 0) {
      const { data: lessonRows } = await supabase
        .from('lessons')
        .select('id, title')
        .in('id', lessonIds);
      if (lessonRows) {
        for (const row of lessonRows as { id: string; title: string }[]) {
          lessonMap[row.id] = row.title;
        }
      }
    }

    return NextResponse.json({ pairs, lessons: lessonMap, readyLessonCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch progress';
    console.error('[homework/progress] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
