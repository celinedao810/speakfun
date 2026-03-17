"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, MessageCircle, Timer, Loader2, AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission, HomeworkSessionState, LessonExercises, VocabExerciseItem, StructureExerciseItem, ReadingExerciseItem, ClassHomeworkSettings, VocabAttemptAudit, ConversationExercise } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import Exercise1Vocab from './Exercise1Vocab';
import Exercise2Structure from './Exercise2Structure';
import Exercise3Reading from './Exercise3Reading';
import Exercise3Conversation from './Exercise3Conversation';
import HomeworkScorecard from './HomeworkScorecard';

type SessionPhase =
  | 'LOADING'
  | 'HUB'
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

  // Completion flags
  const [ex1Done, setEx1Done] = useState(existingSubmission?.ex1Completed ?? false);
  const [ex2Done, setEx2Done] = useState(existingSubmission?.ex2Completed ?? false);
  const [ex3Done, setEx3Done] = useState(existingSubmission?.ex3Completed ?? false);

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

        if (existingSubmission?.allCompleted) {
          setPhase('SCORECARD');
        } else {
          setPhase('HUB');
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
    setEx1Done(true);
    setWrongVocabIds(wrongIds);
    setVocabAttempts(attempts);
    await autoSave({
      ex1Score: score,
      ex1Completed: true,
      wrongVocabIds: wrongIds,
      sessionState: { vocabAttempts: attempts },
    });
    setPhase('HUB');
  }, [autoSave]);

  const handleEx2Complete = useCallback(async (score: number) => {
    setEx2Score(score);
    setEx2Done(true);
    await autoSave({ ex2Score: score, ex2Completed: true });
    setPhase('HUB');
  }, [autoSave]);

  const handleEx3Complete = useCallback(async (score: number) => {
    setEx3aScore(score);
    setEx3bScore(0);
    setEx3Done(true);
    await autoSave({ ex3aScore: score, ex3Completed: true });
    setPhase('HUB');
  }, [autoSave]);

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
          learnerName={profile?.full_name || ''}
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

  if (phase === 'HUB') {
    const hasEx3 = !!(conversationItem || readingItem);
    const allDone = ex1Done && ex2Done && (!hasEx3 || ex3Done);
    const ex3TurnCount = conversationItem?.turns.filter(t => t.speaker === 'LEARNER').length ?? 0;

    const ExCard = ({
      exNum, icon, title, subtitle, done, score, onStart,
    }: {
      exNum: number; icon: React.ReactNode; title: string; subtitle: string;
      done: boolean; score: number; onStart: () => void;
    }) => (
      <div className={`flex items-center gap-4 rounded-xl border p-4 ${done ? 'bg-muted/40 border-border' : 'bg-card border-border'}`}>
        <div className={`p-2.5 rounded-xl shrink-0 ${done ? 'bg-emerald-100' : 'bg-primary/10'}`}>
          {done ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Ex {exNum} · {title}</p>
          <p className={`text-xs mt-0.5 ${done ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
            {done ? `+${score.toFixed(1)} pts` : subtitle}
          </p>
        </div>
        {!done && (
          <button
            onClick={onStart}
            className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition shrink-0"
          >
            Start <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );

    return (
      <div className="space-y-3">
        <ExCard exNum={1} icon={<BookOpen className="w-5 h-5 text-primary" />}
          title="Vocabulary" subtitle={`${vocabPool.length} words`}
          done={ex1Done} score={ex1Score} onStart={() => setPhase('EX1_INTRO')} />
        <ExCard exNum={2} icon={<MessageCircle className="w-5 h-5 text-primary" />}
          title="Sentences" subtitle={`${structurePool.length} patterns`}
          done={ex2Done} score={ex2Score} onStart={() => setPhase('EX2_INTRO')} />
        {hasEx3 && (
          <ExCard exNum={3}
            icon={conversationItem
              ? <MessageCircle className="w-5 h-5 text-violet-600" />
              : <BookOpen className="w-5 h-5 text-emerald-600" />}
            title={conversationItem ? 'Conversation' : 'Reading'}
            subtitle={conversationItem ? `${ex3TurnCount} turns` : `${readingItem?.vocabWords.length ?? 0} vocab words`}
            done={ex3Done} score={ex3aScore + ex3bScore} onStart={() => setPhase('EX3_INTRO')} />
        )}
        <div className="pt-2">
          <button
            onClick={() => setPhase('SUBMITTING')}
            disabled={!allDone}
            className={`w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
              allDone
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Submit & See Results
          </button>
          {!allDone && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Complete all exercises to submit.
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
