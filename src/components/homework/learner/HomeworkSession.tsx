"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, MessageCircle, Timer, Loader2, AlertCircle } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission, HomeworkSessionState, LessonExercises, VocabExerciseItem, StructureExerciseItem, ReadingExerciseItem, ClassHomeworkSettings, VocabAttemptAudit, ConversationExercise } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import Exercise1Vocab from './Exercise1Vocab';
import Exercise2Structure from './Exercise2Structure';
import Exercise3Reading from './Exercise3Reading';
import Exercise3Conversation from './Exercise3Conversation';
import HomeworkScorecard from './HomeworkScorecard';

type SessionPhase =
  | 'LOADING'
  | 'EX1_INTRO'
  | 'EX1'
  | 'EX2_INTRO'
  | 'EX2'
  | 'EX3_INTRO'
  | 'EX3'
  | 'SUBMITTING'
  | 'SCORECARD'
  | 'ERROR';

interface HomeworkSessionProps {
  window: HomeworkWindow;
  classId: string;
  existingSubmission: HomeworkSubmission | null;
  onDone: () => void;
}

interface TimedToggleProps {
  label: string;
  description: string;
  timedMode: boolean;
  onToggle: (v: boolean) => void;
  onStart: () => void;
}

function TimedToggle({ label, description, timedMode, onToggle, onStart }: TimedToggleProps) {
  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h3 className="text-lg font-bold text-foreground mb-1">{label}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <p className="text-sm font-medium text-foreground">Choose timer mode:</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onToggle(false)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
              !timedMode
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <BookOpen className={`w-6 h-6 ${!timedMode ? 'text-primary' : 'text-muted-foreground/60'}`} />
            <span className={`text-sm font-semibold ${!timedMode ? 'text-primary' : 'text-muted-foreground'}`}>
              Practice
            </span>
            <span className="text-xs text-muted-foreground/60 text-center">No time limit · 50% points</span>
          </button>

          <button
            onClick={() => onToggle(true)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
              timedMode
                ? 'border-amber-500 bg-amber-50'
                : 'border-border bg-card hover:border-amber-300'
            }`}
          >
            <Timer className={`w-6 h-6 ${timedMode ? 'text-amber-600' : 'text-muted-foreground/60'}`} />
            <span className={`text-sm font-semibold ${timedMode ? 'text-amber-700' : 'text-muted-foreground'}`}>
              Challenge
            </span>
            <span className="text-xs text-muted-foreground/60 text-center">Time limit · Full points</span>
          </button>
        </div>

        <button
          onClick={onStart}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition"
        >
          Start Exercise
        </button>
      </div>
    </div>
  );
}

export default function HomeworkSession({ window: hw, classId, existingSubmission, onDone }: HomeworkSessionProps) {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<SessionPhase>('LOADING');
  const [error, setError] = useState<string | null>(null);

  // Exercise data
  const [vocabPool, setVocabPool] = useState<VocabExerciseItem[]>([]);
  const [structurePool, setStructurePool] = useState<StructureExerciseItem[]>([]);
  const [readingItem, setReadingItem] = useState<ReadingExerciseItem | null>(null);
  const [conversationItem, setConversationItem] = useState<ConversationExercise | null>(null);
  const [allStructures, setAllStructures] = useState<StructureExerciseItem[]>([]);
  const [readingLessonId, setReadingLessonId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ClassHomeworkSettings | null>(null);

  // Derive learner role from profile for conversation display
  const learnerRole = profile?.preferences?.role || profile?.job_title || '';

  // Timer mode per exercise (default off)
  const [ex1Timed, setEx1Timed] = useState(false);
  const [ex2Timed, setEx2Timed] = useState(false);

  // Scores & tracking
  const [ex1Score, setEx1Score] = useState(existingSubmission?.ex1Score ?? 0);
  const [ex2Score, setEx2Score] = useState(existingSubmission?.ex2Score ?? 0);
  const [ex3aScore, setEx3aScore] = useState(existingSubmission?.ex3aScore ?? 0);
  const [ex3bScore, setEx3bScore] = useState(existingSubmission?.ex3bScore ?? 0);
  const [vocabAttempts, setVocabAttempts] = useState<VocabAttemptAudit[]>([]);
  const [wrongVocabIds, setWrongVocabIds] = useState<string[]>([]);
  const [wordsCommittedCount, setWordsCommittedCount] = useState(0);

  // Final scores
  const [finalScores, setFinalScores] = useState<{
    ex1: number; ex2: number; ex3a: number; ex3b: number; total: number;
  } | null>(null);

  // Load exercise data on mount
  useEffect(() => {
    const load = async () => {
      try {
        // Fetch settings
        const settingsRes = await fetch(`/api/homework/settings?classId=${classId}`);
        const settingsData = settingsRes.ok ? await settingsRes.json() : null;
        if (settingsData) setSettings(settingsData);

        // Fetch exercises for all lessons in pool
        const lessonIds = hw.lessonIdsInPool;
        if (lessonIds.length === 0) {
          setError('No lessons in homework pool. Please contact your teacher.');
          setPhase('ERROR');
          return;
        }

        const exRes = await fetch(`/api/homework/exercises?lessonIds=${lessonIds.join(',')}`);
        if (!exRes.ok) throw new Error('Failed to load exercises');
        const exData: LessonExercises[] = await exRes.json();

        // Aggregate items across all lessons
        const allVocab: VocabExerciseItem[] = exData.flatMap(e => e.vocabItems ?? []);
        const aggregatedStructures: StructureExerciseItem[] = exData.flatMap(e => e.structureItems ?? []);

        // Wrong vocab from yesterday (carry-forward)
        const prevWrong = existingSubmission?.wrongVocabIds ?? [];

        // Build vocab pool up to limit
        // Review sessions use reviewWordCount; regular sessions use wordsPerSession
        const limit = hw.isReviewSession
          ? (settingsData?.reviewWordCount ?? 15)
          : (settingsData?.wordsPerSession ?? 10);

        let pool: VocabExerciseItem[];
        if (hw.isReviewSession) {
          // Fetch mastery to separate seen/unseen and mastered/still-learning vocab
          const masteryRes = await fetch(`/api/homework/vocab-notebook?classId=${classId}`);
          const masteryData = masteryRes.ok ? await masteryRes.json() : null;
          const masteryEntries: Array<{ vocabItemId: string; lessonId: string; isCommitted: boolean }> =
            masteryData?.entries ?? [];

          const seenKeys = new Set<string>();
          const masteredKeys = new Set<string>();
          for (const e of masteryEntries) {
            const k = `${e.lessonId}:${e.vocabItemId}`;
            seenKeys.add(k);
            if (e.isCommitted) masteredKeys.add(k);
          }

          const key = (v: VocabExerciseItem) => `${v.lessonId}:${v.id}`;
          const wrongIds = new Set(prevWrong);
          const seenVocab = allVocab.filter(v => seenKeys.has(key(v)));

          const wrongNotMastered = seenVocab.filter(v => wrongIds.has(v.id) && !masteredKeys.has(key(v)));
          const freshNotMastered = seenVocab
            .filter(v => !wrongIds.has(v.id) && !masteredKeys.has(key(v)))
            .sort(() => Math.random() - 0.5);
          const masteredItems = seenVocab
            .filter(v => masteredKeys.has(key(v)))
            .sort(() => Math.random() - 0.5);

          pool = [...wrongNotMastered, ...freshNotMastered, ...masteredItems].slice(0, limit);
        } else {
          const wrongItems = allVocab.filter(v => prevWrong.includes(v.id));
          const freshItems = allVocab.filter(v => !prevWrong.includes(v.id));
          const shuffledFresh = [...freshItems].sort(() => Math.random() - 0.5);
          pool = [...wrongItems, ...shuffledFresh].slice(0, limit);
        }

        setVocabPool(pool);

        // Review sessions: shuffle all structures randomly; regular: preserve lesson order
        const structureLimit = hw.isReviewSession
          ? (settingsData?.reviewStructureCount ?? 5)
          : (settingsData?.structuresPerSession ?? 5);
        const structuresToUse = hw.isReviewSession
          ? [...aggregatedStructures].sort(() => Math.random() - 0.5)
          : aggregatedStructures;
        const slicedStructures = structuresToUse.slice(0, structureLimit);
        setStructurePool(slicedStructures);
        setAllStructures(aggregatedStructures);

        // Build Ex3 item from the window's pending lesson
        const pendingId = hw.pendingReadingLessonId;
        if (pendingId) {
          const pendingEx = exData.find((e: LessonExercises) => e.lessonId === pendingId);
          if (pendingEx?.conversationExercise) {
            // New: conversation exercise
            setConversationItem(pendingEx.conversationExercise);
            setReadingLessonId(pendingId);
          } else if (pendingEx?.readingPassage) {
            // Legacy: reading passage exercise
            setReadingItem({ lessonId: pendingId, readingPassage: pendingEx.readingPassage, vocabWords: pendingEx.vocabItems ?? [] });
            setReadingLessonId(pendingId);
          }
        }

        // Restore vocab attempts saved during Ex1 so mastery is preserved on resume
        const savedAttempts = existingSubmission?.sessionState?.vocabAttempts;
        if (savedAttempts && savedAttempts.length > 0) {
          setVocabAttempts(savedAttempts);
        }

        // If already started, jump to correct phase
        if (existingSubmission?.allCompleted) {
          setPhase('SCORECARD');
        } else if (existingSubmission?.ex2Completed) {
          setPhase('EX3_INTRO');
        } else if (existingSubmission?.ex1Completed) {
          setPhase('EX2_INTRO');
        } else {
          setPhase('EX1_INTRO');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load homework';
        setError(msg);
        setPhase('ERROR');
      }
    };
    load();
  }, [hw, classId, existingSubmission]);

  const autoSave = useCallback(async (partial: {
    ex1Score?: number; ex2Score?: number; ex3aScore?: number; ex3bScore?: number;
    ex1Completed?: boolean; ex2Completed?: boolean; ex3Completed?: boolean;
    wrongVocabIds?: string[];
    sessionState?: HomeworkSessionState;
  }) => {
    try {
      await fetch('/api/homework/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowId: hw.id,
          classId,
          ...partial,
        }),
      });
    } catch {
      // Non-blocking
    }
  }, [hw.id, classId]);

  const handleEx1Complete = useCallback(async (score: number, wrongIds: string[], attempts: VocabAttemptAudit[]) => {
    setEx1Score(score);
    setWrongVocabIds(wrongIds);
    setVocabAttempts(attempts);
    // Save vocabAttempts in sessionState so mastery can be updated even if
    // the learner resumes after a page refresh (which would skip Ex1).
    await autoSave({
      ex1Score: score,
      ex1Completed: true,
      wrongVocabIds: wrongIds,
      sessionState: { vocabAttempts: attempts },
    });
    setPhase('EX2_INTRO');
  }, [autoSave]);

  const handleEx2Complete = useCallback(async (score: number) => {
    setEx2Score(score);
    await autoSave({ ex2Score: score, ex2Completed: true });
    setPhase((conversationItem || readingItem) ? 'EX3_INTRO' : 'SUBMITTING');
  }, [autoSave, conversationItem, readingItem]);

  const handleEx3Complete = useCallback(async (score: number) => {
    setEx3aScore(score);
    setEx3bScore(0);
    setPhase('SUBMITTING');
  }, []);

  // Submit on entering SUBMITTING phase
  useEffect(() => {
    if (phase !== 'SUBMITTING') return;

    const submit = async () => {
      try {
        const totalScore = ex1Score + ex2Score + ex3aScore + ex3bScore;
        const res = await fetch('/api/homework/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            windowId: hw.id,
            classId,
            ex1Score,
            ex2Score,
            ex3aScore,
            ex3bScore,
            wrongVocabIds,
            vocabAttempts,
            readingLessonId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submit failed');

        setWordsCommittedCount(data.wordsCommittedCount ?? 0);
        setFinalScores({ ex1: ex1Score, ex2: ex2Score, ex3a: ex3aScore, ex3b: ex3bScore, total: totalScore });
        setPhase('SCORECARD');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Submission failed';
        setError(msg);
        setPhase('ERROR');
      }
    };

    submit();
  }, [phase, hw.id, classId, ex1Score, ex2Score, ex3aScore, ex3bScore, wrongVocabIds, vocabAttempts]);

  // — Render —

  if (phase === 'LOADING') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your homework...</p>
      </div>
    );
  }

  if (phase === 'ERROR') {
    return (
      <div className="bg-destructive/10 rounded-2xl p-6 flex flex-col items-center gap-3">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive font-medium text-center">{error}</p>
        <button onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground transition">
          Go back
        </button>
      </div>
    );
  }

  if (phase === 'SUBMITTING') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Saving your results...</p>
      </div>
    );
  }

  if (phase === 'SCORECARD' && (finalScores || existingSubmission?.allCompleted)) {
    const scores = finalScores ?? {
      ex1: existingSubmission!.ex1Score,
      ex2: existingSubmission!.ex2Score,
      ex3a: existingSubmission!.ex3aScore,
      ex3b: existingSubmission!.ex3bScore,
      total: existingSubmission!.totalScore,
    };
    return (
      <HomeworkScorecard
        windowId={hw.id}
        classId={classId}
        maxPossiblePoints={hw.maxPossiblePoints}
        ex1Score={scores.ex1}
        ex2Score={scores.ex2}
        ex3aScore={scores.ex3a}
        ex3bScore={scores.ex3b}
        totalScore={scores.total}
        vocabAttempts={vocabAttempts}
        wrongVocabIds={wrongVocabIds}
        wordsCommittedCount={wordsCommittedCount}
        isReview={hw.isReviewSession}
        onDone={onDone}
      />
    );
  }

  if (phase === 'EX1_INTRO') {
    return (
      <TimedToggle
        label="Exercise 1 · Vocabulary"
        description={`Guess ${vocabPool.length} words from clues and record your pronunciation.`}
        timedMode={ex1Timed}
        onToggle={setEx1Timed}
        onStart={() => setPhase('EX1')}
      />
    );
  }

  if (phase === 'EX1') {
    return (
      <Exercise1Vocab
        vocabPool={vocabPool}
        timedMode={ex1Timed}
        onComplete={handleEx1Complete}
      />
    );
  }

  if (phase === 'EX2_INTRO') {
    return (
      <TimedToggle
        label="Exercise 2 · Sentence Structure"
        description={`Practice ${structurePool.length} sentence patterns — read the example, then make your own.`}
        timedMode={ex2Timed}
        onToggle={setEx2Timed}
        onStart={() => setPhase('EX2')}
      />
    );
  }

  if (phase === 'EX2') {
    return (
      <Exercise2Structure
        structures={structurePool}
        timedMode={ex2Timed}
        onComplete={handleEx2Complete}
      />
    );
  }

  if (phase === 'EX3_INTRO') {
    const isConversation = !!conversationItem;
    const learnerTurnCount = conversationItem?.turns.filter(t => t.speaker === 'LEARNER').length ?? 0;
    return (
      <div className="space-y-4">
        <div className="text-center py-2">
          <div className="flex justify-center mb-3">
            <div className={`p-3 rounded-2xl ${isConversation ? 'bg-violet-100' : 'bg-emerald-100'}`}>
              {isConversation
                ? <MessageCircle className="w-8 h-8 text-violet-600" />
                : <BookOpen className="w-8 h-8 text-emerald-600" />
              }
            </div>
          </div>
          <h3 className="text-lg font-bold text-foreground mb-1">
            {isConversation ? 'Exercise 3: Conversation Practice' : 'Exercise 3: Reading Practice'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isConversation
              ? `Role-play a conversation in ${learnerTurnCount} turns. Use the grammar structures you've learned.`
              : 'Read the lesson passage aloud. Target vocabulary words are hidden — use hints if needed.'
            }
          </p>
        </div>
        <button
          onClick={() => setPhase('EX3')}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition"
        >
          {isConversation ? 'Start Conversation' : 'Start Reading'}
        </button>
      </div>
    );
  }

  if (phase === 'EX3') {
    if (conversationItem) {
      return (
        <Exercise3Conversation
          item={conversationItem}
          structures={allStructures}
          learnerRole={learnerRole}
          onComplete={handleEx3Complete}
        />
      );
    }
    return (
      <Exercise3Reading
        item={readingItem!}
        onComplete={handleEx3Complete}
      />
    );
  }

  // Fallback: exercise intro icons display
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
        <BookOpen className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Exercise 1: Vocabulary</p>
          <p className="text-xs text-primary">{vocabPool.length} words</p>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Exercise 2: Sentence Structure</p>
          <p className="text-xs text-primary">{structurePool.length} patterns</p>
        </div>
      </div>
      {conversationItem && (
        <div className="flex items-center gap-3 bg-violet-50 rounded-xl p-4">
          <MessageCircle className="w-5 h-5 text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-violet-800">Exercise 3: Conversation Practice</p>
            <p className="text-xs text-violet-600">{conversationItem.turns.filter(t => t.speaker === 'LEARNER').length} turns</p>
          </div>
        </div>
      )}
      {!conversationItem && readingItem && (
        <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-4">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Exercise 3: Reading Practice</p>
            <p className="text-xs text-emerald-600">{readingItem.vocabWords.length} vocabulary words</p>
          </div>
        </div>
      )}
    </div>
  );
}
