"use client";

import React from 'react';
import { Check, Loader2 } from 'lucide-react';

interface LetterPadProps {
  /** Lower-case letters to offer (the right one plus easy-to-confuse ones). */
  letters: string[];
  onPick: (letter: string) => void;
  /** Letter just tapped and being checked. */
  pending: string | null;
  /** Letter confirmed correct (shown green before moving on). */
  correct: string | null;
  /** Letters already tried and wrong. */
  wrong: string[];
}

/** Big letter buttons for the listening check, with clear feedback on the one you tapped. */
export default function LetterPad({ letters, onPick, pending, correct, wrong }: LetterPadProps) {
  const locked = pending !== null || correct !== null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {letters.map(l => {
        const isWrong = wrong.includes(l);
        const isPending = pending === l;
        const isCorrect = correct === l;
        const style = isCorrect
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : isPending
            ? 'border-primary bg-primary text-primary-foreground'
            : isWrong
              ? 'border-destructive/40 bg-destructive/5 text-destructive/60 line-through'
              : 'border-border bg-card text-foreground hover:border-primary hover:bg-primary/10 active:scale-95';
        return (
          <button
            key={l}
            type="button"
            disabled={locked || isWrong}
            onClick={() => onPick(l)}
            aria-pressed={isPending || isCorrect}
            aria-label={`Letter ${l.toUpperCase()}${isWrong ? ' (wrong)' : ''}`}
            className={`relative h-14 rounded-xl border-2 text-2xl font-bold transition ${style} ${
              locked && !isPending && !isCorrect ? 'opacity-50' : ''
            } disabled:cursor-not-allowed`}
          >
            {l.toUpperCase()}
            {isPending && <Loader2 className="absolute right-2 top-2 w-4 h-4 animate-spin" />}
            {isCorrect && <Check className="absolute right-2 top-2 w-4 h-4" />}
          </button>
        );
      })}
    </div>
  );
}
