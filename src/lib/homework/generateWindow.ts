import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchOpenWindow,
  fetchWindowsByClass,
  createHomeworkWindow,
  fetchClassHomeworkSettings,
  fetchLessonExercisesForLessons,
} from '@/lib/supabase/queries/homework';
import { fetchLessonsForClassCourses } from '@/lib/supabase/queries/sessions';
import { HomeworkWindow, LessonExercises } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute closes_at for a new session window.
 *  - If HOMEWORK_SESSION_DURATION_MINS is set (>0): closes_at = now + N minutes
 *  - Otherwise (production): closes_at = 23:59:59 UTC+7 of today (Vietnam timezone)
 */
export function computeClosesAt(): string {
  const durationMins = parseInt(process.env.HOMEWORK_SESSION_DURATION_MINS || '0', 10);
  if (durationMins > 0) {
    return new Date(Date.now() + durationMins * 60 * 1000).toISOString();
  }
  // Production: end of day in UTC+7
  const UTC7_OFFSET = 7 * 60 * 60 * 1000;
  const nowUtc7 = new Date(Date.now() + UTC7_OFFSET);
  const y = nowUtc7.getUTCFullYear();
  const m = nowUtc7.getUTCMonth();
  const d = nowUtc7.getUTCDate();
  return new Date(Date.UTC(y, m, d, 16, 59, 59)).toISOString();
}

