"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { formatPoints } from '@/lib/voiceChain/client';
import { CRITERION_MAX, MESSAGE_MAX, SCORE_CRITERIA, VOICE_CHAIN } from '@/lib/voiceChain/config';
import type { MyMessage } from '@/lib/voiceChain/types';

/** 1 = good (green), 0.5 = OK (amber), 0 = weak (red). */
function barColor(value: number) {
  if (value >= CRITERION_MAX) return 'bg-emerald-500';
  if (value > 0) return 'bg-primary';
  return 'bg-destructive';
}

interface ScoreCardProps {
  message: MyMessage;
  /** Show "next letter" — true right after sending. */
  showNextLetter?: boolean;
  /** Start with feedback details expanded. */
  defaultOpen?: boolean;
}

export default function ScoreCard({ message, showNextLetter, defaultOpen = true }: ScoreCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const fb = message.feedback;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">Score</p>
          <p className="text-3xl font-bold text-foreground">{formatPoints(message.total)}<span className="text-base font-medium text-muted-foreground"> / {MESSAGE_MAX}</span></p>
        </div>
        {showNextLetter && (
          <div>
            <p className="text-xs text-muted-foreground">Next person starts with</p>
            <p className="text-3xl font-bold text-primary">{message.lastLetter.toUpperCase()}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {message.mode === 'realtalk' && (
            <span className="px-2 py-0.5 rounded-full bg-primary/15 text-accent-foreground">
              Real talk +{VOICE_CHAIN.modes.realtalk.bonus}
            </span>
          )}
          {message.letterRevealed && (
            <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Letter shown −{VOICE_CHAIN.revealPenalty}</span>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {SCORE_CRITERIA.map(c => {
          const value = message.scores[c.key];
          return (
            <div key={c.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="text-muted-foreground">{formatPoints(value)} / {CRITERION_MAX}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${barColor(value)}`} style={{ width: `${Math.max(value / CRITERION_MAX, 0.06) * 100}%` }} />
              </div>
              {open && fb?.[c.key] && <p className="text-xs text-muted-foreground mt-1">{fb[c.key]}</p>}
            </div>
          );
        })}
      </div>

      {open && fb && (
        <>
          {fb.endingSoundIssues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Check the ending sounds of</p>
              <div className="flex flex-wrap gap-1.5">
                {fb.endingSoundIssues.map(w => (
                  <span key={w} className="px-2 py-0.5 rounded-md bg-muted text-xs text-foreground">{w}</span>
                ))}
              </div>
            </div>
          )}
          {fb.tip && (
            <div className="flex gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
              <Lightbulb className="w-4 h-4 shrink-0" />{fb.tip}
            </div>
          )}
          {message.transcript && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">What we heard</p>
              <p className="text-sm text-muted-foreground italic">“{message.transcript}”</p>
            </div>
          )}
        </>
      )}

      {fb && (
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {open ? <><ChevronUp className="w-3.5 h-3.5" />Hide feedback</> : <><ChevronDown className="w-3.5 h-3.5" />Show feedback</>}
        </button>
      )}
    </div>
  );
}
