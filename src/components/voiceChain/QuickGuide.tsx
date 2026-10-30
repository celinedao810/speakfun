"use client";

import React from 'react';
import {
  ArrowRight, Award, ChevronDown, ChevronRight, Ear, Link2, Mail, MessagesSquare, Mic, SlidersHorizontal, Star, Type, UserRound,
  type LucideIcon,
} from 'lucide-react';
import { SCORE_CRITERIA, VOICE_CHAIN } from '@/lib/voiceChain/config';
import type { TourStep } from './Tour';

/** "…I love coffee" → E, used by the listening steps. */
function LetterExample() {
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
        …and I really love <span className="font-semibold">coffe<span className="text-primary underline decoration-2 underline-offset-2">e</span></span>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="w-10 h-10 rounded-lg border-2 border-primary bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">E</span>
    </div>
  );
}

export const TOUR_STEPS: TourStep[] = [
  {
    icon: MessagesSquare,
    title: 'Welcome to Voice Chain',
    body: <>Talk with anyone on SpeakFun, one short voice message at a time. Every answer keeps the chain going.</>,
  },
  {
    target: 'mailbox',
    icon: Mail,
    title: 'Check your mailbox',
    body: <>Tap the mailbox — or shake your phone — to get the next waiting message. First come, first served: each message goes to one person only.</>,
  },
  {
    target: 'modes',
    icon: SlidersHorizontal,
    title: 'Pick your pace',
    body: <><strong>Relaxed</strong> gives you more time to think. <strong>Real talk</strong> is faster, like a real conversation, and earns a +0.5 bonus point.</>,
  },
  {
    icon: Ear,
    title: 'Hear the last word',
    body: <>Listen to the message carefully, especially its <strong>last word</strong>. You can replay it, but only a limited number of times.</>,
  },
  {
    icon: Type,
    title: 'Tap its last letter',
    body: (
      <>
        Tap the last <em>letter</em> of the last word — by spelling, not by sound. Stuck? “Show me the letter” costs {VOICE_CHAIN.revealPenalty} points.
        <LetterExample />
      </>
    ),
  },
  {
    icon: Mic,
    title: `Reply in ${VOICE_CHAIN.maxSeconds} seconds`,
    body: <>Start your answer with that letter (“<strong>E</strong>very morning I…”) and continue the topic. Recording starts by itself after a short countdown.</>,
  },
  {
    icon: Star,
    title: 'Get your score',
    body: (
      <>
        Every message gets up to 5 points — 1 for each of:
        <span className="mt-2 flex flex-wrap gap-1.5">
          {SCORE_CRITERIA.map(c => (
            <span key={c.key} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{c.label}</span>
          ))}
        </span>
      </>
    ),
  },
  {
    target: 'start-chain',
    icon: Link2,
    title: 'Start your own chain',
    body: <>Record a message for someone else to answer. You can start {VOICE_CHAIN.startersPerDay} chains a day.</>,
  },
  {
    target: 'tabs',
    icon: Award,
    title: 'Streaks, badges and the leaderboard',
    body: <><strong>My progress</strong> has your recordings, streak, badges and stats. <strong>Leaderboard</strong> shows this week’s top speakers. Recordings are deleted after 24 hours; your scores stay.</>,
  },
  {
    target: 'nickname',
    icon: UserRound,
    title: 'Stay anonymous',
    body: <>Other players only ever see your nickname, never your real name.</>,
  },
];

interface Tile { icon: LucideIcon; label: string; step: number }

const TILES: Tile[] = [
  { icon: Mail, label: 'Open the mailbox', step: 1 },
  { icon: Ear, label: 'Hear the last word', step: 3 },
  { icon: Type, label: 'Tap its last letter', step: 4 },
  { icon: Mic, label: `Reply in ${VOICE_CHAIN.maxSeconds}s`, step: 5 },
  { icon: Star, label: 'Get your score', step: 6 },
  { icon: Link2, label: 'Start a chain', step: 7 },
  { icon: Award, label: 'Earn badges', step: 8 },
];

interface QuickGuideProps {
  open: boolean;
  onToggle: () => void;
  /** Opens the tour at a given step. */
  onShowStep: (step: number) => void;
}

/** Illustrated "How it works" strip. Each tile opens the tour at its step. */
export default function QuickGuide({ open, onToggle, onShowStep }: QuickGuideProps) {
  return (
    <div className="rounded-xl border border-border bg-accent/40 px-4 py-3">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between text-sm font-medium text-foreground">
        How it works
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <>
          <ol className="mt-3 flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TILES.map((t, i) => {
              const Icon = t.icon;
              return (
                <li key={t.label} className="flex items-center shrink-0">
                  <button type="button" onClick={() => onShowStep(t.step)}
                    className="group flex w-[4.75rem] flex-col items-center gap-1.5 rounded-lg px-1 py-1.5 text-center hover:bg-background/70">
                    <span className="relative w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition">
                      <Icon className="w-5 h-5" />
                      <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-card border border-border text-[10px] font-semibold text-muted-foreground flex items-center justify-center">{i + 1}</span>
                    </span>
                    <span className="text-[11px] leading-tight text-foreground">{t.label}</span>
                  </button>
                  {i < TILES.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-[11px] text-muted-foreground">Tap any step to see where it is on the screen.</p>
        </>
      )}
    </div>
  );
}
