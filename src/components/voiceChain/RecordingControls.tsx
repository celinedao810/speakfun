"use client";

import React from 'react';
import { Mic, Square } from 'lucide-react';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import type { RecorderState } from '@/lib/voiceChain/useVoiceRecorder';

interface RecordingControlsProps {
  state: RecorderState;
  elapsed: number;
  onStop: () => void;
}

/** Live recording indicator with a 45s progress bar and stop button. */
export default function RecordingControls({ state, elapsed, onStop }: RecordingControlsProps) {
  const max = VOICE_CHAIN.maxSeconds;
  const left = Math.max(0, Math.ceil(max - elapsed));
  const pct = Math.min(100, (elapsed / max) * 100);
  const tooShort = elapsed < VOICE_CHAIN.minSeconds;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <Mic className="w-4 h-4 animate-pulse" />
        {state === 'starting' ? 'Starting microphone…' : `Recording — ${left}s left`}
      </div>
      <div className="w-full max-w-md h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-destructive transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={state !== 'recording'}
        className="w-14 h-14 rounded-full bg-destructive text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50"
        aria-label="Stop recording"
      >
        <Square className="w-6 h-6" />
      </button>
      <p className="text-xs text-muted-foreground">
        {tooShort ? `Keep going — at least ${VOICE_CHAIN.minSeconds}s.` : 'Tap stop when you’re done, or keep talking until the time runs out.'}
      </p>
    </div>
  );
}
