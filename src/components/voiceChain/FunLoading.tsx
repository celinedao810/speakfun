"use client";

import React, { useEffect, useState } from 'react';

export type FunContext = 'home' | 'mailbox' | 'stats' | 'leaderboard' | 'scoring' | 'learners';

const LINES: Record<FunContext, string[]> = {
  home: [
    'Warming up the microphone…',
    'Tuning in to the Voice Chain…',
    'Getting your mailbox ready…',
  ],
  mailbox: [
    'Maybe a love confession is coming…',
    'Checking who wants to talk to you…',
    'Any new voices today? Let’s see…',
    'Shaking out the envelopes…',
  ],
  stats: [
    'Let’s see if your status has updated…',
    'Counting every word you said…',
    'Adding up your speaking minutes…',
    'Polishing your trophies…',
  ],
  leaderboard: [
    'Checking who’s been chatty this week…',
    'Lining up the podium…',
    'Counting everyone’s points…',
  ],
  scoring: [
    'Your paper plane is on its way…',
    'Listening very carefully…',
    'Thinking hard about your grammar…',
    'Counting your pauses (no judgement)…',
    'Checking your ending sounds…',
  ],
  learners: [
    'Gathering your learners’ voices…',
    'Counting messages from your class…',
  ],
};

/** Three bouncing dots and a friendly line that changes while the user waits. */
export default function FunLoading({ context = 'home', className = '' }: { context?: FunContext; className?: string }) {
  const lines = LINES[context];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * lines.length));

  useEffect(() => {
    const timer = window.setInterval(() => setIndex(i => (i + 1) % lines.length), 2400);
    return () => window.clearInterval(timer);
  }, [lines.length]);

  return (
    <div className={`flex flex-col items-center gap-2 py-6 text-center ${className}`} role="status" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map(i => (
          <span key={i} className="vc-dot w-2 h-2 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <p key={index} className="vc-fade-up text-sm text-muted-foreground">{lines[index]}</p>
    </div>
  );
}
