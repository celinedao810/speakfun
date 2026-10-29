"use client";

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import {
  HomeworkWindow, HomeworkSubmission, HomeworkSessionState,
  LessonExercises, VocabExerciseItem, StructureExerciseItem,
  ClassHomeworkSettings, VocabAttemptAudit, StructureAttemptAudit,
} from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { generateFreeTalkTopic } from '@/lib/ai/aiClient';
import Exercise1Vocab, { WordResult } from './Exercise1Vocab';
import { pickPool } from '@/lib/homework/poolSelection';
import { itemKey } from '@/lib/homework/itemKeys';
import Exercise2Structure, { StructureResult } from './Exercise2Structure';
import Exercise3FreeTalk from './Exercise3FreeTalk';
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
  const [countdown, setCountdown] = useState(30);

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

      <div className="space-y-2 max-h-60 sm:max-h-72 overflow-y-auto">
        {wordResults.map((r, i) => (
          <div key={i} className={`rounded-xl border px-4 py-2.5 ${
            r.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}>
            <div className="flex items-center gap-3">
              {r.isCorrect
                ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              }
              <span className="text-sm font-medium text-foreground flex-1">{r.item.word}</span>
              <span className={`text-sm font-bold ${r.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                {r.isCorrect ? `+${r.pointsEarned.toFixed(1)}` : '0'}
              </span>
            </div>
            {!r.isCorrect && (
              r.recognizedWord && r.recognizedWord !== r.item.word.toLowerCase()
                ? <p className="mt-1 ml-7 text-xs text-red-500 italic">heard: "{r.recognizedWord}"</p>
                : !r.recognizedWord
                  ? <p className="mt-1 ml-7 text-xs text-slate-400 italic">Missed</p>
                  : null
            )}
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
            style={{ width: `${((30 - countdown) / 30) * 100}%` }}
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
  const [countdown, setCountdown] = useState(45);

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

      <div className="space-y-2 max-h-72 sm:max-h-80 overflow-y-auto">
        {structureResults.map((r, i) => (
          <div key={i} className={`rounded-xl border px-4 py-2.5 ${
            r.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
          }`}>
            <div className="flex items-start gap-3">
              {r.isCorrect
                ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              }
              <span className="text-xs font-mono text-foreground flex-1 leading-snug">{r.item.pattern}</span>
              <span className={`text-sm font-bold shrink-0 ${r.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                {r.isCorrect ? `+${r.pointsEarned.toFixed(1)}` : '0'}
              </span>
            </div>
            {r.transcription && (
              <p className="mt-1.5 ml-7 text-xs text-muted-foreground italic">"{r.transcription}"</p>
            )}
            {!r.isCorrect && r.correctedSentence && (
              <p className="mt-1 ml-7 text-xs text-green-700 font-medium">✓ {r.correctedSentence}</p>
            )}
            {r.feedback && (
              <p className="mt-1 ml-7 text-xs text-slate-500">{r.feedback}</p>
            )}
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
            style={{ width: `${((30 - countdown) / 30) * 100}%` }}
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
  const [ex3DurationMins, setEx3DurationMins] = useState(2);
  const [ex3DeductedPointsPerError, setEx3DeductedPointsPerError] = useState(0.1);

  const learnerRole = profile?.preferences?.role || profile?.job_title || '';

  // Scores & tracking
  const [ex1Score, setEx1Score] = useState(existingSubmission?.ex1Score ?? 0);
  const [ex2Score, setEx2Score] = useState(existingSubmission?.ex2Score ?? 0);
  const [ex3bScore, setEx3bScore] = useState(existingSubmission?.ex3bScore ?? 0);
  const [vocabAttempts, setVocabAttempts] = useState<VocabAttemptAudit[]>([]);
  const [wrongVocabIds, setWrongVocabIds] = useState<string[]>([]);
  const [structureAttempts, setStructureAttempts] = useState<StructureAttemptAudit[]>([]);
  const [wordsCommittedCount, setWordsCommittedCount] = useState(0);
  const [structuresCommittedCount, setStructuresCommittedCount] = useState(0);
  const [finalScores, setFinalScores] = useState<{ ex1: number; ex2: number; ex3b: number; total: number } | null>(null);

  // Summary data to display between exercises
  const [ex1WordResults, setEx1WordResults] = useState<WordResult[]>([]);
  const [ex2StructureResults, setEx2StructureResults] = useState<StructureResult[]>([]);
  // Ex3 speaking topic — generated in background when Ex2 completes
  const [freeTalkTopic, setFreeTalkTopic] = useState<string>('');

  // Load exercise data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const settingsRes = await fetch(`/api/homework/settings?classId=${classId}`);
        const settingsData: ClassHomeworkSettings | null = settingsRes.ok ? await settingsRes.json() : null;
        if (settingsData) {
          setEx3DurationMins(settingsData.ex3DurationMins ?? 2);
          setEx3DeductedPointsPerError(settingsData.ex3DeductedPointsPerError ?? 0.1);
        }

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

        const limit = settingsData?.reviewWordCount ?? 15;

        // Vocab pool: only unmastered words, mixing retries of last-time-wrong words with
        // never-practised and least-recently-practised ones (see pickPool).
        const masteryRes = await fetch(`/api/homework/vocab-notebook?classId=${classId}`);
        const masteryData = masteryRes.ok ? await masteryRes.json() : null;
        const masteryEntries: Array<{ vocabItemId: string; lessonId: string; isCommitted: boolean; lastSeenAt?: string; lastAttemptCorrect?: boolean }> =
          masteryData?.entries ?? [];

        const masteredKeys = new Set<string>();
        const progressByKey = new Map<string, { lastSeenAt?: string; lastAttemptCorrect?: boolean }>();
        for (const e of masteryEntries) {
          const k = itemKey(e.lessonId, e.vocabItemId);
          if (e.isCommitted) masteredKeys.add(k);
          progressByKey.set(k, { lastSeenAt: e.lastSeenAt, lastAttemptCorrect: e.lastAttemptCorrect });
        }

        const key = (v: VocabExerciseItem) => itemKey(v.lessonId, v.id);

        // If Ex1 already completed, rebuild the pool from the saved vocab attempts
        // so Ex2/Ex3 display the exact same words Ex1 tested (instead of re-picking).
        const savedVocabAttempts = existingSubmission?.sessionState?.vocabAttempts;
        let pool: VocabExerciseItem[];
        if (existingSubmission?.ex1Completed && savedVocabAttempts && savedVocabAttempts.length > 0) {
          const seenPairs = new Set<string>();
          const reconstructed: VocabExerciseItem[] = [];
          for (const a of savedVocabAttempts) {
            const k = itemKey(a.lessonId, a.vocabItemId);
            if (seenPairs.has(k)) continue;
            seenPairs.add(k);
            const v = allVocab.find(x => x.lessonId === a.lessonId && x.id === a.vocabItemId);
            if (v) reconstructed.push(v);
          }
          pool = reconstructed.slice(0, limit);
        } else {
          // The same word text can exist in several lessons. Treat it as ONE word: skip it if it
          // is mastered in any lesson, otherwise keep the instance with the most recent practice
          // (ties broken by key) so its progress follows it and the choice never flips.
          const byWord = new Map<string, VocabExerciseItem[]>();
          for (const v of allVocab) {
            const w = v.word.toLowerCase().trim();
            byWord.set(w, [...(byWord.get(w) ?? []), v]);
          }
          const candidates: VocabExerciseItem[] = [];
          for (const instances of byWord.values()) {
            if (instances.some(v => masteredKeys.has(key(v)))) continue;
            const best = [...instances].sort((a, b) => {
              const la = progressByKey.get(key(a))?.lastSeenAt ?? '';
              const lb = progressByKey.get(key(b))?.lastSeenAt ?? '';
              return lb.localeCompare(la) || key(a).localeCompare(key(b));
            })[0];
            candidates.push(best);
          }
          pool = pickPool(candidates, limit, v => progressByKey.get(key(v)) ?? {});
        }

        setVocabPool(pool);

        const structureLimit = settingsData?.reviewStructureCount ?? 5;

        // If resuming to EX3, restore the exact structure set used in Ex2
        // Keys are "lessonId:id" because structure IDs ("s1"...) repeat across lessons; sessions
        // saved before keys existed only have bare IDs (usedStructureIds), used as a fallback.
        const savedStructureKeys = existingSubmission?.sessionState?.usedStructureKeys;
        const savedStructureIds = existingSubmission?.sessionState?.usedStructureIds;
        let structuresToUse: StructureExerciseItem[];
        if (savedStructureKeys && savedStructureKeys.length > 0) {
          const keySet = new Set(savedStructureKeys);
          const ordered = savedStructureKeys
            .map(k => aggregatedStructures.find(s => itemKey(s.lessonId, s.id) === k))
            .filter((s): s is StructureExerciseItem => s !== undefined);
          const rest = aggregatedStructures.filter(s => !keySet.has(itemKey(s.lessonId, s.id)));
          structuresToUse = [...ordered, ...rest];
        } else if (savedStructureIds && savedStructureIds.length > 0) {
          // Legacy session saved before keys existed. A bare ID is only trusted when exactly one
          // structure in the pool has it; an ambiguous ID could be the wrong lesson's structure.
          const unique = (id: string) => {
            const matches = aggregatedStructures.filter(st => st.id === id);
            return matches.length === 1 ? matches[0] : undefined;
          };
          const ordered = savedStructureIds.map(unique).filter((st): st is StructureExerciseItem => st !== undefined);
          const orderedKeys = new Set(ordered.map(st => itemKey(st.lessonId, st.id)));
          const rest = aggregatedStructures.filter(st => !orderedKeys.has(itemKey(st.lessonId, st.id)));
          structuresToUse = [...ordered, ...rest];
        } else {
          // Drop structures this learner has mastered (keyed by lessonId:id — structure IDs
          // like "s1" repeat across lessons). If everything is mastered, keep the full list so
          // Ex2/Ex3 still have material to practise.
          const structMasteryRes = await fetch(`/api/homework/structure-notebook?classId=${classId}`);
          const structMasteryData = structMasteryRes.ok ? await structMasteryRes.json() : null;
          const masteredStructureKeys = new Set<string>(
            ((structMasteryData?.entries ?? []) as Array<{ structureItemId: string; lessonId: string; isCommitted: boolean }>)
              .filter(e => e.isCommitted)
              .map(e => itemKey(e.lessonId, e.structureItemId))
          );
          const structureProgress = new Map<string, { lastSeenAt?: string; lastAttemptCorrect?: boolean }>(
            ((structMasteryData?.entries ?? []) as Array<{ structureItemId: string; lessonId: string; lastSeenAt?: string; lastAttemptCorrect?: boolean }>)
              .map(e => [itemKey(e.lessonId, e.structureItemId), { lastSeenAt: e.lastSeenAt, lastAttemptCorrect: e.lastAttemptCorrect }])
          );
          const activeStructures = aggregatedStructures.filter(
            st => !masteredStructureKeys.has(itemKey(st.lessonId, st.id))
          );
          const structureSource = activeStructures.length > 0 ? activeStructures : aggregatedStructures;
          structuresToUse = pickPool(structureSource, structureLimit, st => structureProgress.get(itemKey(st.lessonId, st.id)) ?? {});
        }
        setStructurePool(structuresToUse.slice(0, structureLimit));

        // Restore vocab attempts
        const savedAttempts = existingSubmission?.sessionState?.vocabAttempts;
        if (savedAttempts && savedAttempts.length > 0) {
          setVocabAttempts(savedAttempts);
        }

        // If resuming to EX3, kick off topic generation immediately during load
        if (existingSubmission?.ex2Completed && !existingSubmission?.allCompleted) {
          generateFreeTalkTopic(
            pool.map(v => v.word),
            structuresToUse.slice(0, structureLimit).map(s => s.pattern),
            profile?.preferences?.role || profile?.job_title || undefined,
          ).then(t => { if (t) setFreeTalkTopic(t); }).catch(() => {});
        }

        if (existingSubmission?.allCompleted && existingSubmission?.submittedAt) {
          setPhase('SCORECARD');
        } else if (existingSubmission?.allCompleted && !existingSubmission?.submittedAt) {
          setPhase('SUBMITTING');
        } else if (existingSubmission?.ex2Completed) {
          setPhase('EX3');
        } else if (existingSubmission?.ex1Completed) {
          setPhase('EX2');
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
    ex1Score?: number; ex2Score?: number; ex3bScore?: number;
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

    const now = new Date().toISOString();
    const attempts: StructureAttemptAudit[] = structureResults.map(r => ({
      structureItemId: r.item.id,
      lessonId: r.item.lessonId,
      isCorrect: r.isCorrect,
      attemptTimestamp: now,
    }));
    setStructureAttempts(attempts);

    await autoSave({
      ex2Score: score,
      ex2Completed: true,
      sessionState: {
        usedStructureIds: structurePool.map(s => s.id),
        usedStructureKeys: structurePool.map(s => itemKey(s.lessonId, s.id)),
        structureAttempts: attempts,
      },
    });
    generateFreeTalkTopic(
      vocabPool.map(v => v.word),
      structurePool.map(s => s.pattern),
      learnerRole || undefined,
    ).then(t => { if (t) setFreeTalkTopic(t); }).catch(() => {});
    setPhase('EX2_SUMMARY');
  }, [autoSave, vocabPool, structurePool, learnerRole]);

  const handleEx3Complete = useCallback(async (score: number, attempts: StructureAttemptAudit[] = []) => {
    setEx3bScore(score);
    // Ex3 reports no structure attempts; keep Ex2's so /submit can still record mastery if needed.
    if (attempts.length > 0) setStructureAttempts(attempts);
    await autoSave({ ex3bScore: score, ex3Completed: true });
    setPhase('SUBMITTING');
  }, [autoSave]);

  // Submit on entering SUBMITTING phase
  useEffect(() => {
    if (phase !== 'SUBMITTING') return;

    const submit = async () => {
      try {
        const totalScore = ex1Score + ex2Score + ex3bScore;
        const res = await fetch('/api/homework/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            windowId: hw.id,
            classId,
            ex1Score,
            ex2Score,
            ex3aScore: 0,
            ex3bScore,
            wrongVocabIds,
            vocabAttempts,
            structureAttempts,
            readingLessonId: null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submit failed');

        setWordsCommittedCount(data.wordsCommittedCount ?? 0);
        setStructuresCommittedCount(data.structuresCommittedCount ?? 0);
        setFinalScores({ ex1: ex1Score, ex2: ex2Score, ex3b: ex3bScore, total: totalScore });
        setPhase('SCORECARD');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Submission failed');
        setPhase('ERROR');
      }
    };

    submit();
  }, [phase, hw.id, classId, ex1Score, ex2Score, ex3bScore, wrongVocabIds, vocabAttempts, structureAttempts]);

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
        ex3aScore={0}
        ex3bScore={scores.ex3b}
        totalScore={scores.total}
        vocabAttempts={vocabAttempts}
        wrongVocabIds={wrongVocabIds}
        wordsCommittedCount={wordsCommittedCount}
        structuresCommittedCount={structuresCommittedCount}
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
    return (
      <Exercise3FreeTalk
        vocabWords={vocabPool}
        structures={structurePool}
        topic={freeTalkTopic || undefined}
        durationMins={ex3DurationMins}
        deductedPointsPerError={ex3DeductedPointsPerError}
        onComplete={(score) => handleEx3Complete(score, [])}
      />
    );
  }

  return null;
}
