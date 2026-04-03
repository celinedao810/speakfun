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
  const [progress, setProgress] = useState(0); // 0 → 1 over FALL_DURATION_MS
  const [isScoring, setIsScoring] = useState(false);
  const [currentResult, setCurrentResult] = useState<VocabScoringResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [wrongVocabIds, setWrongVocabIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<VocabAttemptAudit[]>([]);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const scoredRef = useRef(false); // prevent double-scoring on the same word

  const currentItem = vocabPool[currentIndex];
  const isFinished = currentIndex >= vocabPool.length;

  // Advance to next word (or finish)
  const advanceToNext = useCallback((score: number, wrong: string[], att: VocabAttemptAudit[], result: WordResult, newTotal: number, newWrong: string[], newAttempts: VocabAttemptAudit[], newWordResults: WordResult[]) => {
    setCurrentResult(null);
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

  // Score current recording
  const handleRecordingComplete = useCallback(async (base64: string) => {
    if (scoredRef.current || !currentItem) return;
    scoredRef.current = true;
    setIsScoring(true);

    // Pause the fall animation while scoring
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

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
      setCurrentResult(result);

      // Auto-advance after 2 seconds
      const tid = setTimeout(() => {
        advanceToNext(pts, newWrong, newAttempts, wordResult, newTotal, newWrong, newAttempts, newWordResults);
      }, 2000);
      setResultTimeoutId(tid);
    } catch {
      // On error, treat as wrong and advance
      const newWrong = wrongVocabIds.includes(currentItem.id) ? wrongVocabIds : [...wrongVocabIds, currentItem.id];
      const wordResult: WordResult = { item: currentItem, pointsEarned: 0, isCorrect: false };
      const newWordResults = [...wordResults, wordResult];
      setWrongVocabIds(newWrong);
      setWordResults(newWordResults);
      const tid = setTimeout(() => {
        advanceToNext(0, newWrong, attempts, wordResult, totalScore, newWrong, attempts, newWordResults);
      }, 1000);
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
        // Block reached bottom — if not yet scored, count as wrong and advance
        if (!scoredRef.current) {
          scoredRef.current = true;
          recorderRef.current?.stop?.(); // auto-stop if recording was started
          const newWrong = wrongVocabIds.includes(currentItem.id) ? wrongVocabIds : [...wrongVocabIds, currentItem.id];
          const wordResult: WordResult = { item: currentItem, pointsEarned: 0, isCorrect: false };
          const newWordResults = [...wordResults, wordResult];
          setWrongVocabIds(newWrong);
          setWordResults(newWordResults);
          // Advance immediately (no result to show)
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

  // Cleanup result timeout on unmount
  useEffect(() => () => { if (resultTimeoutId) clearTimeout(resultTimeoutId); }, [resultTimeoutId]);

  if (isFinished) return null;

  const wordType = parseWordType(currentItem.clue);
  // Mask: first letter visible, rest as underscores
  const maskedWord = currentItem.word[0].toUpperCase() + ' ' + Array(currentItem.word.length - 1).fill('_').join(' ');
  // Vertical travel: block starts off-screen top, travels to bottom
  const frameHeight = 340; // px — approximate frame height
  const blockHeight = 120; // px — approximate block height
  const maxTravel = frameHeight - blockHeight;
  const translateY = progress * maxTravel;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Vocabulary</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentIndex + 1}/{vocabPool.length}</span>
          <span className="text-lg font-bold text-indigo-600">{totalScore.toFixed(1)} pts</span>
        </div>
      </div>

      {/* Progress bar (time-based) */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Game frame */}
      <div
        className="relative bg-gradient-to-b from-indigo-950 to-slate-900 rounded-2xl overflow-hidden border border-indigo-800"
        style={{ height: `${frameHeight}px` }}
      >
        {/* Falling block */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[85%]"
          style={{ top: `${translateY}px` }}
        >
          <div className="bg-indigo-700/90 backdrop-blur rounded-2xl px-5 py-4 border border-indigo-400/40 shadow-lg">
            {/* Masked word */}
            <p className="font-mono text-xl font-bold text-white tracking-widest text-center mb-1">
              {maskedWord}
            </p>
            {/* Word type */}
            {wordType && (
              <p className="text-xs text-indigo-300 text-center uppercase tracking-wide mb-2">{wordType}</p>
            )}
            {/* Definition */}
            <p className="text-sm text-indigo-100 text-center leading-relaxed">
              {currentItem.clue.replace(/^(noun|verb|adjective|adverb|phrase|idiom|expression)[:\s]*/i, '').trim()}
            </p>
          </div>
        </div>

        {/* Result overlay */}
        {currentResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
            <div className={`rounded-2xl px-6 py-5 text-center shadow-xl w-[80%] ${
              currentResult.isCorrectWord ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {currentResult.isCorrectWord ? (
                <CheckCircle className="w-8 h-8 text-white mx-auto mb-2" />
              ) : (
                <XCircle className="w-8 h-8 text-white mx-auto mb-2" />
              )}
              <p className="text-white font-bold text-lg">{currentItem.word}</p>
              <p className="text-white/80 text-xs mt-1">/{currentItem.ipa}/</p>
              <p className="text-white/90 text-sm font-semibold mt-2">
                {currentResult.isCorrectWord ? `+${currentResult.pointsEarned.toFixed(1)} pt` : '0 pt'}
              </p>
              {currentResult.feedback && (
                <p className="text-white/70 text-xs mt-1">{currentResult.feedback}</p>
              )}
            </div>
          </div>
        )}

        {/* Scoring indicator */}
        {isScoring && !currentResult && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/50 rounded-full px-4 py-2">
              <p className="text-white text-xs animate-pulse">Analyzing...</p>
            </div>
          </div>
        )}
      </div>

      {/* Mic at bottom */}
      {!currentResult && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Mic className="w-3.5 h-3.5" /> Say the word before the block disappears
          </p>
          <AudioRecorder
            ref={recorderRef}
            onRecordingComplete={handleRecordingComplete}
            isProcessing={isScoring}
            maxDuration={11}
          />
        </div>
      )}
    </div>
  );
}
