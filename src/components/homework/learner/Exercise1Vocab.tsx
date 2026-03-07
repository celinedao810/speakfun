"use client";

import { useState, useRef, useCallback } from 'react';
import { BookOpen, Timer, CheckCircle, XCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { VocabAttemptAudit, VocabExerciseItem, VocabScoringResult } from '@/lib/types';
import { scoreVocabGuess } from '@/lib/ai/aiClient';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';

interface Exercise1VocabProps {
  vocabPool: VocabExerciseItem[];  // Pre-shuffled, wrong words first
  timedMode: boolean;
  onComplete: (score: number, wrongVocabIds: string[], attempts: VocabAttemptAudit[]) => void;
}

type WordState = 'PROMPT' | 'RECORDING' | 'RESULT' | 'WRONG_REPEAT';

interface WordAttempt {
  item: VocabExerciseItem;
  result: VocabScoringResult | null;
  timedOut: boolean;
  timeTakenMs: number;
  timestamp: string;
}

export default function Exercise1Vocab({ vocabPool, timedMode, onComplete }: Exercise1VocabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [wordState, setWordState] = useState<WordState>('PROMPT');
  const [currentResult, setCurrentResult] = useState<VocabScoringResult | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [attempts, setAttempts] = useState<WordAttempt[]>([]);
  const [wrongThisSession, setWrongThisSession] = useState<string[]>([]);
  const [allItems, setAllItems] = useState(vocabPool);  // May grow with wrong repeats
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const timerStartMsRef = useRef(0);

  const currentItem = allItems[currentIndex];
  const totalItems = allItems.length;
  const isLastItem = currentIndex === totalItems - 1;

  const handleRecordingComplete = useCallback(async (base64: string) => {
    setWordState('RECORDING');
    setIsScoring(true);
    setRecordingUrl(`data:audio/webm;base64,${base64}`);
    if (timerRef.current) clearTimeout(timerRef.current);

    const timeTakenMs = timedMode ? Date.now() - timerStartMsRef.current : 0;
    const timedOut = timedMode && timeTakenMs > 5000;

    try {
      const result = await scoreVocabGuess(
        currentItem.word,
        currentItem.ipa,
        base64,
        timedMode && !timedOut
      );
      result.vocabItemId = currentItem.id;

      const pointsEarned = timedOut ? 0 : result.pointsEarned;
      setCurrentResult({ ...result, pointsEarned });
      setTotalScore(s => s + pointsEarned);

      const isCorrect = result.isCorrectWord && !timedOut;
      const newAttempt: WordAttempt = {
        item: currentItem,
        result: { ...result, pointsEarned },
        timedOut,
        timeTakenMs,
        timestamp: new Date().toISOString(),
      };
      setAttempts(prev => [...prev, newAttempt]);

      if (!isCorrect) {
        setWrongThisSession(prev => prev.includes(currentItem.id) ? prev : [...prev, currentItem.id]);
      }

      setWordState('RESULT');
    } catch {
      setIsScoring(false);
      setWordState('PROMPT');
    } finally {
      setIsScoring(false);
    }
  }, [currentItem, timedMode]);

  const handleTimedOut = useCallback(() => {
    // Auto-stop recording if timer expires
    recorderRef.current?.stop?.();
  }, []);

  const handleStartRecording = useCallback(() => {
    timerStartMsRef.current = Date.now();
    if (timedMode) {
      timerRef.current = setTimeout(handleTimedOut, 5000);
    }
  }, [timedMode, handleTimedOut]);

  const handleRecordingStateChange = useCallback((recording: boolean) => {
    if (recording) handleStartRecording();
  }, [handleStartRecording]);

  const handleNext = () => {
    if (isLastItem) {
      // Build final wrong vocab IDs (words with any wrong attempt this session, carried to next day)
      const wrongVocabIds = wrongThisSession;
      const allAttempts: VocabAttemptAudit[] = attempts.map(a => ({
        vocabItemId: a.item.id,
        lessonId: a.item.lessonId,
        targetWord: a.item.word,
        recognizedWord: a.result?.recognizedWord || '',
        isCorrectWord: a.result?.isCorrectWord || false,
        pronunciationScore: a.result?.pronunciationScore || 0,
        pointsEarned: a.result?.pointsEarned || 0,
        feedback: a.result?.feedback || '',
        timedMode,
        timeTakenMs: a.timeTakenMs,
        timedOut: a.timedOut,
        attemptTimestamp: a.timestamp,
      }));
      onComplete(totalScore, wrongVocabIds, allAttempts);
      return;
    }

    // If this was wrong, add a repeat at end if not already queued
    if (currentResult && !currentResult.isCorrectWord) {
      const alreadyQueued = allItems.slice(currentIndex + 1).some(i => i.id === currentItem.id);
      if (!alreadyQueued) {
        setAllItems(prev => [...prev, currentItem]);
      }
    }

    setCurrentResult(null);
    setRecordingUrl(null);
    setWordState('PROMPT');
    setCurrentIndex(i => i + 1);
  };

  if (!currentItem) return null;

  const progressPct = Math.round((currentIndex / totalItems) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-100 p-1.5 rounded-lg">
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">Vocabulary Guessing</span>
        </div>
        <div className="flex items-center gap-2">
          {timedMode && (
            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <Timer className="w-3.5 h-3.5" />
              Timed (5s)
            </div>
          )}
          <span className="text-xs text-slate-400">{currentIndex + 1}/{totalItems}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Score display */}
      <div className="text-center">
        <span className="text-2xl font-bold text-indigo-600">{totalScore.toFixed(1)}</span>
        <span className="text-slate-400 text-sm ml-1">pts</span>
      </div>

      {/* Word card */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 text-center border border-indigo-100">
        {wordState === 'RESULT' && currentResult ? (
          <>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold mb-3 ${
              currentResult.isCorrectWord ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>
              {currentResult.isCorrectWord ? (
                <><CheckCircle className="w-4 h-4" /> Correct! +{currentResult.pointsEarned.toFixed(1)}pt</>
              ) : (
                <><XCircle className="w-4 h-4" /> Incorrect — 0pt</>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 mb-1">{currentItem.word}</p>
            <p className="text-slate-500 text-sm mb-1">/{currentItem.ipa}/</p>
            {currentResult.recognizedWord && currentResult.recognizedWord !== currentItem.word && (
              <p className="text-xs text-slate-400">You said: "{currentResult.recognizedWord}"</p>
            )}
            {currentResult.feedback && (
              <p className="text-xs text-slate-500 mt-2 bg-white/60 rounded-lg px-3 py-2">
                {currentResult.feedback}
              </p>
            )}
            {/* TTS to hear correct pronunciation */}
            <div className="mt-3 flex justify-center">
              <AudioPlayer text={currentItem.word} label="Play pronunciation" />
            </div>
            {/* Playback of learner's own recording */}
            {recordingUrl && (
              <div className="mt-3 text-left">
                <p className="text-xs text-slate-400 mb-1">Your recording:</p>
                <audio controls src={recordingUrl} className="w-full h-9 rounded-lg" />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="font-mono text-lg font-semibold text-indigo-600 tracking-widest mb-3">
              {currentItem.word[0].toUpperCase()}{Array(currentItem.word.length - 1).fill('_').join(' ')}
            </p>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Clue</p>
            <p className="text-base text-slate-700 leading-relaxed">{currentItem.clue.replace(/\s*Starts with:\s*\w+\.\.\./gi, '')}</p>
            <p className="text-xs text-slate-400 mt-3">Example: "{currentItem.exampleSentence.replace(new RegExp(currentItem.word, 'gi'), '___')}"</p>
          </>
        )}
      </div>

      {/* Recording / Next action */}
      {wordState !== 'RESULT' ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-slate-500">Say the word aloud</p>
          <AudioRecorder
            ref={recorderRef}
            onRecordingComplete={handleRecordingComplete}
            isProcessing={isScoring}
            maxDuration={timedMode ? 6 : undefined}
            onRecordingStateChange={handleRecordingStateChange}
          />
        </div>
      ) : (
        <button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition"
        >
          {isLastItem ? (
            <><CheckCircle className="w-4 h-4" /> Finish Vocabulary</>
          ) : currentResult?.isCorrectWord ? (
            <><ChevronRight className="w-4 h-4" /> Next Word</>
          ) : (
            <><RotateCcw className="w-4 h-4" /> Try Again Later</>
          )}
        </button>
      )}
    </div>
  );
}
