import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fetchVocabMastery,
  fetchLessonExercisesForLessons,
  fetchClassHomeworkSettings,
} from '@/lib/supabase/queries/homework';

export interface NotebookEntry {
  vocabItemId: string;
  word: string;
  ipa: string;
  clue: string;
  exampleSentence: string;
  lessonId: string;
  correctCount: number;
  incorrectCount: number;
  isCommitted: boolean;
  lastSeenAt?: string;
  committedAt?: string;
}

/**
 * GET /api/homework/vocab-notebook?classId=xxx
 * Returns ALL vocab from lessons assigned to this class, overlaid with the
 * learner's mastery progress. Words not yet tested show 0/N progress.
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
      return NextResponse.json({ entries: [], commitThreshold: 7, masteredCount: 0, learningCount: 0 });
    }

    // 2. Get all lesson IDs from those courses
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id')
      .in('course_id', courseIds);
    const allLessonIds = (lessonRows ?? []).map((r: { id: string }) => r.id);

    if (allLessonIds.length === 0) {
      return NextResponse.json({ entries: [], commitThreshold: 7, masteredCount: 0, learningCount: 0 });
    }

    // 3. Fetch exercises + mastery records + settings in parallel
    const [lessonExercises, masteryRecords, settings] = await Promise.all([
      fetchLessonExercisesForLessons(supabase, allLessonIds),
      fetchVocabMastery(supabase, user.id, classId),
      fetchClassHomeworkSettings(supabase, classId),
    ]);

    // Compound key lookup (lessonId:vocabItemId) — vocab IDs like "v1"/"v2" are
    // reused across lessons and are NOT globally unique, so we must always scope
    // mastery records to the specific lesson.
    const masteryCompoundMap = new Map(masteryRecords.map(r => [`${r.lessonId}:${r.vocabItemId}`, r]));

    const commitThreshold = settings.correctGuessesToCommit;

    // 5. Build entries from ALL vocab items in lesson exercises
    const entries: NotebookEntry[] = [];
    for (const ex of lessonExercises) {
      for (const item of ex.vocabItems) {
        const mastery = masteryCompoundMap.get(`${ex.lessonId}:${item.id}`);
        entries.push({
          vocabItemId: item.id,
          word: item.word,
          ipa: item.ipa,
          clue: item.clue,
          exampleSentence: item.exampleSentence,
          lessonId: ex.lessonId,
          correctCount: mastery?.correctCount ?? 0,
          incorrectCount: mastery?.incorrectCount ?? 0,
          isCommitted: mastery?.isCommitted ?? false,
          lastSeenAt: mastery?.lastSeenAt,
          committedAt: mastery?.committedAt,
        });
      }
    }

    // 6. Sort: not-yet-started last, then learning (closest to mastery first),
    //    then mastered (most recently committed first)
    entries.sort((a, b) => {
      const aUntouched = a.correctCount === 0 && a.incorrectCount === 0;
      const bUntouched = b.correctCount === 0 && b.incorrectCount === 0;
      if (a.isCommitted !== b.isCommitted) {
        if (a.isCommitted) return 1;   // mastered → after learning
        if (b.isCommitted) return -1;
      }
      if (aUntouched !== bUntouched) return aUntouched ? 1 : -1; // untouched → last
      if (!a.isCommitted) return b.correctCount - a.correctCount; // learning: closest first
      return (b.committedAt ?? '').localeCompare(a.committedAt ?? ''); // mastered: recent first
    });

    const masteredCount = entries.filter(e => e.isCommitted).length;
    const learningCount = entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)).length;
    const untouchedCount = entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0).length;

    return NextResponse.json({ entries, commitThreshold, masteredCount, learningCount, untouchedCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vocab notebook';
    console.error('[homework/vocab-notebook] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
