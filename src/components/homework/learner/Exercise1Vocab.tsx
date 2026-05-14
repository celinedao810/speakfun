"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { VocabAttemptAudit, VocabExerciseItem } from '@/lib/types';
import { scoreVocabGuessMulti } from '@/lib/ai/aiClient';
import AudioRecorder from '@/components/AudioRecorder';

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

interface FallingBlock {
  uid: string;
  vocabItem: VocabExerciseItem;
  xPercent: number;   // left % position in frame
  launchTime: number; // performance.now() value when block starts falling
  progress: number;   // 0–1; 0 while launchTime not yet reached
  matched: boolean;   // set true when user answers correctly
}

function parseWordType(clue: string): string {
  const m = clue.match(/^(noun|verb|adjective|adverb|phrase|idiom|expression)/i);
  return m ? m[1].toLowerCase() : '';
}

const LAUNCH_WINDOW_MS = 45_000;
const X_SLOTS = [4, 36, 68] as const;  // % left for left / center / right
const SLOT_JITTER = 2;                  // ±2% random offset per block

export default function Exercise1Vocab({ vocabPool, onComplete }: Exercise1VocabProps) {
  const N = vocabPool.length;
  const launchInterval = N > 1 ? LAUNCH_WINDOW_MS / N : LAUNCH_WINDOW_MS;
  // 0.5× speed = 2× fall time; clamped so blocks are never faster than 16s or slower than 50s
  const FALL_DURATION_MS = Math.min(Math.max(launchInterval * 3, 8_000), 25_000) * 2;

  // ── Render state ──────────────────────────────────────────────────────────
  const [activeBlocks, setActiveBlocks] = useState<FallingBlock[]>([]);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [completedResults, setCompletedResults] = useState<WordResult[]>([]);
  const [matchFlash, setMatchFlash] = useState<{ word: string; pts: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recorderKey, setRecorderKey] = useState(0);

  // ── Mutable refs (safe in async .then()) ──────────────────────────────────
  const blocksRef = useRef<FallingBlock[]>([]);
  const sessionStartRef = useRef<number>(0);
  const pendingCountRef = useRef(0);
  const totalScoreRef = useRef(0);
  const attemptsRef = useRef<VocabAttemptAudit[]>([]);
  const wrongVocabIdsRef = useRef<string[]>([]);
  const completedResultsRef = useRef<WordResult[]>([]);
  const sessionDoneRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeightPx, setFrameHeightPx] = useState(280);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

  const fireOnComplete = useCallback(() => {
    // Any blocks still in blocksRef that weren't matched → wrong
    blocksRef.current.forEach(b => {
      if (!b.matched && !wrongVocabIdsRef.current.includes(b.vocabItem.id)) {
        wrongVocabIdsRef.current = [...wrongVocabIdsRef.current, b.vocabItem.id];
      }
    });
    onCompleteRef.current(
      totalScoreRef.current,
      wrongVocabIdsRef.current,
      attemptsRef.current,
      completedResultsRef.current,
    );
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const tick = useCallback((now: number) => {
    const sessionElapsed = now - sessionStartRef.current;
    const sessionProg = Math.min(sessionElapsed / LAUNCH_WINDOW_MS, 1);
    setSessionProgress(sessionProg);

    let changed = false;
    const updatedBlocks: FallingBlock[] = [];

    for (const block of blocksRef.current) {
      if (block.matched) continue; // already removed from render

      const effective = now - block.launchTime;
      const newProgress = effective < 0 ? 0 : Math.min(effective / FALL_DURATION_MS, 1);

      if (newProgress !== block.progress) {
        block.progress = newProgress;
        changed = true;
      }

      if (block.progress >= 1) {
        // Block fell off without being matched
        if (!wrongVocabIdsRef.current.includes(block.vocabItem.id)) {
          wrongVocabIdsRef.current = [...wrongVocabIdsRef.current, block.vocabItem.id];
        }
        changed = true;
        // Don't push to updatedBlocks → removed from render
      } else {
        updatedBlocks.push(block);
      }
    }

    // Remove resolved blocks from ref too
    blocksRef.current = blocksRef.current.filter(b => b.matched || b.progress < 1);

    if (changed) setActiveBlocks([...updatedBlocks]);

    const allResolved = blocksRef.current.length === 0;
    if (allResolved && pendingCountRef.current === 0) {
      sessionDoneRef.current = true;
      fireOnComplete();
      return;
    }

    animFrameRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FALL_DURATION_MS, fireOnComplete]);

  // ── Mount: schedule all blocks and start loop ─────────────────────────────
  useEffect(() => {
    const now = performance.now();
    sessionStartRef.current = now;

    blocksRef.current = vocabPool.map((item, i) => {
      const slotBase = X_SLOTS[i % 3];
      const jitter = (Math.random() * 2 - 1) * SLOT_JITTER;
      return {
        uid: `${item.id}-${i}`,
        vocabItem: item,
        xPercent: slotBase + jitter,
        launchTime: now + i * launchInterval,
        progress: 0,
        matched: false,
      };
    });

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recording handler ─────────────────────────────────────────────────────
  const handleRecordingComplete = useCallback((base64: string) => {
    const visibleNow = blocksRef.current.filter(b => !b.matched && b.progress > 0 && b.progress < 1);
    if (visibleNow.length === 0) return;

    const candidates = visibleNow.map(b => ({ uid: b.uid, word: b.vocabItem.word, ipa: b.vocabItem.ipa }));
    const timestamp = new Date().toISOString();

    // Reset recorder immediately so user can record again while AI is working
    setRecorderKey(k => k + 1);

    pendingCountRef.current++;
    setPendingCount(c => c + 1);

    scoreVocabGuessMulti(candidates, base64, true)
      .then(({ matchedUid, result }) => {
        if (!matchedUid || !result) return;

        const matched = blocksRef.current.find(b => b.uid === matchedUid && !b.matched && b.progress < 1);
        if (!matched) return; // block already fell off while AI was scoring

        matched.matched = true; // mark resolved
        blocksRef.current = blocksRef.current.filter(b => b.uid !== matchedUid || b.matched);
        setActiveBlocks(prev => prev.filter(b => b.uid !== matchedUid));

        totalScoreRef.current += result.pointsEarned;
        setTotalScore(totalScoreRef.current);

        const wr: WordResult = {
          item: matched.vocabItem,
          pointsEarned: result.pointsEarned,
          isCorrect: true,
          recognizedWord: result.recognizedWord,
        };
        completedResultsRef.current = [...completedResultsRef.current, wr];
        setCompletedResults([...completedResultsRef.current]);

        const audit: VocabAttemptAudit = {
          vocabItemId: matched.vocabItem.id,
          lessonId: matched.vocabItem.lessonId,
          targetWord: matched.vocabItem.word,
          recognizedWord: result.recognizedWord || '',
          isCorrectWord: true,
          pronunciationScore: result.pronunciationScore,
          pointsEarned: result.pointsEarned,
          feedback: result.feedback,
          timedMode: true,
          timeTakenMs: 0,
          timedOut: false,
          attemptTimestamp: timestamp,
        };
        attemptsRef.current = [...attemptsRef.current, audit];

        setMatchFlash({ word: matched.vocabItem.word, pts: result.pointsEarned });
        setTimeout(() => setMatchFlash(null), 1400);
      })
      .finally(() => {
        pendingCountRef.current--;
        setPendingCount(c => c - 1);
        if (sessionDoneRef.current && pendingCountRef.current === 0) {
          fireOnComplete();
        }
      });
  }, [fireOnComplete]);

  // ── Render ────────────────────────────────────────────────────────────────
  const blockCardWidth = 28; // % of frame width
  const blockHeight = 100;
  const maxTravel = Math.max(frameHeightPx - blockHeight, 0);
  const now = performance.now();

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Vocabulary</span>
        <span className="text-lg font-bold text-indigo-600">{totalScore.toFixed(1)} pts</span>
      </div>

      {/* Session progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-none"
          style={{ width: `${(1 - sessionProgress) * 100}%` }}
        />
      </div>

      {/* Game frame */}
      <div
        ref={frameRef}
        className="relative bg-gradient-to-b from-indigo-950 to-slate-900 rounded-2xl overflow-hidden border border-indigo-800 h-[clamp(220px,42vh,340px)]"
      >
        {/* Match flash overlay */}
        {matchFlash && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-bounce">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {matchFlash.word} +{matchFlash.pts.toFixed(1)}pt
          </div>
        )}

        {/* Falling blocks */}
        {activeBlocks
          .filter(b => !b.matched && now >= b.launchTime)
          .map(b => {
            const wordType = parseWordType(b.vocabItem.clue);
            const maskedWord = b.vocabItem.word[0].toUpperCase() + ' ' + Array(b.vocabItem.word.length - 1).fill('_').join(' ');
            const definition = b.vocabItem.clue.replace(/^(noun|verb|adjective|adverb|phrase|idiom|expression)[:\s]*/i, '').trim();

            return (
              <div
                key={b.uid}
                className="absolute"
                style={{
                  left: `${b.xPercent}%`,
                  width: `${blockCardWidth}%`,
                  top: `${b.progress * maxTravel}px`,
                }}
              >
                <div className="bg-indigo-700/90 backdrop-blur rounded-xl px-2.5 py-2.5 border border-indigo-400/40 shadow-lg">
                  <p className="font-mono text-sm font-bold text-white tracking-wider text-center mb-0.5 leading-tight">
                    {maskedWord}
                  </p>
                  {wordType && (
                    <p className="text-[9px] text-indigo-300 text-center uppercase tracking-wide mb-1">{wordType}</p>
                  )}
                  <p className="text-[10px] text-indigo-100 text-center leading-tight line-clamp-3">
                    {definition}
                  </p>
                </div>
              </div>
            );
          })}
      </div>

      {/* Completed chips */}
      {completedResults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {completedResults.map((wr, i) => (
            <div
              key={i}
              title={`+${wr.pointsEarned.toFixed(1)}pt`}
              className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white bg-green-500"
            >
              <CheckCircle className="w-3 h-3 shrink-0" />
              <span className="max-w-[60px] truncate">{wr.item.word}</span>
            </div>
          ))}
          {pendingCountRef.current > 0 && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> scoring
            </span>
          )}
        </div>
      )}

      {/* Mic */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 min-h-[20px]">
          <p className="text-xs text-slate-500">Say any word you see above</p>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking {pendingCount > 1 ? `${pendingCount} answers` : 'answer'}…
            </span>
          )}
        </div>
        <AudioRecorder
          key={recorderKey}
          onRecordingComplete={handleRecordingComplete}
          isProcessing={false}
          maxDuration={10}
        />
      </div>
    </div>
  );
}
