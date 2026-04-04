"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Mic } from 'lucide-react';
import { VocabAttemptAudit, VocabExerciseItem, VocabScoringResult } from '@/lib/types';
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

const FALL_DURATION_MS = 10000; // 10 seconds

export default function Exercise1Vocab({ vocabPool, onComplete }: Exercise1VocabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isScoring, setIsScoring] = useState(false);
  // Small flash banner (not a blocking overlay)
  const [flashResult, setFlashResult] = useState<VocabScoringResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [wrongVocabIds, setWrongVocabIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<VocabAttemptAudit[]>([]);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

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

  const advanceToNext = useCallback((newTotal: number, newWrong: string[], newAttempts: VocabAttemptAudit[], newWordResults: WordResult[]) => {
    setFlashResult(null);
    setProgress(0);
    scoredRef.current = false;
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= vocabPool.length) {
        onComplete(newTotal, newWrong, newAttempts, newWordResults);
      }
      return next;
    });
  }, [vocabPool.length, onComplete]);

  const handleRecordingComplete = useCallback(async (base64: string) => {
    if (scoredRef.current || !currentItem) return;
    scoredRef.current = true;
    setIsScoring(true);

    const timestamp = new Date().toISOString();
    try {
      const result = await scoreVocabGuess(currentItem.word, currentItem.ipa, base64, true);
      result.vocabItemId = currentItem.id;

      const pts = result.pointsEarned;
      const isCorrect = result.isCorrectWord;
      const newTotal = totalScore + pts;
      const newWrong = isCorrect ? wrongVocabIds : (wrongVocabIds.includes(currentItem.id) ? wrongVocabIds : [...wrongVocabIds, currentItem.id]);
      const audit: VocabAttemptAudit = {
        vocabItemId: currentItem.id,
        lessonId: currentItem.lessonId,
        targetWord: currentItem.word,
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
      const wordResult: WordResult = { item: currentItem, pointsEarned: pts, isCorrect };
      const newAttempts = [...attempts, audit];
      const newWordResults = [...wordResults, wordResult];

      setTotalScore(newTotal);
      setWrongVocabIds(newWrong);
      setAttempts(newAttempts);
      setWordResults(newWordResults);
      setFlashResult(result);

      // Advance after brief flash
      const tid = setTimeout(() => {
        advanceToNext(newTotal, newWrong, newAttempts, newWordResults);
      }, 1200);
      setResultTimeoutId(tid);
    } catch {
      const newWrong = wrongVocabIds.includes(currentItem.id) ? wrongVocabIds : [...wrongVocabIds, currentItem.id];
      const wordResult: WordResult = { item: currentItem, pointsEarned: 0, isCorrect: false };
      const newWordResults = [...wordResults, wordResult];
      setWrongVocabIds(newWrong);
      setWordResults(newWordResults);
      const tid = setTimeout(() => {
        advanceToNext(totalScore, newWrong, attempts, newWordResults);
      }, 800);
      setResultTimeoutId(tid);
    } finally {
      setIsScoring(false);
    }
  }, [currentItem, totalScore, wrongVocabIds, attempts, wordResults, advanceToNext]);

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
        if (!scoredRef.current) {
          scoredRef.current = true;
          recorderRef.current?.stop?.();
          const newWrong = wrongVocabIds.includes(currentItem.id) ? wrongVocabIds : [...wrongVocabIds, currentItem.id];
          const wordResult: WordResult = { item: currentItem, pointsEarned: 0, isCorrect: false };
          const newWordResults = [...wordResults, wordResult];
          setWrongVocabIds(newWrong);
          setWordResults(newWordResults);
          setCurrentIndex(i => {
            const next = i + 1;
            if (next >= vocabPool.length) {
              onComplete(totalScore, newWrong, attempts, newWordResults);
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

  if (isFinished) return null;

  const wordType = parseWordType(currentItem.clue);
  const maskedWord = currentItem.word[0].toUpperCase() + ' ' + Array(currentItem.word.length - 1).fill('_').join(' ');
  const blockHeight = 120;
  const maxTravel = Math.max(frameHeightPx - blockHeight, 0);
  const translateY = progress * maxTravel;

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

      {/* Results trail */}
      {wordResults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {wordResults.map((wr, i) => (
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
          ))}
        </div>
      )}

      {/* Progress bar (time-based) */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Flash result banner (non-blocking, sits above frame) */}
      {flashResult && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white ${
          flashResult.isCorrectWord ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {flashResult.isCorrectWord
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          <span className="font-bold">{currentItem.word}</span>
          <span className="text-white/80 text-xs">/{currentItem.ipa}/</span>
          <span className="ml-auto text-xs">
            {flashResult.isCorrectWord ? `+${flashResult.pointsEarned.toFixed(1)}pt` : '0pt'}
          </span>
        </div>
      )}

      {/* Scoring banner */}
      {isScoring && !flashResult && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-indigo-300 bg-indigo-900/60">
          <span className="animate-pulse">Analyzing...</span>
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

      {/* Mic — always visible, key resets AudioRecorder each new word */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Mic className="w-3.5 h-3.5" /> Say the word before the block disappears
        </p>
        <AudioRecorder
          key={currentIndex}
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={isScoring}
          maxDuration={11}
        />
      </div>
    </div>
  );
}
