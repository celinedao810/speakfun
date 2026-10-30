"use client";

import React from 'react';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface LetterPadProps {
  onPick: (letter: string) => void;
  disabled?: boolean;
  /** Letters already tried and wrong. */
  wrong: string[];
}

/** A–Z grid for the listening check. */
export default function LetterPad({ onPick, disabled, wrong }: LetterPadProps) {
  return (
    <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5">
      {LETTERS.map(l => {
        const isWrong = wrong.includes(l.toLowerCase());
        return (
          <button
            key={l}
            type="button"
            disabled={disabled || isWrong}
            onClick={() => onPick(l.toLowerCase())}
            className={`h-10 rounded-lg border text-sm font-semibold transition ${
              isWrong
                ? 'border-destructive/40 text-destructive/60 line-through'
                : 'border-border text-foreground hover:border-primary hover:bg-primary/10'
            } disabled:cursor-not-allowed`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
