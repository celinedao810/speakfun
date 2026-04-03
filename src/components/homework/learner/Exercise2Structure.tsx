"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
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

const FALL_DURATION_MS = 10000; // 10 seconds

export default function Exercise2Structure({ structures, onComplete }: Exercise2StructureProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isScoring, setIsScoring] = useState(false);
  const [currentResult, setCurrentResult] = useState<StructureScoringResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [structureResults, setStructureResults] = useState<StructureResult[]>([]);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const scoredRef = useRef(false);

  const currentStructure = structures[currentIndex];
  const isFinished = currentIndex >= structures.length;

  const advanceToNext = useCallback((newTotal: number, newResults: StructureResult[]) => {
    setCurrentResult(null);
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

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

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
      setCurrentResult(result);

      const tid = setTimeout(() => advanceToNext(newTotal, newResults), 2000);
      setResultTimeoutId(tid);
    } catch {
      const sResult: StructureResult = { item: currentStructure, pointsEarned: 0, isCorrect: false };
      const newResults = [...structureResults, sResult];
      setStructureResults(newResults);
      const tid = setTimeout(() => advanceToNext(totalScore, newResults), 1000);
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

  const frameHeight = 380;
  const blockHeight = 150;
  const maxTravel = frameHeight - blockHeight;
  const translateY = progress * maxTravel;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Sentence Structure</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentIndex + 1}/{structures.length}</span>
          <span className="text-lg font-bold text-primary">{totalScore.toFixed(1)} pts</span>
        </div>
      </div>

      {/* Progress bar (time-based) */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Game frame */}
      <div
        className="relative bg-gradient-to-b from-violet-950 to-slate-900 rounded-2xl overflow-hidden border border-violet-800"
        style={{ height: `${frameHeight}px` }}
      >
        {/* Falling block */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[88%]"
          style={{ top: `${translateY}px` }}
        >
          <div className="bg-violet-700/90 backdrop-blur rounded-2xl px-5 py-4 border border-violet-400/40 shadow-lg">
            {/* Pattern */}
            <p className="font-mono text-sm font-bold text-white text-center mb-1">
              {currentStructure.pattern}
            </p>
            {/* Explanation / intent */}
            <p className="text-xs text-violet-200 text-center mb-2 leading-relaxed">
              {currentStructure.explanation}
            </p>
            {/* Example */}
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-violet-100 italic">"{currentStructure.exampleSentence}"</p>
            </div>
          </div>
        </div>

        {/* Result overlay */}
        {currentResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
            <div className={`rounded-2xl px-6 py-5 text-center shadow-xl w-[85%] ${
              (currentResult.grammarCorrect ?? currentResult.pointsEarned > 0) ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {(currentResult.grammarCorrect ?? currentResult.pointsEarned > 0) ? (
                <CheckCircle className="w-8 h-8 text-white mx-auto mb-2" />
              ) : (
                <XCircle className="w-8 h-8 text-white mx-auto mb-2" />
              )}
              <p className="text-white font-semibold text-sm">{currentStructure.pattern}</p>
              <p className="text-white/90 text-sm font-bold mt-1">+{currentResult.pointsEarned.toFixed(1)} pt</p>
              {currentResult.transcription && (
                <p className="text-white/70 text-xs mt-1 italic">"{currentResult.transcription}"</p>
              )}
              {currentResult.feedback && (
                <p className="text-white/80 text-xs mt-1">{currentResult.feedback}</p>
              )}
            </div>
          </div>
        )}

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
            <Mic className="w-3.5 h-3.5" /> Make your own sentence using this structure
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
