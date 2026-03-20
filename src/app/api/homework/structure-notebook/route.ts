import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fetchStructureMastery,
  fetchLessonExercisesForLessons,
  fetchClassHomeworkSettings,
} from '@/lib/supabase/queries/homework';

export interface StructureNotebookEntry {
  structureItemId: string;
  pattern: string;
  explanation: string;
  lessonId: string;
  correctCount: number;
  incorrectCount: number;
  isCommitted: boolean;
  lastSeenAt?: string;
  committedAt?: string;
}

/**
 * GET /api/homework/structure-notebook?classId=xxx
 * Returns ALL structures from lessons assigned to this class, overlaid with the
 * learner's mastery progress. Structures not yet tested show 0/N progress.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get all course IDs assigned to this class
    const { data: classCourses } = await supabase
      .from('class_courses')
      .select('course_id')
      .eq('class_id', classId);
    const courseIds = (classCourses ?? []).map((r: { course_id: string }) => r.course_id);

    if (courseIds.length === 0) {
      return NextResponse.json({ entries: [], commitThreshold: 10, masteredCount: 0, learningCount: 0, untouchedCount: 0 });
    }

    // 2. Get all lesson IDs from those courses
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', courseIds);
    const allLessonIds = (lessonRows ?? []).map((r: { id: string }) => r.id);

    if (allLessonIds.length === 0) {
      return NextResponse.json({ entries: [], commitThreshold: 10, masteredCount: 0, learningCount: 0, untouchedCount: 0 });
    }

    // 3. Fetch exercises + mastery records + settings in parallel
    const [lessonExercises, masteryRecords, settings] = await Promise.all([
      fetchLessonExercisesForLessons(supabase, allLessonIds),
      fetchStructureMastery(supabase, user.id, classId),
      fetchClassHomeworkSettings(supabase, classId),
    ]);

    // Compound key lookup (lessonId:structureItemId) — structure IDs like "s1"/"s2" are
    // reused across lessons and are NOT globally unique.
    const masteryCompoundMap = new Map(masteryRecords.map(r => [`${r.lessonId}:${r.structureItemId}`, r]));

    const commitThreshold = settings.structureGuessesToCommit;

    // 4. Build entries from ALL structure items in lesson exercises
    const entries: StructureNotebookEntry[] = [];
    for (const ex of lessonExercises) {
      for (const item of ex.structureItems) {
        const mastery = masteryCompoundMap.get(`${ex.lessonId}:${item.id}`);
        entries.push({
          structureItemId: item.id,
          pattern: item.pattern,
          explanation: item.explanation,
          lessonId: ex.lessonId,
          correctCount: mastery?.correctCount ?? 0,
          incorrectCount: mastery?.incorrectCount ?? 0,
          isCommitted: mastery?.isCommitted ?? false,
          lastSeenAt: mastery?.lastSeenAt,
          committedAt: mastery?.committedAt,
        });
      }
    }

    // 5. Sort: mastered → learning (closest to commit first) → untouched last
    entries.sort((a, b) => {
      const aUntouched = a.correctCount === 0 && a.incorrectCount === 0;
      const bUntouched = b.correctCount === 0 && b.incorrectCount === 0;
      if (a.isCommitted !== b.isCommitted) {
        if (a.isCommitted) return 1;
        if (b.isCommitted) return -1;
      }
      if (aUntouched !== bUntouched) return aUntouched ? 1 : -1;
      if (!a.isCommitted) return b.correctCount - a.correctCount;
      return (b.committedAt ?? '').localeCompare(a.committedAt ?? '');
    });

    const masteredCount = entries.filter(e => e.isCommitted).length;
    const learningCount = entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)).length;
    const untouchedCount = entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0).length;

    return NextResponse.json({ entries, commitThreshold, masteredCount, learningCount, untouchedCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch structure notebook';
    console.error('[homework/structure-notebook] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
