import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fetchLessonExercisesForLessons,
  fetchClassHomeworkSettings,
} from '@/lib/supabase/queries/homework';
import { NotebookEntry } from '../route';

export interface CourseNotebook {
  courseId: string;
  courseName: string;
  commitThreshold: number;
  masteredCount: number;
  learningCount: number;
  untouchedCount: number;
  entries: NotebookEntry[];
}

export interface GlobalNotebookResponse {
  courses: CourseNotebook[];
  globalTotal: number;
  globalMastered: number;
  globalLearning: number;
  globalUntouched: number;
}

/**
 * GET /api/homework/vocab-notebook/global
 *
 * Returns all unique vocab across all enrolled classes, grouped by course.
 * Words are deduplicated by text (case-insensitive); best mastery wins
 * (committed > higher correctCount).
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. All enrolled class IDs
    const { data: enrollmentRows } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .eq('learner_id', user.id);
    const classIds = (enrollmentRows ?? []).map((r: { class_id: string }) => r.class_id);

    if (classIds.length === 0) {
      return NextResponse.json({
        courses: [],
        globalTotal: 0,
        globalMastered: 0,
        globalLearning: 0,
        globalUntouched: 0,
      });
    }

    // 2. Course assignments + course names across all classes
    const { data: classCourseRows } = await supabase
      .from('class_courses')
      .select('class_id, course_id, courses(name)')
      .in('class_id', classIds);

    type ClassCourseRow = { class_id: string; course_id: string; courses: { name: string } | null };
    const classCourseData = (classCourseRows ?? []) as unknown as ClassCourseRow[];

    // Map courseId → courseName
    const courseNameMap = new Map<string, string>();
    // Map courseId → classId (for settings lookup; use first class found)
    const courseClassMap = new Map<string, string>();
    const courseIds: string[] = [];
    for (const row of classCourseData) {
      if (!courseNameMap.has(row.course_id)) {
        courseNameMap.set(row.course_id, row.courses?.name ?? 'Unknown Course');
        courseClassMap.set(row.course_id, row.class_id);
        courseIds.push(row.course_id);
      }
    }

    if (courseIds.length === 0) {
      return NextResponse.json({
        courses: [],
        globalTotal: 0,
        globalMastered: 0,
        globalLearning: 0,
        globalUntouched: 0,
      });
    }

    // 3. All lesson IDs from those courses (with their courseId)
    const { data: lessonRows } = await supabase
      .from('lessons')
      .select('id, course_id')
      .in('course_id', courseIds);

    type LessonRow = { id: string; course_id: string };
    const lessonCourseMap = new Map<string, string>(); // lessonId → courseId
    const allLessonIds: string[] = [];
    for (const row of (lessonRows ?? []) as LessonRow[]) {
      lessonCourseMap.set(row.id, row.course_id);
      allLessonIds.push(row.id);
    }

    if (allLessonIds.length === 0) {
      return NextResponse.json({
        courses: [],
        globalTotal: 0,
        globalMastered: 0,
        globalLearning: 0,
        globalUntouched: 0,
      });
    }

    // 4. Fetch everything in parallel:
    //    - lesson exercises
    //    - mastery records for ALL classes at once
    //    - settings per class (for commitThreshold)
    const [lessonExercises, allMasteryRows] = await Promise.all([
      fetchLessonExercisesForLessons(supabase, allLessonIds),
      supabase
        .from('learner_vocab_mastery')
        .select('*')
        .eq('learner_id', user.id)
        .in('class_id', classIds),
    ]);

    // 5. Build compound mastery map: classId:lessonId:vocabItemId → raw row
    //    Vocab IDs like "v1"/"v2" are reused across lessons and are NOT globally unique,
    //    so we must always scope mastery records to the specific lesson.
    interface MasteryRowRaw {
      class_id: string;
      lesson_id: string;
      vocab_item_id: string;
      correct_count: number;
      incorrect_count: number;
      is_committed: boolean;
      last_seen_at: string | null;
      committed_at: string | null;
    }
    const masteryRows = (allMasteryRows.data ?? []) as MasteryRowRaw[];

    const masteryCompoundMap = new Map<string, MasteryRowRaw>();
    for (const r of masteryRows) {
      masteryCompoundMap.set(`${r.class_id}:${r.lesson_id}:${r.vocab_item_id}`, r);
    }

    // 6. Fetch settings per unique class (commitThreshold may differ per class)
    const classSettingsMap = new Map<string, number>(); // classId → commitThreshold
    await Promise.all(
      classIds.map(async (cid) => {
        const settings = await fetchClassHomeworkSettings(supabase, cid);
        classSettingsMap.set(cid, settings.correctGuessesToCommit);
      })
    );

    // Helper: resolve mastery for a vocab item in a lesson
    //  - classId is the class that "owns" the lesson (via course assignment)
    function getMastery(
      lessonId: string,
      vocabItemId: string
    ): MasteryRowRaw | undefined {
      const courseId = lessonCourseMap.get(lessonId);
      const classId = courseId ? courseClassMap.get(courseId) : undefined;
      if (!classId) return undefined;
      return masteryCompoundMap.get(`${classId}:${lessonId}:${vocabItemId}`);
    }

    // 7. Build a global word map: word.toLowerCase() → best NotebookEntry + owning courseId
    type BestEntry = { entry: NotebookEntry; courseId: string };
    const globalWordMap = new Map<string, BestEntry>();

    for (const ex of lessonExercises) {
      const courseId = lessonCourseMap.get(ex.lessonId);
      if (!courseId) continue;

      for (const item of ex.vocabItems) {
        const mastery = getMastery(ex.lessonId, item.id);
        const entry: NotebookEntry = {
          vocabItemId: item.id,
          word: item.word,
          ipa: item.ipa,
          clue: item.clue,
          exampleSentence: item.exampleSentence,
          lessonId: ex.lessonId,
          correctCount: mastery?.correct_count ?? 0,
          incorrectCount: mastery?.incorrect_count ?? 0,
          isCommitted: mastery?.is_committed ?? false,
          lastSeenAt: mastery?.last_seen_at ?? undefined,
          committedAt: mastery?.committed_at ?? undefined,
        };

        const wordKey = item.word.toLowerCase().trim();
        const existing = globalWordMap.get(wordKey);

        if (!existing) {
          globalWordMap.set(wordKey, { entry, courseId });
        } else {
          // Keep best mastery: committed wins, then higher correctCount
          const existingBetter =
            existing.entry.isCommitted ||
            (!entry.isCommitted && existing.entry.correctCount >= entry.correctCount);
          if (!existingBetter) {
            globalWordMap.set(wordKey, { entry, courseId });
          }
        }
      }
    }

    // 8. Group unique entries by course
    const courseEntriesMap = new Map<string, NotebookEntry[]>();
    for (const { entry, courseId } of globalWordMap.values()) {
      if (!courseEntriesMap.has(courseId)) courseEntriesMap.set(courseId, []);
      courseEntriesMap.get(courseId)!.push(entry);
    }

    // 9. Sort entries within each course and build CourseNotebook objects
    function sortEntries(entries: NotebookEntry[]): NotebookEntry[] {
      return [...entries].sort((a, b) => {
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
    }

    const courses: CourseNotebook[] = courseIds
      .filter(cid => courseEntriesMap.has(cid))
      .map(cid => {
        const classId = courseClassMap.get(cid)!;
        const commitThreshold = classSettingsMap.get(classId) ?? 7;
        const entries = sortEntries(courseEntriesMap.get(cid)!);
        const masteredCount = entries.filter(e => e.isCommitted).length;
        const learningCount = entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)).length;
        const untouchedCount = entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0).length;
        return {
          courseId: cid,
          courseName: courseNameMap.get(cid) ?? 'Unknown Course',
          commitThreshold,
          masteredCount,
          learningCount,
          untouchedCount,
          entries,
        };
      });

    const globalTotal = globalWordMap.size;
    const globalMastered = [...globalWordMap.values()].filter(({ entry }) => entry.isCommitted).length;
    const globalLearning = [...globalWordMap.values()].filter(
      ({ entry }) => !entry.isCommitted && (entry.correctCount > 0 || entry.incorrectCount > 0)
    ).length;
    const globalUntouched = globalTotal - globalMastered - globalLearning;

    return NextResponse.json({
      courses,
      globalTotal,
      globalMastered,
      globalLearning,
      globalUntouched,
    } satisfies GlobalNotebookResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch global vocab notebook';
    console.error('[homework/vocab-notebook/global] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