/** Today's date string in UTC+7 (YYYY-MM-DD). */
export function todayUtc7(): string {
  const UTC7_OFFSET = 7 * 60 * 60 * 1000;
  const nowUtc7 = new Date(Date.now() + UTC7_OFFSET);
  const y = nowUtc7.getUTCFullYear();
  const m = String(nowUtc7.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowUtc7.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compute max possible points for a session given the exercises in the pool. */
export function computeMaxPoints(
  exercises: LessonExercises[],
  wordsPerSession: number,
  structuresPerSession: number,
  isReview: boolean,
  pendingReadingLessonId: string | null,
  reviewWordCount?: number,
  reviewStructureCount?: number
): number {
  const totalVocab = exercises.reduce((s, e) => s + e.vocabItems.length, 0);
  const totalStructures = exercises.reduce((s, e) => s + e.structureItems.length, 0);
  const wordLimit = isReview ? (reviewWordCount ?? wordsPerSession) : wordsPerSession;
  const structureLimit = isReview ? (reviewStructureCount ?? structuresPerSession) : structuresPerSession;
  const vocabPool = Math.min(totalVocab, wordLimit);
  const structurePool = Math.min(totalStructures, structureLimit);
  const readingLesson = pendingReadingLessonId
    ? exercises.find(e => e.lessonId === pendingReadingLessonId)
    : null;
  const hasReadingPassage = !!(readingLesson?.readingPassage);
  const readingPts = (isReview || !hasReadingPassage) ? 0 : (20 + totalVocab);
  return vocabPool * 1 + structurePool * (7 + 7) + readingPts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Generates the next homework window for a class if none is currently open.
 * Auth-free: works with any SupabaseClient (anon or service role).
 *
 * Session algorithm:
 *   N = course.homework_lesson_count (teacher-set; null → generation blocked)
 *   nonReviewCount = number of past non-review windows
 *
 *   if nonReviewCount >= N × 3:
 *     — all N lessons covered → courseComplete immediately
 *   else:
 *     nextSessionNumber % 7 == 0 → review session
 *     else → regular lesson session (lessonCycleIndex = floor(nonReviewCount / 3))
 *     if lesson exercises not ready yet → skip generation (no window created)
 *
 * Lessons are ordered by curriculum order (sort_order), not by exercise generation time.
 *
 * If N is not set on the course: returns notConfigured: true and no window is created.
 * If lesson exercises are not yet generated: generation is blocked until they are ready.
 *
 * Reading carry-forward for sessions 2–3:
 *   Carries pendingReadingLessonId from the previous window without a per-learner
 *   mastery check (acceptable tradeoff in cron/no-auth context).
 */
export async function generateWindowForClass(
  supabase: SupabaseClient,
  classId: string
): Promise<{ created: boolean; window: HomeworkWindow | null; courseComplete: boolean; notConfigured: boolean }> {
  // 1. If a window is already open, nothing to do
  const existing = await fetchOpenWindow(supabase, classId);
  if (existing) {
    return { created: false, window: existing, courseComplete: false, notConfigured: false };
  }

  // 2. Load all past windows to determine session number
  const allWindows = await fetchWindowsByClass(supabase, classId);

  // 3. Fetch the active course's homework_lesson_count
  const { data: ccRow } = await supabase
    .from('class_courses')
    .select('courses(homework_lesson_count)')
    .eq('class_id', classId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  const coursesJoin = ccRow?.courses;
  const N: number | null = Array.isArray(coursesJoin)
    ? ((coursesJoin[0] as { homework_lesson_count: number | null } | undefined)?.homework_lesson_count ?? null)
    : ((coursesJoin as { homework_lesson_count: number | null } | null | undefined)?.homework_lesson_count ?? null);

  if (!N) {
    // Teacher hasn't set the lesson count — block generation
    return { created: false, window: null, courseComplete: false, notConfigured: true };
  }

  // 4. Get all lessons in courses assigned to this class (curriculum order)
  const courseLessons = await fetchLessonsForClassCourses(supabase, classId);
  const lessonIds = [...new Set(courseLessons.map((cl: { lessonId: string }) => cl.lessonId))];
  const allExercises = await fetchLessonExercisesForLessons(supabase, lessonIds);

  // Sort by curriculum order (lesson sort_order via fetchLessonsForClassCourses),
  // not by exercise generation time
  const lessonOrder = new Map(lessonIds.map((id, i) => [id, i]));
  const readyExercises = allExercises
    .filter(e => e.generationStatus === 'DONE' && e.generatedAt)
    .sort((a, b) => (lessonOrder.get(a.lessonId) ?? 999) - (lessonOrder.get(b.lessonId) ?? 999));

  if (readyExercises.length === 0) {
    return { created: false, window: null, courseComplete: false, notConfigured: false };
  }

  // 5. Determine next session
  const nextSessionNumber = allWindows.length + 1;
  const settings = await fetchClassHomeworkSettings(supabase, classId);

  const nonReviewCount = allWindows.filter(w => !w.isReviewSession).length;

  let isReviewSession: boolean;
  let cycleLesson: LessonExercises | null = null;
  let lessonCycleSession: number | null = null;

  if (nonReviewCount >= N * 3) {
    // All N lessons covered — course complete.
    return { created: false, window: null, courseComplete: true, notConfigured: false };
  } else {
    // Normal generation: mid-course modulo review or regular lesson session
    isReviewSession = nextSessionNumber % 7 === 0;

    if (!isReviewSession) {
      const lessonCycleIndex = Math.floor(nonReviewCount / 3);
      const sessionInCycle = (nonReviewCount % 3) + 1;
      cycleLesson = readyExercises[lessonCycleIndex] ?? null;
      lessonCycleSession = cycleLesson ? sessionInCycle : null;
      if (!cycleLesson) {
        // No lesson available yet — skip generation
        return { created: false, window: null, courseComplete: false, notConfigured: false };
      }
    }
  }

  // 6. Build lesson pool
  const lessonsFromPastSessions = new Set(
    allWindows
      .filter(w => !w.isReviewSession && w.cycleLessonId)
      .map(w => w.cycleLessonId as string)
  );

  let lessonIdsInPool: string[];
  if (isReviewSession) {
    const reviewPool = readyExercises.filter(e => lessonsFromPastSessions.has(e.lessonId));
    lessonIdsInPool = reviewPool.length > 0
      ? reviewPool.map(e => e.lessonId)
      : readyExercises.map(e => e.lessonId);
  } else {
    lessonIdsInPool = [cycleLesson!.lessonId];
  }

  // 7. Determine pending reading lesson
  let pendingReadingLessonId: string | null = null;
  if (!isReviewSession && cycleLesson) {
    if (lessonCycleSession === 1) {
      pendingReadingLessonId = cycleLesson.lessonId;
    } else {
      const prevWindow = allWindows[0]; // latest window (ordered by session_number desc)
      pendingReadingLessonId = prevWindow?.pendingReadingLessonId ?? null;
    }
  }

  // 8. Compute max possible points
  const poolExercises = isReviewSession
    ? readyExercises.filter(e => lessonsFromPastSessions.has(e.lessonId))
    : [cycleLesson!];
  const maxPossiblePoints = computeMaxPoints(
    poolExercises.length > 0 ? poolExercises : readyExercises,
    settings.wordsPerSession,
    settings.structuresPerSession,
    isReviewSession,
    pendingReadingLessonId,
    settings.reviewWordCount,
    settings.reviewStructureCount
  );

  // 9. Race-condition guard: check if a concurrent request already created this session.
  //    (React Strict Mode fires useEffect twice on mount; both calls can race past step 1.)
  const { data: alreadyExists } = await supabase
    .from('daily_homework_windows')
    .select('id')
    .eq('class_id', classId)
    .eq('session_number', nextSessionNumber)
    .maybeSingle();
  if (alreadyExists) {
    const freshOpen = await fetchOpenWindow(supabase, classId);
    return { created: false, window: freshOpen, courseComplete: false, notConfigured: false };
  }

  // 10. Create the window
  const now = new Date().toISOString();
  const closesAt = computeClosesAt();
  const windowDate = todayUtc7();

  const created = await createHomeworkWindow(supabase, {
    classId,
    triggeringSessionId: null,
    windowDate,
    isReviewSession,
    lessonIdsInPool,
    maxPossiblePoints,
    opensAt: now,
    closesAt,
    pendingReadingLessonId,
    sessionNumber: nextSessionNumber,
    lessonCycleSession,
    cycleLessonId: cycleLesson?.lessonId ?? null,
  });

  return { created: true, window: created, courseComplete: false, notConfigured: false };
}
