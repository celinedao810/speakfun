"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Mic } from 'lucide-react';
import { StructureExerciseItem, StructureScoringResult } from '@/lib/types';
import { scoreOwnSentence } from '@/lib/ai/aiClient';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';

interface Exercise2StructureProps {
  structures: StructureExerciseItem[];
  onComplete: (score: number, structureResults: StructureResult[]) => void;
}

export interface StructureResult {
  item: StructureExerciseItem;
  pointsEarned: number;
  isCorrect: boolean;
}

const FALL_DURATION_MS = 20000; // 20 seconds

export default function Exercise2Structure({ structures, onComplete }: Exercise2StructureProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isScoring, setIsScoring] = useState(false);
  // Small flash banner (not a blocking overlay)
  const [flashResult, setFlashResult] = useState<StructureScoringResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [structureResults, setStructureResults] = useState<StructureResult[]>([]);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const scoredRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeightPx, setFrameHeightPx] = useState(320);

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

  const currentStructure = structures[currentIndex];
  const isFinished = currentIndex >= structures.length;

  const advanceToNext = useCallback((newTotal: number, newResults: StructureResult[]) => {
    setFlashResult(null);
    setProgress(0);
    scoredRef.current = false;
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= structures.length) {
        onComplete(newTotal, newResults);
      }
      return next;
    });
  }, [structures.length, onComplete]);

  const handleRecordingComplete = useCallback(async (base64: string) => {
    if (scoredRef.current || !currentStructure) return;
    scoredRef.current = true;
    setIsScoring(true);

    try {
      const result = await scoreOwnSentence(currentStructure.pattern, base64, false);
      result.structureItemId = currentStructure.id;

      const pts = result.pointsEarned;
      const isCorrect = result.grammarCorrect ?? pts > 0;
      const newTotal = totalScore + pts;
      const sResult: StructureResult = { item: currentStructure, pointsEarned: pts, isCorrect };
      const newResults = [...structureResults, sResult];

      setTotalScore(newTotal);
      setStructureResults(newResults);
      setFlashResult(result);

      const tid = setTimeout(() => advanceToNext(newTotal, newResults), 1200);
      setResultTimeoutId(tid);
    } catch {
      const sResult: StructureResult = { item: currentStructure, pointsEarned: 0, isCorrect: false };
      const newResults = [...structureResults, sResult];
      setStructureResults(newResults);
      const tid = setTimeout(() => advanceToNext(totalScore, newResults), 800);
      setResultTimeoutId(tid);
    } finally {
      setIsScoring(false);
    }
  }, [currentStructure, totalScore, structureResults, advanceToNext]);

  // Falling block animation
  useEffect(() => {
    if (isFinished || !currentStructure) return;

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
          const sResult: StructureResult = { item: currentStructure, pointsEarned: 0, isCorrect: false };
          const newResults = [...structureResults, sResult];
          setStructureResults(newResults);
          setCurrentIndex(i => {
            const next = i + 1;
            if (next >= structures.length) {
              onComplete(totalScore, newResults);
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

  const isCorrectFlash = flashResult ? (flashResult.grammarCorrect ?? flashResult.pointsEarned > 0) : false;
  const blockHeight = 150;
  const maxTravel = Math.max(frameHeightPx - blockHeight, 0);
  const translateY = progress * maxTravel;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Sentence Structure</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentIndex + 1}/{structures.length}</span>
          <span className="text-lg font-bold text-primary">{totalScore.toFixed(1)} pts</span>
        </div>
      </div>

      {/* Results trail */}
      {structureResults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {structureResults.map((sr, i) => (
            <div
              key={i}
              title={`${sr.item.pattern}: ${sr.isCorrect ? `+${sr.pointsEarned.toFixed(1)}pt` : '0pt'}`}
              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                sr.isCorrect ? 'bg-green-500' : 'bg-red-400'
              }`}
            >
              {sr.isCorrect
                ? <CheckCircle className="w-3 h-3" />
                : <XCircle className="w-3 h-3" />
              }
              <span className="max-w-[72px] truncate">{sr.item.pattern.split(' ').slice(0, 3).join(' ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar (time-based) */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Flash result banner */}
      {flashResult && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white ${
          isCorrectFlash ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {isCorrectFlash
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          <span className="truncate flex-1 text-xs">{flashResult.transcription ? `"${flashResult.transcription}"` : currentStructure.pattern}</span>
          <span className="ml-auto text-xs shrink-0">
            {isCorrectFlash ? `+${flashResult.pointsEarned.toFixed(1)}pt` : '0pt'}
          </span>
        </div>
      )}

      {/* Scoring banner */}
      {isScoring && !flashResult && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-violet-300 bg-violet-900/60">
          <span className="animate-pulse">Analyzing...</span>
        </div>
      )}

      {/* Game frame */}
      <div
        ref={frameRef}
        className="relative bg-gradient-to-b from-violet-950 to-slate-900 rounded-2xl overflow-hidden border border-violet-800 h-[clamp(220px,44vh,340px)]"
      >
        {/* Falling block */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[88%]"
          style={{ top: `${translateY}px` }}
        >
          <div className="bg-violet-700/90 backdrop-blur rounded-2xl px-5 py-4 border border-violet-400/40 shadow-lg">
            <p className="font-mono text-sm font-bold text-white text-center mb-1">
              {currentStructure.pattern}
            </p>
            <p className="text-xs text-violet-200 text-center mb-2 leading-relaxed">
              {currentStructure.explanation}
            </p>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-violet-100 italic">"{currentStructure.exampleSentence}"</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mic — always visible, key resets AudioRecorder each new structure */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Mic className="w-3.5 h-3.5" /> Make your own sentence using this structure
        </p>
        <AudioRecorder
          key={currentIndex}
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={isScoring}
          maxDuration={21}
        />
      </div>
    </div>
  );
}
