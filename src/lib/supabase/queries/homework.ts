import { SupabaseClient } from '@supabase/supabase-js';
import {
  ExtractedLessonContent,
  LessonExercises,
  HomeworkWindow,
  ClassHomeworkSettings,
  VocabMasteryRecord,
  HomeworkSubmission,
  HomeworkSessionState,
  LeaderboardEntry,
} from '@/lib/types';

// ============================================================================
// Row types (snake_case matching DB columns)
// ============================================================================

interface ExtractedContentRow {
  id: string;
  lesson_id: string;
  vocabulary: unknown;
  structures: unknown;
  reading_passage: string;
  extraction_status: 'PENDING' | 'EXTRACTING' | 'DONE' | 'ERROR';
  error_message: string | null;
  extracted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LessonExercisesRow {
  id: string;
  lesson_id: string;
  vocab_items: unknown;
  structure_items: unknown;
  dialogue_lines: unknown;
  reading_passage: string;
  generation_status: 'PENDING' | 'GENERATING' | 'DONE' | 'ERROR';
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HomeworkWindowRow {
  id: string;
  class_id: string;
  triggering_session_id: string | null;
  window_date: string;
  is_review_session: boolean;
  lesson_ids_in_pool: string[];
  max_possible_points: number;
  opens_at: string;
  closes_at: string;
  pending_reading_lesson_id: string | null;
  session_number: number;
  lesson_cycle_session: number | null;
  cycle_lesson_id: string | null;
  created_at: string;
}

interface ClassHomeworkSettingsRow {
  id: string;
  class_id: string;
  words_per_session: number;
  structures_per_session: number;
  correct_guesses_to_commit: number;
  review_interval_days: number;
  review_word_count: number;
  review_structure_count: number;
  homework_restarted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VocabMasteryRow {
  id: string;
  learner_id: string;
  class_id: string;
  vocab_item_id: string;
  lesson_id: string;
  correct_count: number;
  incorrect_count: number;
  is_committed: boolean;
  last_seen_at: string | null;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HomeworkSubmissionRow {
  id: string;
  learner_id: string;
  window_id: string;
  class_id: string;
  ex1_score: number;
  ex2_score: number;
  ex3a_score: number;
  ex3b_score: number;
  total_score: number;
  ex1_completed: boolean;
  ex2_completed: boolean;
  ex3_completed: boolean;
  all_completed: boolean;
  wrong_vocab_ids: string[];
  reading_mastered: boolean;
  session_state: HomeworkSessionState;
  started_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LeaderboardRow {
  class_id: string;
  learner_id: string;
  learner_name: string;
  sessions_attended: number;
  homework_completed: number;
  total_points: number;
  total_submissions: number;
}

// ============================================================================
// Conversion helpers
// ============================================================================

function toExtractedContent(row: ExtractedContentRow): ExtractedLessonContent {
  return {
    lessonId: row.lesson_id,
    vocabulary: (row.vocabulary as ExtractedLessonContent['vocabulary']) || [],
    structures: (row.structures as ExtractedLessonContent['structures']) || [],
    readingPassage: row.reading_passage ?? '',
    extractionStatus: row.extraction_status,
    errorMessage: row.error_message || undefined,
    extractedAt: row.extracted_at || undefined,
  };
}

function toLessonExercises(row: LessonExercisesRow): LessonExercises {
  return {
    lessonId: row.lesson_id,
    vocabItems: (row.vocab_items as LessonExercises['vocabItems']) || [],
    structureItems: (row.structure_items as LessonExercises['structureItems']) || [],
    readingPassage: row.reading_passage ?? '',
    generationStatus: row.generation_status,
    errorMessage: row.error_message || undefined,
    generatedAt: row.generated_at || undefined,
  };
}

function toHomeworkWindow(row: HomeworkWindowRow): HomeworkWindow {
  return {
    id: row.id,
    classId: row.class_id,
    triggeringSessionId: row.triggering_session_id,
    windowDate: row.window_date,
    isReviewSession: row.is_review_session,
    lessonIdsInPool: row.lesson_ids_in_pool || [],
    maxPossiblePoints: Number(row.max_possible_points),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    pendingReadingLessonId: row.pending_reading_lesson_id ?? null,
    sessionNumber: row.session_number ?? 1,
    lessonCycleSession: row.lesson_cycle_session ?? null,
    cycleLessonId: row.cycle_lesson_id ?? null,
    createdAt: row.created_at,
  };
}

function toClassHomeworkSettings(row: ClassHomeworkSettingsRow): ClassHomeworkSettings {
  return {
    id: row.id,
    classId: row.class_id,
    wordsPerSession: row.words_per_session,
    structuresPerSession: row.structures_per_session,
    correctGuessesToCommit: row.correct_guesses_to_commit,
    reviewIntervalDays: row.review_interval_days,
    reviewWordCount: row.review_word_count,
    reviewStructureCount: row.review_structure_count,
    homeworkRestartedAt: row.homework_restarted_at ?? null,
  };
}

function toVocabMastery(row: VocabMasteryRow): VocabMasteryRecord {
  return {
    id: row.id,
    learnerId: row.learner_id,
    classId: row.class_id,
    vocabItemId: row.vocab_item_id,
    lessonId: row.lesson_id,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    isCommitted: row.is_committed,
    lastSeenAt: row.last_seen_at || undefined,
    committedAt: row.committed_at || undefined,
  };
}

function toHomeworkSubmission(row: HomeworkSubmissionRow): HomeworkSubmission {
  return {
    id: row.id,
    learnerId: row.learner_id,
    windowId: row.window_id,
    classId: row.class_id,
    ex1Score: Number(row.ex1_score),
    ex2Score: Number(row.ex2_score),
    ex3aScore: Number(row.ex3a_score),
    ex3bScore: Number(row.ex3b_score),
    totalScore: Number(row.total_score),
    ex1Completed: row.ex1_completed,
    ex2Completed: row.ex2_completed,
    ex3Completed: row.ex3_completed,
    allCompleted: row.all_completed,
    wrongVocabIds: row.wrong_vocab_ids || [],
    readingMastered: row.reading_mastered ?? false,
    sessionState: row.session_state || {},
    startedAt: row.started_at || undefined,
    submittedAt: row.submitted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLeaderboardEntry(row: LeaderboardRow, rank: number): LeaderboardEntry {
  return {
    learnerId: row.learner_id,
    learnerName: row.learner_name,
    classId: row.class_id,
    sessionsAttended: Number(row.sessions_attended) || 0,
    homeworkCompleted: Number(row.homework_completed) || 0,
    totalPoints: Number(row.total_points) || 0,
    totalSubmissions: Number(row.total_submissions) || 0,
    rank,
  };
}

// ============================================================================
// Extracted content queries
// ============================================================================

export async function fetchExtractedContent(
  supabase: SupabaseClient,
  lessonId: string
): Promise<ExtractedLessonContent | null> {
  const { data, error } = await supabase
    .from('lesson_extracted_content')
    .select('*')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error || !data) return null;
  return toExtractedContent(data as ExtractedContentRow);
}

export async function fetchExtractedContentsForLessons(
  supabase: SupabaseClient,
  lessonIds: string[]
): Promise<ExtractedLessonContent[]> {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_extracted_content')
    .select('*')
    .in('lesson_id', lessonIds)
    .eq('extraction_status', 'DONE');
  if (error || !data) return [];
  return (data as ExtractedContentRow[]).map(toExtractedContent);
}

export async function upsertExtractedContent(
  supabase: SupabaseClient,
  lessonId: string,
  updates: Partial<Omit<ExtractedLessonContent, 'lessonId'>> & { extractionStatus: ExtractedLessonContent['extractionStatus'] }
): Promise<boolean> {
  const { error } = await supabase
    .from('lesson_extracted_content')
    .upsert({
      lesson_id: lessonId,
      vocabulary: updates.vocabulary || [],
      structures: updates.structures || [],
      reading_passage: updates.readingPassage ?? '',
      extraction_status: updates.extractionStatus,
      error_message: updates.errorMessage || null,
      extracted_at: updates.extractedAt || null,
    }, { onConflict: 'lesson_id' });
  return !error;
}

// ============================================================================
// Lesson exercises queries
// ============================================================================

export async function fetchLessonExercises(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonExercises | null> {
  const { data, error } = await supabase
    .from('lesson_exercises')
    .select('*')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error || !data) return null;
  return toLessonExercises(data as LessonExercisesRow);
}

export async function fetchLessonExercisesForLessons(
  supabase: SupabaseClient,
  lessonIds: string[]
): Promise<LessonExercises[]> {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_exercises')
    .select('*')
    .in('lesson_id', lessonIds)
    .eq('generation_status', 'DONE');
  if (error || !data) return [];
  return (data as LessonExercisesRow[]).map(toLessonExercises);
}

export async function upsertLessonExercises(
  supabase: SupabaseClient,
  lessonId: string,
  updates: Partial<Omit<LessonExercises, 'lessonId'>> & { generationStatus: LessonExercises['generationStatus'] }
): Promise<boolean> {
  const { error } = await supabase
    .from('lesson_exercises')
    .upsert({
      lesson_id: lessonId,
      vocab_items: updates.vocabItems || [],
      structure_items: updates.structureItems || [],
      dialogue_lines: [],
      reading_passage: updates.readingPassage ?? '',
      generation_status: updates.generationStatus,
      error_message: updates.errorMessage || null,
      generated_at: updates.generatedAt || null,
    }, { onConflict: 'lesson_id' });
  return !error;
}

// ============================================================================
// Homework window queries
// ============================================================================

export async function fetchTodaysWindow(
  supabase: SupabaseClient,
  classId: string,
  date: string  // "YYYY-MM-DD"
): Promise<HomeworkWindow | null> {
  const { data, error } = await supabase
    .from('daily_homework_windows')
    .select('*')
    .eq('class_id', classId)
    .eq('window_date', date)
    .maybeSingle();
  if (error || !data) return null;
  return toHomeworkWindow(data as HomeworkWindowRow);
}

export async function createHomeworkWindow(
  supabase: SupabaseClient,
  window: Omit<HomeworkWindow, 'id' | 'createdAt'>
): Promise<HomeworkWindow | null> {
  const { data, error } = await supabase
    .from('daily_homework_windows')
    .insert({
      class_id: window.classId,
      triggering_session_id: window.triggeringSessionId,
      window_date: window.windowDate,
      is_review_session: window.isReviewSession,
      lesson_ids_in_pool: window.lessonIdsInPool,
      max_possible_points: window.maxPossiblePoints,
      opens_at: window.opensAt,
      closes_at: window.closesAt,
      pending_reading_lesson_id: window.pendingReadingLessonId ?? null,
      session_number: window.sessionNumber,
      lesson_cycle_session: window.lessonCycleSession ?? null,
      cycle_lesson_id: window.cycleLessonId ?? null,
    })
    .select()
    .single();
  if (error || !data) return null;
  return toHomeworkWindow(data as HomeworkWindowRow);
}

export async function fetchWindowsByClass(
  supabase: SupabaseClient,
  classId: string
): Promise<HomeworkWindow[]> {
  const { data, error } = await supabase
    .from('daily_homework_windows')
    .select('*')
    .eq('class_id', classId)
    .order('session_number', { ascending: false });
  if (error || !data) return [];
  return (data as HomeworkWindowRow[]).map(toHomeworkWindow);
}

export async function fetchOpenWindow(
  supabase: SupabaseClient,
  classId: string
): Promise<HomeworkWindow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('daily_homework_windows')
    .select('*')
    .eq('class_id', classId)
    .lte('opens_at', now)
    .gt('closes_at', now)
    .order('session_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toHomeworkWindow(data as HomeworkWindowRow);
}

export async function fetchFirstWindowDate(
  supabase: SupabaseClient,
  classId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('daily_homework_windows')
    .select('window_date')
    .eq('class_id', classId)
    .order('window_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { window_date: string }).window_date;
}

// ============================================================================
// Homework submission queries
// ============================================================================

export async function fetchSubmission(
  supabase: SupabaseClient,
  learnerId: string,
  windowId: string
): Promise<HomeworkSubmission | null> {
  const { data, error } = await supabase
    .from('daily_homework_submissions')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('window_id', windowId)
    .maybeSingle();
  if (error || !data) return null;
  return toHomeworkSubmission(data as HomeworkSubmissionRow);
}

export async function fetchSubmissionsForTeacher(
  supabase: SupabaseClient,
  classId: string,
  windowId: string
): Promise<HomeworkSubmission[]> {
  const { data, error } = await supabase
    .from('daily_homework_submissions')
    .select('*')
    .eq('class_id', classId)
    .eq('window_id', windowId)
    .order('total_score', { ascending: false });
  if (error || !data) return [];
  return (data as HomeworkSubmissionRow[]).map(toHomeworkSubmission);
}

export async function fetchLearnerSubmissionHistory(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string
): Promise<HomeworkSubmission[]> {
  const { data, error } = await supabase
    .from('daily_homework_submissions')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('class_id', classId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as HomeworkSubmissionRow[]).map(toHomeworkSubmission);
}

export async function fetchLatestSubmissionForLearnerInClass(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string
): Promise<HomeworkSubmission | null> {
  const { data, error } = await supabase
    .from('daily_homework_submissions')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toHomeworkSubmission(data as HomeworkSubmissionRow);
}

export async function upsertSubmission(
  supabase: SupabaseClient,
  submission: Omit<HomeworkSubmission, 'id' | 'createdAt' | 'updatedAt'>
): Promise<HomeworkSubmission | null> {
  const { data, error } = await supabase
    .from('daily_homework_submissions')
    .upsert({
      learner_id: submission.learnerId,
      window_id: submission.windowId,
      class_id: submission.classId,
      ex1_score: submission.ex1Score,
      ex2_score: submission.ex2Score,
      ex3a_score: submission.ex3aScore,
      ex3b_score: submission.ex3bScore,
      total_score: submission.totalScore,
      ex1_completed: submission.ex1Completed,
      ex2_completed: submission.ex2Completed,
      ex3_completed: submission.ex3Completed,
      all_completed: submission.allCompleted,
      wrong_vocab_ids: submission.wrongVocabIds,
      reading_mastered: submission.readingMastered ?? false,
      session_state: submission.sessionState,
      started_at: submission.startedAt || null,
      submitted_at: submission.submittedAt || null,
    }, { onConflict: 'learner_id,window_id' })
    .select()
    .single();
  if (error || !data) return null;
  return toHomeworkSubmission(data as HomeworkSubmissionRow);
}

// ============================================================================
// Vocab mastery queries
// ============================================================================

export async function fetchVocabMastery(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string
): Promise<VocabMasteryRecord[]> {
  const { data, error } = await supabase
    .from('learner_vocab_mastery')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('class_id', classId);
  if (error || !data) return [];
  return (data as VocabMasteryRow[]).map(toVocabMastery);
}

export async function batchUpdateVocabMastery(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string,
  updates: {
    vocabItemId: string;
    lessonId: string;
    correct: boolean;
    commitThreshold: number;
  }[]
): Promise<{ ok: boolean; newlyCommittedCount: number }> {
  if (updates.length === 0) return { ok: true, newlyCommittedCount: 0 };
  const now = new Date().toISOString();

  // Fetch existing records for this learner/class
  // Use compound key (lesson_id + vocab_item_id) because vocab IDs like "v1", "v2"
  // are reused across lessons — they are NOT globally unique.
  const { data: existing } = await supabase
    .from('learner_vocab_mastery')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('class_id', classId)
    .in('vocab_item_id', updates.map(u => u.vocabItemId));

  const existingMap = new Map(
    ((existing as VocabMasteryRow[]) || []).map(r => [`${r.lesson_id}:${r.vocab_item_id}`, r])
  );

  let newlyCommittedCount = 0;
  const upsertRows = updates.map(u => {
    const prev = existingMap.get(`${u.lessonId}:${u.vocabItemId}`);
    const newCorrect = (prev?.correct_count || 0) + (u.correct ? 1 : 0);
    const newIncorrect = (prev?.incorrect_count || 0) + (u.correct ? 0 : 1);
    const isCommitted = newCorrect >= u.commitThreshold;
    if (isCommitted && !prev?.is_committed) newlyCommittedCount++;
    return {
      learner_id: learnerId,
      class_id: classId,
      vocab_item_id: u.vocabItemId,
      lesson_id: u.lessonId,
      correct_count: newCorrect,
      incorrect_count: newIncorrect,
      is_committed: isCommitted,
      last_seen_at: now,
      committed_at: isCommitted && !prev?.is_committed ? now : (prev?.committed_at || null),
    };
  });

  const { error } = await supabase
    .from('learner_vocab_mastery')
    .upsert(upsertRows, { onConflict: 'learner_id,class_id,lesson_id,vocab_item_id' });
  return { ok: !error, newlyCommittedCount };
}

export async function fetchCommittedVocabIds(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('learner_vocab_mastery')
    .select('vocab_item_id')
    .eq('learner_id', learnerId)
    .eq('class_id', classId)
    .eq('is_committed', true);
  if (error || !data) return [];
  return (data as { vocab_item_id: string }[]).map(r => r.vocab_item_id);
}

// ============================================================================
// Class homework settings queries
// ============================================================================

const DEFAULT_SETTINGS: Omit<ClassHomeworkSettings, 'id' | 'classId'> = {
  wordsPerSession: 10,
  structuresPerSession: 5,
  correctGuessesToCommit: 7,
  reviewIntervalDays: 7,
  reviewWordCount: 15,
  reviewStructureCount: 5,
  homeworkRestartedAt: null,
};

export async function fetchClassHomeworkSettings(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassHomeworkSettings> {
  const { data, error } = await supabase
    .from('class_homework_settings')
    .select('*')
    .eq('class_id', classId)
    .maybeSingle();
  if (error || !data) {
    return { id: '', classId, ...DEFAULT_SETTINGS };
  }
  return toClassHomeworkSettings(data as ClassHomeworkSettingsRow);
}

export async function upsertClassHomeworkSettings(
  supabase: SupabaseClient,
  settings: Omit<ClassHomeworkSettings, 'id'>
): Promise<boolean> {
  const { error } = await supabase
    .from('class_homework_settings')
    .upsert({
      class_id: settings.classId,
      words_per_session: settings.wordsPerSession,
      structures_per_session: settings.structuresPerSession,
      correct_guesses_to_commit: settings.correctGuessesToCommit,
      review_interval_days: settings.reviewIntervalDays,
      review_word_count: settings.reviewWordCount,
      review_structure_count: settings.reviewStructureCount,
    }, { onConflict: 'class_id' });
  return !error;
}

export async function restartClassHomework(
  supabase: SupabaseClient,
  classId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('class_homework_settings')
    .upsert(
      { class_id: classId, homework_restarted_at: new Date().toISOString() },
      { onConflict: 'class_id' }
    );
  return !error;
}

// ============================================================================
// Leaderboard query
// ============================================================================

export async function fetchLeaderboard(
  supabase: SupabaseClient,
  classId: string
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('class_leaderboard')
    .select('*')
    .eq('class_id', classId)
    .order('total_points', { ascending: false });
  if (error || !data) return [];
  return (data as LeaderboardRow[]).map((row, index) => toLeaderboardEntry(row, index + 1));
}

export async function fetchLearnerProgressForClass(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string
): Promise<{ window: HomeworkWindow; submission: HomeworkSubmission | null }[]> {
  const { data: windowRows } = await supabase
    .from('daily_homework_windows')
    .select('*')
    .eq('class_id', classId)
    .order('session_number', { ascending: true });
  if (!windowRows) return [];

  const windows = (windowRows as HomeworkWindowRow[]).map(toHomeworkWindow);

  const { data: subRows } = await supabase
    .from('daily_homework_submissions')
    .select('*')
    .eq('learner_id', learnerId)
    .eq('class_id', classId);

  const subMap = new Map(
    ((subRows as HomeworkSubmissionRow[]) || []).map(r => [r.window_id, toHomeworkSubmission(r)])
  );

  return windows.map(w => ({ window: w, submission: subMap.get(w.id) ?? null }));
}

export async function fetchAllLearnersProgressForClass(
  supabase: SupabaseClient,
  classId: string
): Promise<{
  windows: HomeworkWindow[];
  enrollments: { learnerId: string; learnerName: string }[];
  submissions: HomeworkSubmission[];
}> {
  const [windowRes, enrollRes, subRes] = await Promise.all([
    supabase
      .from('daily_homework_windows')
      .select('*')
      .eq('class_id', classId)
      .order('session_number', { ascending: true }),
    supabase
      .from('class_enrollments')
      .select('learner_id, profiles:learner_id(full_name)')
      .eq('class_id', classId),
    supabase
      .from('daily_homework_submissions')
      .select('*')
      .eq('class_id', classId),
  ]);

  const windows = ((windowRes.data as HomeworkWindowRow[]) || []).map(toHomeworkWindow);
  const enrollments = ((enrollRes.data as Record<string, unknown>[]) || []).map(row => ({
    learnerId: row.learner_id as string,
    learnerName: ((row.profiles as Record<string, unknown>)?.full_name as string) || 'Unknown',
  }));
  const submissions = ((subRes.data as HomeworkSubmissionRow[]) || []).map(toHomeworkSubmission);

  return { windows, enrollments, submissions };
}
