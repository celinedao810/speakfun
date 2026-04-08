"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Mic, Loader2 } from 'lucide-react';
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
  feedback?: string;
  transcription?: string;
  correctedSentence?: string;
}

const FALL_DURATION_MS = 25000; // 25 seconds

export default function Exercise2Structure({ structures, onComplete }: Exercise2StructureProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [structureResults, setStructureResults] = useState<(StructureResult | null)[]>(() => Array(structures.length).fill(null));
  const [totalScore, setTotalScore] = useState(0);
  // Brief flash label after recording (does NOT block next structure)
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [resultTimeoutId, setResultTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Mutable refs — safe to read inside async .then()/.catch() without stale closure
  const totalScoreRef = useRef(0);
  const structureResultsArrRef = useRef<(StructureResult | null)[]>(Array(structures.length).fill(null));
  const pendingCountRef = useRef(0);   // how many AI calls still in-flight
  const allAnsweredRef = useRef(false); // true once the last structure is passed

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

  // Helper: call onComplete with all accumulated data
  const fireOnComplete = useCallback(() => {
    onComplete(
      totalScoreRef.current,
      structureResultsArrRef.current.map((r, i) =>
        r ?? { item: structures[i], pointsEarned: 0, isCorrect: false }
      ),
    );
  }, [onComplete, structures]);

  // Advance to next structure immediately (no waiting for AI)
  const advanceToNext = useCallback(() => {
    setFlashLabel(null);
    setProgress(0);
    scoredRef.current = false;
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= structures.length) {
        allAnsweredRef.current = true;
        if (pendingCountRef.current === 0) {
          fireOnComplete();
        }
      }
      return next;
    });
  }, [structures.length, fireOnComplete]);

  // Fire-and-forget AI scoring
  const handleRecordingComplete = useCallback((base64: string) => {
    if (scoredRef.current || !currentStructure) return;
    scoredRef.current = true;

    // Capture before advancing (avoids stale closure in async)
    const capturedIndex = currentIndex;
    const capturedStructure = currentStructure;

    // Brief "Recorded!" flash then advance immediately — no blocking
    setFlashLabel('Recorded!');
    const tid = setTimeout(advanceToNext, 400);
    setResultTimeoutId(tid);

    // Fire AI call in background
    pendingCountRef.current++;
    scoreOwnSentence(capturedStructure.pattern, base64, false, capturedStructure.exampleSentence)
      .then((result: StructureScoringResult) => {
        result.structureItemId = capturedStructure.id;
        const pts = result.pointsEarned;
        const isCorrect = result.grammarCorrect ?? pts > 0;

        totalScoreRef.current += pts;
        const sResult: StructureResult = {
          item: capturedStructure,
          pointsEarned: pts,
          isCorrect,
          feedback: result.feedback,
          transcription: result.transcription,
          correctedSentence: result.correctedSentence,
        };
        structureResultsArrRef.current[capturedIndex] = sResult;

        setTotalScore(totalScoreRef.current);
        setStructureResults(prev => {
          const updated = [...prev];
          updated[capturedIndex] = sResult;
          return updated;
        });
      })
      .catch(() => {
        const sResult: StructureResult = { item: capturedStructure, pointsEarned: 0, isCorrect: false };
        structureResultsArrRef.current[capturedIndex] = sResult;
        setStructureResults(prev => {
          const updated = [...prev];
          updated[capturedIndex] = sResult;
          return updated;
        });
      })
      .finally(() => {
        pendingCountRef.current--;
        if (allAnsweredRef.current && pendingCountRef.current === 0) {
          fireOnComplete();
        }
      });
  }, [currentIndex, currentStructure, advanceToNext, fireOnComplete]);

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
        // Timed out — if user is actively recording, stop and let handleRecordingComplete score it;
        // only mark as missed if no recording was in progress
        if (!scoredRef.current) {
          if (recorderRef.current?.getIsActive()) {
            recorderRef.current.stop();
            return;
          }
          scoredRef.current = true;
          const capturedStructure = structures[currentIndex];

          const sResult: StructureResult = { item: capturedStructure, pointsEarned: 0, isCorrect: false };
          structureResultsArrRef.current[currentIndex] = sResult;
          setStructureResults(prev => {
            const updated = [...prev];
            updated[currentIndex] = sResult;
            return updated;
          });

          setCurrentIndex(i => {
            const next = i + 1;
            if (next >= structures.length) {
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

  // All structures answered but AI calls still resolving
  if (isFinished) {
    if (pendingCountRef.current > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-slate-500">Finalizing scores...</p>
        </div>
      );
    }
    return null;
  }

  const blockHeight = 150;
  const maxTravel = Math.max(frameHeightPx - blockHeight, 0);
  const translateY = progress * maxTravel;

  // Count how many AI results are still pending (for display)
  const pendingCount = structureResults.slice(0, currentIndex).filter(r => r === null).length;

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

      {/* Results trail — gray pulsing pill = AI still pending for that structure */}
      {currentIndex > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          {structureResults.slice(0, currentIndex).map((sr, i) => (
            sr === null ? (
              <div
                key={i}
                className="rounded-full px-2 py-0.5 bg-slate-200 animate-pulse text-[10px] text-slate-400 font-medium"
              >
                …
              </div>
            ) : (
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
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-none"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      {/* Flash label after recording */}
      {flashLabel && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white bg-primary">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {flashLabel}
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

      {/* Mic — always ready, key resets AudioRecorder for each structure */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Mic className="w-3.5 h-3.5" /> Make your own sentence using this structure
        </p>
        <AudioRecorder
          key={currentIndex}
          ref={recorderRef}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={false}
          maxDuration={26}
        />
      </div>
    </div>
  );
}
