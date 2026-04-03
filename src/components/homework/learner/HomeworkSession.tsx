"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import {
  HomeworkWindow, HomeworkSubmission, HomeworkSessionState,
  LessonExercises, VocabExerciseItem, StructureExerciseItem,
  ClassHomeworkSettings, VocabAttemptAudit, StructureAttemptAudit,
} from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import Exercise1Vocab, { WordResult } from './Exercise1Vocab';
import Exercise2Structure, { StructureResult } from './Exercise2Structure';
import Exercise3FreeTalk from './Exercise3FreeTalk';
import Exercise3Conversation from './Exercise3Conversation';
import Exercise3Reading from './Exercise3Reading';
import HomeworkScorecard from './HomeworkScorecard';

type SessionPhase =
  | 'LOADING'
  | 'EX1'
  | 'EX1_SUMMARY'
  | 'EX2'
  | 'EX2_SUMMARY'
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

// ── Summary component shown between exercises ────────────────────────────────

function Ex1Summary({
  wordResults,
  totalScore,
  onAutoAdvance,
}: {
  wordResults: WordResult[];
  totalScore: number;
  onAutoAdvance: () => void;
}) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          onAutoAdvance();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onAutoAdvance]);

  const correctCount = wordResults.filter(r => r.isCorrect).length;

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h3 className="text-lg font-bold text-foreground">Vocabulary Done!</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {correctCount}/{wordResults.length} correct · {totalScore.toFixed(1)} pts
        </p>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {wordResults.map((r, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
            r.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}>
            {r.isCorrect
              ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            }
            <span className="text-sm font-medium text-foreground flex-1">{r.item.word}</span>
            <span className={`text-sm font-bold ${r.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
              {r.isCorrect ? `+${r.pointsEarned.toFixed(1)}` : '0'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-muted/40 rounded-xl p-3 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Moving to Sentence Structures in</span>
          <span className="text-2xl font-black text-primary tabular-nums">{countdown}s</span>
        </div>
        <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Ex2Summary({
  structureResults,
  totalScore,
  onAutoAdvance,
}: {
  structureResults: StructureResult[];
  totalScore: number;
  onAutoAdvance: () => void;
}) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          onAutoAdvance();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onAutoAdvance]);

  const correctCount = structureResults.filter(r => r.isCorrect).length;

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h3 className="text-lg font-bold text-foreground">Sentences Done!</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {correctCount}/{structureResults.length} correct · {totalScore.toFixed(1)} pts
        </p>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {structureResults.map((r, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border ${
            r.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}>
            {r.isCorrect
              ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            }
            <span className="text-xs font-mono text-foreground flex-1 leading-snug">{r.item.pattern}</span>
            <span className={`text-sm font-bold shrink-0 ${r.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
              {r.isCorrect ? `+${r.pointsEarned.toFixed(1)}` : '0'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-muted/40 rounded-xl p-3 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Moving to Free Talk in</span>
          <span className="text-2xl font-black text-primary tabular-nums">{countdown}s</span>
        </div>
        <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main session component ───────────────────────────────────────────────────

export default function HomeworkSession({ window: hw, classId, existingSubmission, onDone }: HomeworkSessionProps) {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<SessionPhase>('LOADING');
  const [error, setError] = useState<string | null>(null);

  // Exercise data
  const [vocabPool, setVocabPool] = useState<VocabExerciseItem[]>([]);
  const [structurePool, setStructurePool] = useState<StructureExerciseItem[]>([]);
  const [allStructures, setAllStructures] = useState<StructureExerciseItem[]>([]);
  // Legacy: non-review session exercises
  const [conversationItem, setConversationItem] = useState<LessonExercises['conversationExercise'] | null>(null);
  const [readingItem, setReadingItem] = useState<{ lessonId: string; readingPassage: string; vocabWords: VocabExerciseItem[] } | null>(null);
  const [readingLessonId, setReadingLessonId] = useState<string | null>(null);

  const learnerRole = profile?.preferences?.role || profile?.job_title || '';

  // Scores & tracking
  const [ex1Score, setEx1Score] = useState(existingSubmission?.ex1Score ?? 0);
  const [ex2Score, setEx2Score] = useState(existingSubmission?.ex2Score ?? 0);
  const [ex3aScore, setEx3aScore] = useState(existingSubmission?.ex3aScore ?? 0);
  const [ex3bScore, setEx3bScore] = useState(existingSubmission?.ex3bScore ?? 0);
  const [vocabAttempts, setVocabAttempts] = useState<VocabAttemptAudit[]>([]);
  const [wrongVocabIds, setWrongVocabIds] = useState<string[]>([]);
  const [structureAttempts, setStructureAttempts] = useState<StructureAttemptAudit[]>([]);
  const [wordsCommittedCount, setWordsCommittedCount] = useState(0);
  const [structuresCommittedCount, setStructuresCommittedCount] = useState(0);
  const [finalScores, setFinalScores] = useState<{ ex1: number; ex2: number; ex3a: number; ex3b: number; total: number } | null>(null);

  // Summary data to display between exercises
  const [ex1WordResults, setEx1WordResults] = useState<WordResult[]>([]);
  const [ex2StructureResults, setEx2StructureResults] = useState<StructureResult[]>([]);

  // Load exercise data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const settingsRes = await fetch(`/api/homework/settings?classId=${classId}`);
        const settingsData: ClassHomeworkSettings | null = settingsRes.ok ? await settingsRes.json() : null;

        const lessonIds = hw.lessonIdsInPool;
        if (lessonIds.length === 0) {
          setError('No lessons in homework pool. Please contact your teacher.');
          setPhase('ERROR');
          return;
        }

        const exRes = await fetch(`/api/homework/exercises?lessonIds=${lessonIds.join(',')}`);
        if (!exRes.ok) throw new Error('Failed to load exercises');
        const exData: LessonExercises[] = await exRes.json();

        const allVocab: VocabExerciseItem[] = exData.flatMap(e => e.vocabItems ?? []);
        const aggregatedStructures: StructureExerciseItem[] = exData.flatMap(e => e.structureItems ?? []);

        const prevWrong = existingSubmission?.wrongVocabIds ?? [];
        const limit = hw.isReviewSession
          ? (settingsData?.reviewWordCount ?? 15)
          : (settingsData?.wordsPerSession ?? 10);

        let pool: VocabExerciseItem[];
        if (hw.isReviewSession) {
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
          const masteredItems = seenVocab.filter(v => masteredKeys.has(key(v))).sort(() => Math.random() - 0.5);
          pool = [...wrongNotMastered, ...freshNotMastered, ...masteredItems].slice(0, limit);
        } else {
          const wrongItems = allVocab.filter(v => prevWrong.includes(v.id));
          const freshItems = allVocab.filter(v => !prevWrong.includes(v.id));
          pool = [...wrongItems, ...[...freshItems].sort(() => Math.random() - 0.5)].slice(0, limit);
        }

        setVocabPool(pool);

        const structureLimit = hw.isReviewSession
          ? (settingsData?.reviewStructureCount ?? 5)
          : (settingsData?.structuresPerSession ?? 5);
        const structuresToUse = hw.isReviewSession
          ? [...aggregatedStructures].sort(() => Math.random() - 0.5)
          : aggregatedStructures;
        setStructurePool(structuresToUse.slice(0, structureLimit));
        setAllStructures(aggregatedStructures);

        // Legacy: non-review session Ex3
        if (!hw.isReviewSession) {
          const pendingId = hw.pendingReadingLessonId;
          if (pendingId) {
            const pendingEx = exData.find(e => e.lessonId === pendingId);
            if (pendingEx?.conversationExercise) {
              setConversationItem(pendingEx.conversationExercise);
              setReadingLessonId(pendingId);
            } else if (pendingEx?.readingPassage) {
              setReadingItem({ lessonId: pendingId, readingPassage: pendingEx.readingPassage, vocabWords: pendingEx.vocabItems ?? [] });
              setReadingLessonId(pendingId);
            }
          }

          // Legacy: review conversation for old non-review sessions that still use conversation
          const cached = existingSubmission?.sessionState?.reviewConversationData;
          if (cached) setConversationItem(cached);
        }

        // Restore vocab attempts
        const savedAttempts = existingSubmission?.sessionState?.vocabAttempts;
        if (savedAttempts && savedAttempts.length > 0) {
          setVocabAttempts(savedAttempts);
        }

        if (existingSubmission?.allCompleted) {
          setPhase('SCORECARD');
        } else {
          setPhase('EX1');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load homework');
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
        body: JSON.stringify({ windowId: hw.id, classId, ...partial }),
      });
    } catch { /* non-blocking */ }
  }, [hw.id, classId]);

  const handleEx1Complete = useCallback(async (score: number, wrongIds: string[], attempts: VocabAttemptAudit[], wordResults: WordResult[]) => {
    setEx1Score(score);
    setWrongVocabIds(wrongIds);
    setVocabAttempts(attempts);
    setEx1WordResults(wordResults);
    await autoSave({ ex1Score: score, ex1Completed: true, wrongVocabIds: wrongIds, sessionState: { vocabAttempts: attempts } });
    setPhase('EX1_SUMMARY');
  }, [autoSave]);

  const handleEx2Complete = useCallback(async (score: number, structureResults: StructureResult[]) => {
    setEx2Score(score);
    setEx2StructureResults(structureResults);
    await autoSave({ ex2Score: score, ex2Completed: true });
    setPhase('EX2_SUMMARY');
  }, [autoSave]);

  const handleEx3Complete = useCallback(async (score: number, attempts: StructureAttemptAudit[] = []) => {
    // For new review sessions: score goes to ex3bScore (free talk)
    // For legacy sessions: score goes to ex3aScore (reading/conversation)
    if (hw.isReviewSession) {
      setEx3bScore(score);
      setStructureAttempts(attempts);
      await autoSave({ ex3bScore: score, ex3Completed: true });
    } else {
      setEx3aScore(score);
      setStructureAttempts(attempts);
      await autoSave({ ex3aScore: score, ex3Completed: true });
    }
    setPhase('SUBMITTING');
  }, [hw.isReviewSession, autoSave]);

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
            structureAttempts,
            readingLessonId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submit failed');

        setWordsCommittedCount(data.wordsCommittedCount ?? 0);
        setStructuresCommittedCount(data.structuresCommittedCount ?? 0);
        setFinalScores({ ex1: ex1Score, ex2: ex2Score, ex3a: ex3aScore, ex3b: ex3bScore, total: totalScore });
        setPhase('SCORECARD');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Submission failed');
        setPhase('ERROR');
      }
    };

    submit();
  }, [phase, hw.id, classId, ex1Score, ex2Score, ex3aScore, ex3bScore, wrongVocabIds, vocabAttempts, structureAttempts, readingLessonId]);

  // ── Render ──

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
        structuresCommittedCount={structuresCommittedCount}
        isReview={hw.isReviewSession}
        onDone={onDone}
      />
    );
  }

  if (phase === 'EX1') {
    return (
      <Exercise1Vocab
        vocabPool={vocabPool}
        onComplete={handleEx1Complete}
      />
    );
  }

  if (phase === 'EX1_SUMMARY') {
    return (
      <Ex1Summary
        wordResults={ex1WordResults}
        totalScore={ex1Score}
        onAutoAdvance={() => setPhase('EX2')}
      />
    );
  }

  if (phase === 'EX2') {
    return (
      <Exercise2Structure
        structures={structurePool}
        onComplete={handleEx2Complete}
      />
    );
  }

  if (phase === 'EX2_SUMMARY') {
    return (
      <Ex2Summary
        structureResults={ex2StructureResults}
        totalScore={ex2Score}
        onAutoAdvance={() => setPhase('EX3')}
      />
    );
  }

  if (phase === 'EX3') {
    // New review sessions: free talk
    if (hw.isReviewSession) {
      return (
        <Exercise3FreeTalk
          vocabWords={vocabPool}
          structures={structurePool}
          onComplete={(score) => handleEx3Complete(score, [])}
        />
      );
    }
    // Legacy: non-review sessions use old conversation or reading exercise
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
    if (readingItem) {
      return (
        <Exercise3Reading
          item={readingItem}
          onComplete={(score) => handleEx3Complete(score, [])}
        />
      );
    }
    // No Ex3 for legacy sessions without reading/conversation — auto-submit
    handleEx3Complete(0, []);
    return null;
  }

  return null;
}
