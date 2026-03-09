import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { upsertSubmission, batchUpdateVocabMastery, fetchClassHomeworkSettings, fetchLessonExercises } from '@/lib/supabase/queries/homework';

interface VocabAttempt {
  vocabItemId: string;
  lessonId: string;
  targetWord: string;
  recognizedWord: string;
  isCorrectWord: boolean;
  pronunciationScore: number;
  pointsEarned: number;
  feedback: string;
  timedMode: boolean;
  timeTakenMs: number;
  timedOut: boolean;
  attemptTimestamp: string;
}

/**
 * POST /api/homework/submit
 *
 * Final submission when all exercises are complete.
 * Updates vocab mastery records in batch.
 * Marks submission as all_completed.
 * Computes reading mastery for next-day carry-forward.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      windowId,
      classId,
      ex1Score,
      ex2Score,
      ex3aScore,
      ex3bScore,
      wrongVocabIds,
      vocabAttempts,
      readingLessonId,
    }: {
      windowId: string;
      classId: string;
      ex1Score: number;
      ex2Score: number;
      ex3aScore: number;
      ex3bScore: number;
      wrongVocabIds: string[];
      vocabAttempts: VocabAttempt[];
      readingLessonId: string | null;
    } = await request.json();

    if (!windowId || !classId) {
      return NextResponse.json({ error: 'windowId and classId are required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const totalScore = (ex1Score ?? 0) + (ex2Score ?? 0) + (ex3aScore ?? 0) + (ex3bScore ?? 0);
    const submittedAt = new Date().toISOString();

    // Determine if learner mastered the reading (for next-day carry-forward)
    let readingMastered = true; // default when no reading in this session
    if (readingLessonId) {
      const lessonEx = await fetchLessonExercises(supabase, readingLessonId);
      const maxReadingScore = 20 + (lessonEx?.vocabItems.length ?? 0);
      readingMastered = (ex3aScore ?? 0) >= maxReadingScore;
    }

    // Finalize submission
    const submission = await upsertSubmission(supabase, {
      learnerId: user.id,
      windowId,
      classId,
      ex1Score: ex1Score ?? 0,
      ex2Score: ex2Score ?? 0,
      ex3aScore: ex3aScore ?? 0,
      ex3bScore: ex3bScore ?? 0,
      totalScore,
      ex1Completed: true,
      ex2Completed: true,
      ex3Completed: true,
      allCompleted: true,
      wrongVocabIds: wrongVocabIds ?? [],
      readingMastered,
      sessionState: {},
      submittedAt,
    });

    // Update vocab mastery records
    let wordsCommittedCount = 0;
    if (vocabAttempts && vocabAttempts.length > 0) {
      const settings = await fetchClassHomeworkSettings(supabase, classId);
      const masteryResult = await batchUpdateVocabMastery(
        supabase,
        user.id,
        classId,
        vocabAttempts.map(a => ({
          vocabItemId: a.vocabItemId,
          lessonId: a.lessonId,
          correct: typeof a.isCorrectWord === 'boolean'
            ? a.isCorrectWord
            : !!((a as unknown as { correct?: boolean }).correct),
          commitThreshold: settings.correctGuessesToCommit,
        }))
      );
      if (!masteryResult.ok) {
        console.error('[homework/submit] Vocab mastery update failed for learner', user.id, 'class', classId, 'windowId', windowId);
      }
      wordsCommittedCount = masteryResult.newlyCommittedCount;
    }

    let auditRowsInserted = 0;

    if (submission && vocabAttempts && vocabAttempts.length > 0) {
      const rows = vocabAttempts.map((a, index) => {
        const legacyCorrect = !!((a as unknown as { correct?: boolean }).correct);
        return ({
        submission_id: submission.id,
        learner_id: user.id,
        class_id: classId,
        window_id: windowId,
        attempt_index: index + 1,
        vocab_item_id: a.vocabItemId,
        lesson_id: a.lessonId,
        target_word: a.targetWord || '',
        recognized_word: a.recognizedWord || '',
        is_correct_word: typeof a.isCorrectWord === 'boolean' ? a.isCorrectWord : legacyCorrect,
        pronunciation_score: Number(a.pronunciationScore || 0),
        points_earned: Number(a.pointsEarned || 0),
        feedback: a.feedback || '',
        timed_mode: !!a.timedMode,
        time_taken_ms: Number.isFinite(a.timeTakenMs) ? Math.max(0, Math.round(a.timeTakenMs)) : null,
        timed_out: !!a.timedOut,
        attempt_timestamp: a.attemptTimestamp || submittedAt,
      });
      });

      const { error: attemptsError } = await supabase
        .from('homework_vocab_attempt_audits')
        .upsert(rows, { onConflict: 'submission_id,attempt_index' });
      if (attemptsError) {
        throw new Error(`Failed to save vocab attempt audits: ${attemptsError.message}`);
      }
      auditRowsInserted = rows.length;
    }

    return NextResponse.json({
      success: true,
      totalScore,
      submission,
      wordsCommittedCount,
      vocabAttemptsReceived: vocabAttempts?.length ?? 0,
      auditRowsInserted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Submit failed';
    console.error('[homework/submit] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
