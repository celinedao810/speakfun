"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, MessageCircle, Loader2, RefreshCw, Play, Square, SkipForward, Eye } from 'lucide-react';

const DURATIONS = [20, 30, 45, 60] as const;
type Duration = typeof DURATIONS[number];

export interface StructureCardItem {
  pattern: string;
  exampleSentence: string;
}

interface ReviewGameProps {
  vocabPool: string[];
  structurePool: StructureCardItem[];
  loading: boolean;
}

function extractHint(pattern: string): string {
  const STRUCTURAL = new Set([
    'subject', 'object', 'noun', 'pronoun', 'adjective',
    'adverb', 'auxiliary', 'aux', 'someone', 'something',
    'noun phrase', 'verb phrase',
  ]);
  return pattern
    .split(/\s*\+\s*/)
    .filter(p => !STRUCTURAL.has(p.trim().toLowerCase()))
    .join(' ')
    .replace(/\bV-ing\b/gi, 'doing')
    .replace(/\bV\b/g, 'do')
    .trim();
}

export default function ReviewGame({ vocabPool, structurePool, loading }: ReviewGameProps) {
  const [mode, setMode] = useState<'vocab' | 'structure'>('vocab');

  // Card state
  const [currentVocab, setCurrentVocab] = useState<string | null>(null);
  const [currentStructure, setCurrentStructure] = useState<StructureCardItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const usedIndicesRef = useRef<Set<number>>(new Set());

  // Translation cache: index → Vietnamese sentence
  const translationCacheRef = useRef<Map<number, string>>(new Map());
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // Hint + translation reveal
  const [hintVisible, setHintVisible] = useState(false);
  const [translationVisible, setTranslationVisible] = useState(false);

  // Timer
  const [selectedDuration, setSelectedDuration] = useState<Duration>(20);
  const [timerSeconds, setTimerSeconds] = useState<number>(20);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  const activePoolLength = mode === 'vocab' ? vocabPool.length : structurePool.length;

  // Reset card + timer when mode changes
  useEffect(() => {
    setCurrentVocab(null);
    setCurrentStructure(null);
    setCurrentIndex(-1);
    usedIndicesRef.current = new Set();
    translationCacheRef.current = new Map();
    setTranslatedText(null);
    setHintVisible(false);
    setTimerSeconds(selectedDuration);
    setTimerRunning(false);
    setTimerDone(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Reset hint + translation when card changes
  useEffect(() => {
    setHintVisible(false);
    setTranslationVisible(false);
  }, [currentIndex]);

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

  const resetTimer = useCallback((duration: Duration) => {
    setTimerSeconds(duration);
    setTimerRunning(false);
    setTimerDone(false);
  }, []);

  const fetchTranslation = useCallback(async (idx: number, sentence: string) => {
    const cached = translationCacheRef.current.get(idx);
    if (cached !== undefined) {
      setTranslatedText(cached);
      return;
    }
    setTranslating(true);
    setTranslatedText(null);
    try {
      const res = await fetch('/api/games/translate-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exampleSentence: sentence }),
      });
      const data = await res.json() as { vietnamese?: string };
      const text = data.vietnamese ?? sentence;
      translationCacheRef.current.set(idx, text);
      setTranslatedText(text);
    } catch {
      // Fallback to English if translation fails
      translationCacheRef.current.set(idx, sentence);
      setTranslatedText(sentence);
    } finally {
      setTranslating(false);
    }
  }, []);

  const pickRandom = useCallback(() => {
    if (activePoolLength === 0) return;
    if (usedIndicesRef.current.size >= activePoolLength) {
      usedIndicesRef.current = new Set();
    }
    let idx: number;
    do {
      idx = Math.floor(Math.random() * activePoolLength);
    } while (usedIndicesRef.current.has(idx) || (activePoolLength > 1 && idx === currentIndex));
    usedIndicesRef.current.add(idx);
    setCurrentIndex(idx);

    if (mode === 'vocab') {
      setCurrentVocab(vocabPool[idx]);
      setCurrentStructure(null);
      setTranslatedText(null);
    } else {
      const item = structurePool[idx];
      setCurrentStructure(item);
      setCurrentVocab(null);
      fetchTranslation(idx, item.exampleSentence);
    }

    resetTimer(selectedDuration);
  }, [activePoolLength, currentIndex, mode, vocabPool, structurePool, selectedDuration, resetTimer, fetchTranslation]);

  const handleDurationChange = (d: Duration) => {
    setSelectedDuration(d);
    resetTimer(d);
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

  const hasCard = currentVocab !== null || currentStructure !== null;
  const hint = currentStructure ? extractHint(currentStructure.pattern) : '';

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
      <div className="bg-card border border-border rounded-xl min-h-[180px] flex flex-col items-center justify-center px-8 py-8 gap-3">
        {activePoolLength === 0 ? (
          <p className="text-sm text-muted-foreground/60 text-center">
            No {mode === 'vocab' ? 'words' : 'structures'} in the pool yet.
          </p>
        ) : !hasCard ? (
          <p className="text-sm text-muted-foreground/50 text-center">
            Click Generate to draw a card
          </p>
        ) : mode === 'vocab' ? (
          <p className="text-3xl font-bold text-center text-foreground">{currentVocab}</p>
        ) : translating ? (
          <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
        ) : (
          <>
            <p className="text-2xl font-semibold text-center text-foreground leading-snug">
              {translatedText}
            </p>
            <div className="mt-1 flex flex-col items-center gap-1.5">
              {hint && (
                hintVisible ? (
                  <p className="text-sm italic text-muted-foreground text-center">
                    Hint: {hint}
                  </p>
                ) : (
                  <button
                    onClick={() => setHintVisible(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Show hint
                  </button>
                )
              )}
              {translationVisible ? (
                <p className="text-sm text-muted-foreground text-center">
                  {currentStructure.exampleSentence}
                </p>
              ) : (
                <button
                  onClick={() => setTranslationVisible(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Show translation
                </button>
              )}
            </div>
          </>
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
            onClick={() => setTimerRunning(true)}
            disabled={timerRunning || timerDone}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
          <button
            onClick={() => resetTimer(selectedDuration)}
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
          disabled={activePoolLength === 0}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Generate
        </button>
        {hasCard && (
          <button
            onClick={pickRandom}
            disabled={activePoolLength <= 1}
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
