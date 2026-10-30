"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Flame } from 'lucide-react';
import { chainLabel, formatPoints, formatSeconds } from '@/lib/voiceChain/client';
import { useVcData } from '@/lib/voiceChain/useVcData';
import type { BadgeStats } from '@/lib/voiceChain/badges';
import type { DayStats, MyMessage } from '@/lib/voiceChain/types';
import { BadgeStrip } from './Badges';
import FunLoading from './FunLoading';
import ScoreCard from './ScoreCard';

const STATUS_LABEL: Record<MyMessage['status'], string> = {
  open: 'Waiting for an answer',
  claimed: 'Someone is answering…',
  answered: 'Answered',
  expired: 'Nobody answered — chain ended',
  removed: 'Removed after a report',
};

function hoursLeft(iso: string) {
  const h = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return h <= 1 ? 'less than 1h' : `${h}h`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString([], { weekday: 'short' });
}

/**
 * My progress: today's numbers and streak, the user's recordings from the last 24h
 * (read-only), a one-row badge strip, and the last 7 days on demand.
 */
export default function MyProgress({ badgeStats }: { badgeStats: BadgeStats | null }) {
  // Shown from cache when coming back to this tab, refreshed in the background
  const stats = useVcData<{ days: DayStats[] }>('stats?days=7');
  const mine = useVcData<{ messages: MyMessage[] }>('mine');
  const [historyOpen, setHistoryOpen] = useState(false);

  const days = stats.data?.days ?? null;
  const messages = mine.data?.messages ?? null;
  const error = stats.error ?? mine.error;

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!days || !messages) return <FunLoading context="stats" />;

  const today = days[days.length - 1];
  const maxScore = Math.max(1, ...days.map(d => d.totalScore));

  return (
    <div className="space-y-6">
      <TodaySummary today={today} streak={badgeStats?.currentStreak ?? 0} longest={badgeStats?.longestStreak ?? 0} />

      {/* Recordings */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your recordings · kept 24 hours</p>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet today — pick up a message or start a chain.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map(m => <MessageItem key={m.id} message={m} />)}
          </ul>
        )}
      </section>

      {badgeStats && <BadgeStrip stats={badgeStats} />}

      {/* Last 7 days, on demand */}
      <section className="border-t border-border pt-4">
        <button type="button" onClick={() => setHistoryOpen(o => !o)} aria-expanded={historyOpen}
          className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Last 7 days
          {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {historyOpen && (
          <div className="mt-3 space-y-1.5">
            {days.map(d => (
              <div key={d.day} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{shortDay(d.day)}</span>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(d.totalScore / maxScore) * 100}%` }} />
                </div>
                <span className="text-muted-foreground w-36 text-right">
                  {d.messagesSent} msg · {formatSeconds(d.speakingSeconds)} · {formatPoints(d.totalScore)} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Streak + today's three numbers in one compact card. */
function TodaySummary({ today, streak, longest }: { today: DayStats; streak: number; longest: number }) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${streak > 0 ? 'bg-gradient-to-br from-amber-400 to-red-500 text-white' : 'bg-muted text-muted-foreground'}`}>
          <Flame className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground whitespace-nowrap">
            {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {streak === 0 ? 'Speak today to start a streak'
              : longest > streak ? `Longest: ${longest} days`
              : 'Speak daily to keep it going'}
          </p>
        </div>
        <span className="self-start text-xs text-muted-foreground">Today</span>
      </div>
      <div className="mt-3 grid grid-cols-3 divide-x divide-border text-center">
        <Stat value={String(today.messagesSent)} label="messages" />
        <Stat value={formatSeconds(today.speakingSeconds)} label="speaking" />
        <Stat value={formatPoints(today.totalScore)} label="points" />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1">
      <p className="text-lg font-semibold text-foreground leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Audio player that says so when the file can't play here, instead of spinning forever. */
function Recording({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="text-xs text-muted-foreground italic">This recording can’t be played on this device.</p>;
  }
  return <audio src={url} controls preload="metadata" onError={() => setFailed(true)} className="w-full h-9" />;
}

function MessageItem({ message: m }: { message: MyMessage }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border px-4 py-3 space-y-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground flex flex-wrap items-center gap-x-1.5">
            {m.isStarter ? 'New chain' : (
              <>
                Replying to <span className="font-semibold">{m.repliedTo?.nickname ?? 'someone'}</span>
                {m.requiredLetter && (
                  <span className="inline-flex w-5 h-5 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-accent-foreground">
                    {m.requiredLetter.toUpperCase()}
                  </span>
                )}
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {timeOf(m.createdAt)} · {Math.round(m.durationSeconds)}s{m.chainPosition > 1 && ` · ${chainLabel(m.chainPosition)}`}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{formatPoints(m.total)} pts</span>
      </div>
      {m.audioUrl && <Recording url={m.audioUrl} />}
      <p className="text-xs text-muted-foreground">
        {STATUS_LABEL[m.status]} · next letter {m.lastLetter.toUpperCase()} · deleted in {hoursLeft(m.expiresAt)}
      </p>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {open ? <><ChevronUp className="w-3.5 h-3.5" />Hide score details</> : <><ChevronDown className="w-3.5 h-3.5" />Score details</>}
      </button>
      {open && <ScoreCard message={m} />}
    </li>
  );
}
