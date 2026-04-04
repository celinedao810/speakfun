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
}

/** Parse word type from the first word(s) of the clue field. */
function parseWordType(clue: string): string {
  const m = clue.match(/^(noun|verb|adjective|adverb|phrase|idiom|expression)/i);
  return m ? m[1].toLowerCase() : '';
}

const FALL_DURATION_MS = 20000; // 20 seconds

export default function Exercise1Vocab({ vocabPool, onComplete }: Exercise1VocabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  // wordResults is fixed-length, indexed by word position; null = pending/not yet answered
  const [wordResults, setWordResults] = useState<(WordResult | null)[]>(() => Array(vocabPool.length).fill(null));
  const [totalScore, setTotalScore] = useState(0);
  // Brief flash label after recording (does NOT block next word)
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

  const currentItem = vocabPool[currentIndex];
  const isFinished = currentIndex >= vocabPool.length;

  // Helper: call onComplete with all accumulated data
  const fireOnComplete = useCallback(() => {
    onComplete(
      totalScoreRef.current,
      wrongVocabIdsRef.current,
      attemptsRef.current,
      wordResultsArrRef.current.map((r, i) =>
        r ?? { item: vocabPool[i], pointsEarned: 0, isCorrect: false }
      ),
    );
  }, [onComplete, vocabPool]);

  // Advance to next word immediately (no waiting for AI)
  const advanceToNext = useCallback(() => {
    setFlashLabel(null);
    setProgress(0);
    scoredRef.current = false;
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= vocabPool.length) {
        allAnsweredRef.current = true;
        if (pendingCountRef.current === 0) {
          fireOnComplete();
        }
        // else: fireOnComplete() will be called from the last .finally() below
      }
      return next;
    });
  }, [vocabPool.length, fireOnComplete]);

  // Fire-and-forget AI scoring
  const handleRecordingComplete = useCallback((base64: string) => {
    if (scoredRef.current || !currentItem) return;
    scoredRef.current = true;

    // Capture word/index before advancing (avoids stale closure in async)
    const capturedIndex = currentIndex;
    const capturedItem = currentItem;
    const timestamp = new Date().toISOString();

    // Brief "Recorded!" flash then advance immediately — no blocking
    setFlashLabel('Recorded!');
    const tid = setTimeout(advanceToNext, 400);
    setResultTimeoutId(tid);

    // Fire AI call in background
    pendingCountRef.current++;
    scoreVocabGuess(capturedItem.word, capturedItem.ipa, base64, true)
      .then(result => {
        result.vocabItemId = capturedItem.id;
        const pts = result.pointsEarned;
        const isCorrect = result.isCorrectWord;

        // Update mutable refs first (safe across async boundaries)
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
        const wordResult: WordResult = { item: capturedItem, pointsEarned: pts, isCorrect };
        wordResultsArrRef.current[capturedIndex] = wordResult;

        // Reactively update display state
        setTotalScore(totalScoreRef.current);
        setWordResults(prev => {
          const updated = [...prev];
          updated[capturedIndex] = wordResult;
          return updated;
        });
      })
      .catch(() => {
        // On error: mark as wrong, 0pt
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

  // Falling block animation
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
        // Timed out — mark as missed (0pt) and advance
        if (!scoredRef.current) {
          scoredRef.current = true;
          recorderRef.current?.stop?.();
          const capturedItem = vocabPool[currentIndex];

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
            if (next >= vocabPool.length) {
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
  }, [currentIndex, isFinished]);

  useEffect(() => () => { if (resultTimeoutId) clearTimeout(resultTimeoutId); }, [resultTimeoutId]);

  // All words answered but AI calls still resolving
  if (isFinished) {
    if (pendingCountRef.current > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500">Finalizing scores...</p>
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

  // Count how many AI results are still pending (for display)
  const pendingCount = wordResults.slice(0, currentIndex).filter(r => r === null).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Vocabulary</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentIndex + 1}/{vocabPool.length}</span>
          <span className="text-lg font-bold text-indigo-600">{totalScore.toFixed(1)} pts</span>
        </div>
      </div>

      {/* Results trail — gray pulsing pill = AI still pending for that word */}
      {currentIndex > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          {wordResults.slice(0, currentIndex).map((wr, i) => (
            wr === null ? (
              <div
                key={i}
                className="rounded-full px-2 py-0.5 bg-slate-200 animate-pulse text-[10px] text-slate-400 font-medium"
              >
                …
              </div>
            ) : (
              <div
                key={i}
                title={`${wr.item.word}: ${wr.isCorrect ? `+${wr.pointsEarned.toFixed(1)}pt` : '0pt'}`}
                className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                  wr.isCorrect ? 'bg-green-500' : 'bg-red-400'
                }`}
              >
                {wr.isCorrect
                  ? <CheckCircle className="w-3 h-3" />
                  : <XCircle className="w-3 h-3" />
                }
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

      {/* Progress bar (time-based) */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Flash label after recording */}
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
        {/* Falling block */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[85%]"
          style={{ top: `${translateY}px` }}
        >
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

      {/* Mic — always ready, key resets AudioRecorder for each word */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Mic className="w-3.5 h-3.5" /> Say the word before the block disappears
        </p>
        <AudioRecorder
          key={currentIndex}
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={false}
          maxDuration={21}
        />
      </div>
    </div>
  );
}
