"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Mic, Loader2 } from 'lucide-react';
import { VocabAttemptAudit, VocabExerciseItem } from '@/lib/types';
import { scoreVocabGuess } from '@/lib/ai/aiClient';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';

interface Exercise1VocabProps {
  vocabPool: VocabExerciseItem[];
  onComplete: (score: number, wrongVocabIds: string[], attempts: VocabAttemptAudit[], wordResults: WordResult[]) => void;
}

export interface WordResult {
  item: VocabExerciseItem;
  pointsEarned: number;
  isCorrect: boolean;
  recognizedWord?: string;
}

/** Parse word type from the first word(s) of the clue field. */
function parseWordType(clue: string): string {
  const m = clue.match(/^(noun|verb|adjective|adverb|phrase|idiom|expression)/i);
  return m ? m[1].toLowerCase() : '';
}

const FALL_DURATION_MS = 20000; // 20 seconds

export default function Exercise1Vocab({ vocabPool, onComplete }: Exercise1VocabProps) {
  // === Round management ===
  const [round, setRound] = useState<1 | 2>(1);
  const [roundPool, setRoundPool] = useState<VocabExerciseItem[]>(vocabPool);
  // Saved after round 1 ends, used to merge with round 2 results
  const round1CorrectScoreRef = useRef(0);
  const round1WordResultsRef = useRef<WordResult[]>([]);
  const round1AttemptsRef = useRef<VocabAttemptAudit[]>([]);

  // === Per-round state (reset between rounds) ===
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  // null = pending/not yet answered for this round
  const [wordResults, setWordResults] = useState<(WordResult | null)[]>(() => Array(vocabPool.length).fill(null));
  const [totalScore, setTotalScore] = useState(0);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Mutable refs — safe to read inside async .then()/.catch() without stale closure
  const totalScoreRef = useRef(0);
  const wrongVocabIdsRef = useRef<string[]>([]);
  const attemptsRef = useRef<VocabAttemptAudit[]>([]);
  const wordResultsArrRef = useRef<(WordResult | null)[]>(Array(vocabPool.length).fill(null));
  const pendingCountRef = useRef(0);   // how many AI calls still in-flight
  const allAnsweredRef = useRef(false); // true once the last word is passed

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const scoredRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeightPx, setFrameHeightPx] = useState(280);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setFrameHeightPx(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentItem = roundPool[currentIndex];
  const isFinished = currentIndex >= roundPool.length;

  // Finalize scores and either start round 2 or call onComplete
  const fireOnComplete = useCallback(() => {
    const currentWordResults = wordResultsArrRef.current.map((r, i) =>
      r ?? { item: roundPool[i], pointsEarned: 0, isCorrect: false }
    );

    if (round === 1) {
      const wrongItems = currentWordResults.filter(r => !r.isCorrect).map(r => r.item);

      if (wrongItems.length === 0) {
        // Perfect round — no retry needed
        onComplete(totalScoreRef.current, [], attemptsRef.current, currentWordResults);
        return;
      }

      // Save round 1 snapshot
      round1CorrectScoreRef.current = totalScoreRef.current; // wrong items contributed 0 anyway
      round1WordResultsRef.current = currentWordResults;
      round1AttemptsRef.current = [...attemptsRef.current];

      // Reset all per-round state and jump directly to round 2
      setCurrentIndex(0);
      setProgress(0);
      setWordResults(Array(wrongItems.length).fill(null));
      setTotalScore(0);
      setFlashLabel(null);

      // Reset all mutable refs
      totalScoreRef.current = 0;
      wrongVocabIdsRef.current = [];
      attemptsRef.current = [];
      wordResultsArrRef.current = Array(wrongItems.length).fill(null);
      pendingCountRef.current = 0;
      allAnsweredRef.current = false;
      scoredRef.current = false;

      setRoundPool(wrongItems);
      setRound(2);
    } else {
      // Round 2 complete — merge with round 1 results
      const round2Results = currentWordResults;

      const mergedWordResults: WordResult[] = round1WordResultsRef.current.map(r1 => {
        if (r1.isCorrect) return r1; // Not retried, keep as-is
        const round2Index = roundPool.findIndex(item => item.id === r1.item.id);
        if (round2Index === -1) return r1;
        return round2Results[round2Index] ?? r1;
      });

      const finalScore = round1CorrectScoreRef.current + totalScoreRef.current;
      const finalWrongIds = round2Results.filter(r => !r.isCorrect).map(r => r.item.id);
      const allAttempts = [...round1AttemptsRef.current, ...attemptsRef.current];

      onComplete(finalScore, finalWrongIds, allAttempts, mergedWordResults);
    }
  }, [round, roundPool, onComplete]);

  // Advance to next word immediately (no waiting for AI)
  const advanceToNext = useCallback(() => {
    setFlashLabel(null);
    setProgress(0);
    scoredRef.current = false;
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= roundPool.length) {
        allAnsweredRef.current = true;
        if (pendingCountRef.current === 0) {
          fireOnComplete();
        }
      }
      return next;
    });
  }, [roundPool.length, fireOnComplete]);

  // Fire-and-forget AI scoring
  const handleRecordingComplete = useCallback((base64: string) => {
    if (scoredRef.current || !currentItem) return;
    scoredRef.current = true;

    const capturedIndex = currentIndex;
    const capturedItem = currentItem;
    const timestamp = new Date().toISOString();

    setFlashLabel('Recorded!');
    const tid = setTimeout(advanceToNext, 400);
    setResultTimeoutId(tid);

    pendingCountRef.current++;
    scoreVocabGuess(capturedItem.word, capturedItem.ipa, base64, true)
      .then(result => {
        result.vocabItemId = capturedItem.id;
        const pts = result.pointsEarned;
        const isCorrect = result.isCorrectWord;

        totalScoreRef.current += pts;
        if (!isCorrect && !wrongVocabIdsRef.current.includes(capturedItem.id)) {
          wrongVocabIdsRef.current = [...wrongVocabIdsRef.current, capturedItem.id];
        }
        const audit: VocabAttemptAudit = {
          vocabItemId: capturedItem.id,
          lessonId: capturedItem.lessonId,
          targetWord: capturedItem.word,
          recognizedWord: result.recognizedWord || '',
          isCorrectWord: isCorrect,
          pronunciationScore: result.pronunciationScore,
          pointsEarned: pts,
          feedback: result.feedback,
          timedMode: true,
          timeTakenMs: 0,
          timedOut: false,
          attemptTimestamp: timestamp,
        };
        attemptsRef.current = [...attemptsRef.current, audit];
        const wordResult: WordResult = { item: capturedItem, pointsEarned: pts, isCorrect, recognizedWord: result.recognizedWord || '' };
        wordResultsArrRef.current[capturedIndex] = wordResult;

        setTotalScore(totalScoreRef.current);
        setWordResults(prev => {
          const updated = [...prev];
          updated[capturedIndex] = wordResult;
          return updated;
        });
      })
      .catch(() => {
        if (!wrongVocabIdsRef.current.includes(capturedItem.id)) {
          wrongVocabIdsRef.current = [...wrongVocabIdsRef.current, capturedItem.id];
        }
        const wordResult: WordResult = { item: capturedItem, pointsEarned: 0, isCorrect: false };
        wordResultsArrRef.current[capturedIndex] = wordResult;
        setWordResults(prev => {
          const updated = [...prev];
          updated[capturedIndex] = wordResult;
          return updated;
        });
      })
      .finally(() => {
        pendingCountRef.current--;
        if (allAnsweredRef.current && pendingCountRef.current === 0) {
          fireOnComplete();
        }
      });
  }, [currentIndex, currentItem, advanceToNext, fireOnComplete]);

  // Falling block animation — re-triggers on currentIndex, isFinished, OR round change
  useEffect(() => {
    if (isFinished || !currentItem) return;

    setProgress(0);
    scoredRef.current = false;
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / FALL_DURATION_MS, 1);
      setProgress(p);

      if (p < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        if (!scoredRef.current) {
          if (recorderRef.current?.getIsActive()) {
            recorderRef.current.stop();
            return;
          }
          scoredRef.current = true;
          const capturedItem = roundPool[currentIndex];

          if (!wrongVocabIdsRef.current.includes(capturedItem.id)) {
            wrongVocabIdsRef.current = [...wrongVocabIdsRef.current, capturedItem.id];
          }
          const wordResult: WordResult = { item: capturedItem, pointsEarned: 0, isCorrect: false };
          wordResultsArrRef.current[currentIndex] = wordResult;
          setWordResults(prev => {
            const updated = [...prev];
            updated[currentIndex] = wordResult;
            return updated;
          });

          setCurrentIndex(i => {
            const next = i + 1;
            if (next >= roundPool.length) {
              allAnsweredRef.current = true;
              if (pendingCountRef.current === 0) {
                fireOnComplete();
              }
            }
            return next;
          });
          setProgress(0);
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isFinished, round]);

  useEffect(() => () => { if (resultTimeoutId) clearTimeout(resultTimeoutId); }, [resultTimeoutId]);

  // All words answered but AI calls still resolving
  if (isFinished) {
    if (pendingCountRef.current > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500">Finalizing scores…</p>
        </div>
      );
    }
    return null;
  }

  const wordType = parseWordType(currentItem.clue);
  const maskedWord = currentItem.word[0].toUpperCase() + ' ' + Array(currentItem.word.length - 1).fill('_').join(' ');
  const blockHeight = 120;
  const maxTravel = Math.max(frameHeightPx - blockHeight, 0);
  const translateY = progress * maxTravel;
  const pendingCount = wordResults.slice(0, currentIndex).filter(r => r === null).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Vocabulary</span>
          {round === 2 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Round 2</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentIndex + 1}/{roundPool.length}</span>
          <span className="text-lg font-bold text-indigo-600">{totalScore.toFixed(1)} pts</span>
        </div>
      </div>

      {/* Results trail */}
      {currentIndex > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          {wordResults.slice(0, currentIndex).map((wr, i) => (
            wr === null ? (
              <div key={i} className="rounded-full px-2 py-0.5 bg-slate-200 animate-pulse text-[10px] text-slate-400 font-medium">…</div>
            ) : (
              <div
                key={i}
                title={`${wr.item.word}: ${wr.isCorrect ? `+${wr.pointsEarned.toFixed(1)}pt` : '0pt'}`}
                className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${wr.isCorrect ? 'bg-green-500' : 'bg-red-400'}`}
              >
                {wr.isCorrect ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                <span className="max-w-[60px] truncate">{wr.item.word}</span>
              </div>
            )
          ))}
          {pendingCount > 0 && (
            <span className="text-[10px] text-slate-400 ml-1 flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />{pendingCount} scoring
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-none" style={{ width: `${(1 - progress) * 100}%` }} />
      </div>

      {/* Flash label */}
      {flashLabel && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white bg-indigo-500">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {flashLabel}
        </div>
      )}

      {/* Game frame */}
      <div
        ref={frameRef}
        className="relative bg-gradient-to-b from-indigo-950 to-slate-900 rounded-2xl overflow-hidden border border-indigo-800 h-[clamp(200px,38vh,300px)]"
      >
        <div className="absolute left-1/2 -translate-x-1/2 w-[85%]" style={{ top: `${translateY}px` }}>
          <div className="bg-indigo-700/90 backdrop-blur rounded-2xl px-5 py-4 border border-indigo-400/40 shadow-lg">
            <p className="font-mono text-xl font-bold text-white tracking-widest text-center mb-1">
              {maskedWord}
            </p>
            {wordType && (
              <p className="text-xs text-indigo-300 text-center uppercase tracking-wide mb-2">{wordType}</p>
            )}
            <p className="text-sm text-indigo-100 text-center leading-relaxed">
              {currentItem.clue.replace(/^(noun|verb|adjective|adverb|phrase|idiom|expression)[:\s]*/i, '').trim()}
            </p>
          </div>
        </div>
      </div>

      {/* Mic */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Mic className="w-3.5 h-3.5" /> Say the word before the block disappears
        </p>
        <AudioRecorder
          key={`${round}-${currentIndex}`}
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={false}
          maxDuration={21}
        />
      </div>
    </div>
  );
}
