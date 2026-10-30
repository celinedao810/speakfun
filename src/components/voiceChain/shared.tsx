"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />{label}
    </div>
  );
}

export const primaryBtn = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryBtn = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed';
export const ghostBtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50';

/**
 * Counts down `seconds` while `running`, calling `onDone` once at zero.
 * Restarts whenever `running` turns true or `restartKey` changes. Returns seconds left.
 */
export function useCountdown(seconds: number | null, running: boolean, onDone: () => void, restartKey: unknown = 0) {
  const [left, setLeft] = useState(seconds ?? 0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!running || seconds === null) return;
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const timer = window.setInterval(() => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        window.clearInterval(timer);
        doneRef.current();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [running, seconds, restartKey]);

  return left;
}

/** Whole seconds until `iso`, updated every second (never negative). */
export function useSecondsUntil(iso: string) {
  const calc = () => Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const timer = window.setInterval(() => setLeft(calc()), 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return left;
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
