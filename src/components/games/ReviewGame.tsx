"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, MessageCircle, Loader2, RefreshCw, Play, Square, SkipForward } from 'lucide-react';

const DURATIONS = [20, 30, 45, 60] as const;
type Duration = typeof DURATIONS[number];

interface ReviewGameProps {
  vocabPool: string[];
  structurePool: string[];
  loading: boolean;
}

export default function ReviewGame({ vocabPool, structurePool, loading }: ReviewGameProps) {
  const [mode, setMode] = useState<'vocab' | 'structure'>('vocab');
  const [currentCard, setCurrentCard] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const usedIndicesRef = useRef<Set<number>>(new Set());

  const [selectedDuration, setSelectedDuration] = useState<Duration>(20);
  const [timerSeconds, setTimerSeconds] = useState<number>(20);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  const activePool = mode === 'vocab' ? vocabPool : structurePool;

  // Reset everything when mode changes
  useEffect(() => {
    setCurrentCard(null);
    setCurrentIndex(-1);
    usedIndicesRef.current = new Set();
    setTimerSeconds(selectedDuration);
    setTimerRunning(false);
    setTimerDone(false);
  }, [mode, selectedDuration]);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning) return;
    if (timerSeconds <= 0) {
      setTimerRunning(false);
      setTimerDone(true);
      return;
    }
    const id = setTimeout(() => setTimerSeconds(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [timerRunning, timerSeconds]);

  const pickRandom = useCallback(() => {
    if (activePool.length === 0) return;
    // Cycle reset when all items have been shown
    if (usedIndicesRef.current.size >= activePool.length) {
      usedIndicesRef.current = new Set();
    }
    let idx: number;
    do {
      idx = Math.floor(Math.random() * activePool.length);
    } while (usedIndicesRef.current.has(idx) || (activePool.length > 1 && idx === currentIndex));
    usedIndicesRef.current.add(idx);
    setCurrentIndex(idx);
    setCurrentCard(activePool[idx]);
    setTimerSeconds(selectedDuration);
    setTimerRunning(false);
    setTimerDone(false);
  }, [activePool, currentIndex, selectedDuration]);

  const handleDurationChange = (d: Duration) => {
    setSelectedDuration(d);
    setTimerSeconds(d);
    setTimerRunning(false);
    setTimerDone(false);
  };

  const handleStart = () => {
    if (timerDone) return;
    setTimerRunning(true);
  };

  const handleReset = () => {
    setTimerRunning(false);
    setTimerSeconds(selectedDuration);
    setTimerDone(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Mode selector */}
      <div className="flex border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setMode('vocab')}
          className={`flex items-center gap-1.5 flex-1 justify-center py-2.5 text-sm font-semibold transition ${
            mode === 'vocab'
              ? 'text-primary bg-primary/10 border-r border-border'
              : 'text-muted-foreground hover:text-foreground border-r border-border'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Vocab
          <span className={`px-1.5 py-0.5 rounded-full text-xs ${mode === 'vocab' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {vocabPool.length}
          </span>
        </button>
        <button
          onClick={() => setMode('structure')}
          className={`flex items-center gap-1.5 flex-1 justify-center py-2.5 text-sm font-semibold transition ${
            mode === 'structure'
              ? 'text-violet-600 bg-violet-50 dark:bg-violet-950/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Structure
          <span className={`px-1.5 py-0.5 rounded-full text-xs ${mode === 'structure' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' : 'bg-muted text-muted-foreground'}`}>
            {structurePool.length}
          </span>
        </button>
      </div>

      {/* Card area */}
      <div className="bg-card border border-border rounded-xl min-h-[180px] flex items-center justify-center px-8 py-10">
        {activePool.length === 0 ? (
          <p className="text-sm text-muted-foreground/60 text-center">
            No {mode === 'vocab' ? 'words' : 'structures'} in the pool yet.
          </p>
        ) : currentCard === null ? (
          <p className="text-sm text-muted-foreground/50 text-center">
            Click Generate to draw a card
          </p>
        ) : (
          <p className={`font-bold text-center leading-snug break-words ${mode === 'vocab' ? 'text-3xl text-foreground' : 'text-2xl font-mono text-foreground'}`}>
            {currentCard}
          </p>
        )}
      </div>

      {/* Duration selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground/60 shrink-0">Timer:</span>
        <div className="flex gap-1.5">
          {DURATIONS.map(d => (
            <button
              key={d}
              onClick={() => handleDurationChange(d)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                selectedDuration === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      {/* Timer display + controls */}
      <div className="bg-card border border-border rounded-xl px-6 py-5 flex flex-col sm:flex-row items-center gap-4">
        <span className={`text-5xl font-mono font-semibold tabular-nums transition-colors ${timerDone ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
          {formatTime(timerSeconds)}
        </span>
        <div className="flex gap-2 sm:ml-auto">
          <button
            onClick={handleStart}
            disabled={timerRunning || timerDone}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-muted text-muted-foreground hover:text-foreground transition"
          >
            <Square className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Generate / Skip buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={pickRandom}
          disabled={activePool.length === 0}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Generate
        </button>
        {currentCard !== null && (
          <button
            onClick={pickRandom}
            disabled={activePool.length <= 1}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
