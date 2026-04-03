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

/** Compute max possible points for a review session.
 *  Formula: vocabPool × 1pt  +  structurePool × 3pt  +  10pt (Ex3 free talk)
 */
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

  if (isReview) {
    // All sessions are now review sessions: ex3 is always free talk (10pt max)
    return vocabPool * 1 + structurePool * 3 + 10;
  }

  // Legacy path: regular (non-review) sessions keep old formula for existing windows
  const pendingLesson = pendingReadingLessonId
    ? exercises.find(e => e.lessonId === pendingReadingLessonId)
    : null;
  let ex3Pts = 0;
  if (pendingLesson) {
    if (pendingLesson.conversationExercise) {
      const learnerTurns = pendingLesson.conversationExercise.turns.filter(t => t.speaker === 'LEARNER').length;
      ex3Pts = learnerTurns * 10;
    } else if (pendingLesson.readingPassage) {
      ex3Pts = 20 + totalVocab;
    }
  }
  return vocabPool * 1 + structurePool * (7 + 7) + ex3Pts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Generates the next homework window for a class if none is currently open.
 * Auth-free: works with any SupabaseClient (anon or service role).
 *
 * Session algorithm (new):
 *   - Every session is a review session (is_review_session = true)
 *   - One session per UTC+7 calendar day, generated only after 6am UTC+7
 *   - Generation stops when today > homework_end_date (returns courseComplete: true)
 *   - Pool = all lessons with DONE exercises assigned to the class
 *
 * If no exercises are ready yet: generation is skipped until they are.
 */
export async function generateWindowForClass(
  supabase: SupabaseClient,
  classId: string,
  { forceReview = false }: { forceReview?: boolean } = {}
): Promise<{ created: boolean; window: HomeworkWindow | null; courseComplete: boolean; notConfigured: boolean }> {
  // 1. If a window is already open, nothing to do
  const existing = await fetchOpenWindow(supabase, classId);
  if (existing) {
    return { created: false, window: existing, courseComplete: false, notConfigured: false };
  }

  // 2. 6am UTC+7 gate — only generate sessions from 6am onwards
  const UTC7_OFFSET = 7 * 60 * 60 * 1000;
  const nowUtc7 = new Date(Date.now() + UTC7_OFFSET);
  const skipTimeGate = forceReview || (process.env.HOMEWORK_SESSION_DURATION_MINS && parseInt(process.env.HOMEWORK_SESSION_DURATION_MINS, 10) > 0);
  if (!skipTimeGate && nowUtc7.getUTCHours() < 6) {
    return { created: false, window: null, courseComplete: false, notConfigured: false };
  }

  // 3. One session per calendar day — if any window was already created today, skip.
  const todayDate = todayUtc7();
  const { data: todayWindow } = await supabase
    .from('daily_homework_windows')
    .select('id')
    .eq('class_id', classId)
    .eq('window_date', todayDate)
    .maybeSingle();
  if (todayWindow) {
    return { created: false, window: null, courseComplete: false, notConfigured: false };
  }

  // 4. Load settings and check end date
  const settings = await fetchClassHomeworkSettings(supabase, classId);
  if (settings.homeworkEndDate && todayDate > settings.homeworkEndDate) {
    return { created: false, window: null, courseComplete: true, notConfigured: false };
  }

  // 5. Load all past windows to determine session number
  const allWindows = await fetchWindowsByClass(supabase, classId);

  // 6. Get all lessons in courses assigned to this class (curriculum order)
  const courseLessons = await fetchLessonsForClassCourses(supabase, classId);
  const lessonIds = [...new Set(courseLessons.map((cl: { lessonId: string }) => cl.lessonId))];
  const allExercises = await fetchLessonExercisesForLessons(supabase, lessonIds);

  // Sort by curriculum order (lesson sort_order via fetchLessonsForClassCourses)
  const lessonOrder = new Map(lessonIds.map((id, i) => [id, i]));
  const readyExercises = allExercises
    .filter(e => e.generationStatus === 'DONE' && e.generatedAt)
    .sort((a, b) => (lessonOrder.get(a.lessonId) ?? 999) - (lessonOrder.get(b.lessonId) ?? 999));

  if (readyExercises.length === 0) {
    return { created: false, window: null, courseComplete: false, notConfigured: false };
  }

  // 7. All sessions are review sessions; pool = all ready lessons
  const nextSessionNumber = allWindows.length + 1;
  const lessonIdsInPool = readyExercises.map(e => e.lessonId);

  // 8. Compute max possible points
  const maxPossiblePoints = computeMaxPoints(
    readyExercises,
    settings.wordsPerSession,
    settings.structuresPerSession,
    true, // always review
    null,
    settings.reviewWordCount,
    settings.reviewStructureCount
  );

  // 9. Race-condition guard: check if a concurrent request already created this session.
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

  const created = await createHomeworkWindow(supabase, {
    classId,
    triggeringSessionId: null,
    windowDate: todayDate,
    isReviewSession: true,
    lessonIdsInPool,
    maxPossiblePoints,
    opensAt: now,
    closesAt,
    pendingReadingLessonId: null,
    sessionNumber: nextSessionNumber,
    lessonCycleSession: null,
    cycleLessonId: null,
  });

  return { created: true, window: created, courseComplete: false, notConfigured: false };
}
