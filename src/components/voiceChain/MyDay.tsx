"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, MessageSquare, Star } from 'lucide-react';
import { formatSeconds, vcFetch } from '@/lib/voiceChain/client';
import type { DayStats, MyMessage, ReplyPreview } from '@/lib/voiceChain/types';
import ScoreCard from './ScoreCard';
import type { BadgeStats } from '@/lib/voiceChain/badges';
import { BadgeGrid, StreakCard } from './Badges';
import FunLoading from './FunLoading';

const STATUS_LABEL: Record<MyMessage['status'], string> = {
  open: 'Waiting for an answer',
  claimed: 'Someone is answering…',
  answered: 'Answered',
  expired: 'Nobody answered — chain ended',
  removed: 'Removed after a report',
};

function hoursLeft(iso: string) {
  const h = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return h <= 1 ? 'less than an hour' : `${h} hours`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString([], { weekday: 'short' });
}

/** Streak, today's tiles, badges, the last 7 days, and the user's own recordings from the last 24h (read-only). */
export default function MyDay({ badgeStats }: { badgeStats: BadgeStats | null }) {
  const [days, setDays] = useState<DayStats[] | null>(null);
  const [messages, setMessages] = useState<MyMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      vcFetch<{ days: DayStats[] }>('stats?days=7'),
      vcFetch<{ messages: MyMessage[] }>('mine'),
    ])
      .then(([s, m]) => { setDays(s.days); setMessages(m.messages); })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load your day'));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!days || !messages) return <FunLoading context="stats" />;

  const today = days[days.length - 1];
  const maxScore = Math.max(1, ...days.map(d => d.totalScore));

  return (
    <div className="space-y-6">
      {badgeStats && <StreakCard stats={badgeStats} />}

      <div className="grid grid-cols-3 gap-2">
        <Tile icon={<MessageSquare className="w-4 h-4" />} label="Messages today" value={String(today.messagesSent)} />
        <Tile icon={<Clock className="w-4 h-4" />} label="Speaking time" value={formatSeconds(today.speakingSeconds)} />
        <Tile icon={<Star className="w-4 h-4" />} label="Total score" value={String(today.totalScore)} />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Last 7 days</p>
        <div className="space-y-1.5">
          {days.map(d => (
            <div key={d.day} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{shortDay(d.day)}</span>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(d.totalScore / maxScore) * 100}%` }} />
              </div>
              <span className="text-muted-foreground w-36 text-right">
                {d.messagesSent} msg · {formatSeconds(d.speakingSeconds)} · {d.totalScore} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      {badgeStats && <BadgeGrid stats={badgeStats} />}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your recordings (kept for 24 hours)</p>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet today — pick up a message or start a chain.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map(m => <MessageItem key={m.id} message={m} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">{icon}{label}</div>
      <p className="text-xl font-semibold text-foreground mt-1">{value}</p>
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

/** Nickname only — other people's recordings aren't shared here. */
function Related({ label, preview }: { label: string; preview: ReplyPreview }) {
  return (
    <p className="text-xs text-muted-foreground">
      {label} <span className="font-medium text-foreground">{preview.nickname}</span>
    </p>
  );
}

function MessageItem({ message: m }: { message: MyMessage }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-foreground">
          {m.isStarter ? 'Started a chain' : `Answered with “${m.requiredLetter?.toUpperCase()}”`}
        </span>
        <span className="text-xs text-muted-foreground">{timeOf(m.createdAt)} · {Math.round(m.durationSeconds)}s · link #{m.chainPosition}</span>
        <span className="ml-auto text-sm font-semibold text-foreground">{m.total} pts</span>
      </div>
      {m.audioUrl && <Recording url={m.audioUrl} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{STATUS_LABEL[m.status]}</span>
        <span>· next letter {m.lastLetter.toUpperCase()}</span>
        <span>· deleted in {hoursLeft(m.expiresAt)}</span>
      </div>
      {m.repliedTo && <Related label="You answered" preview={m.repliedTo} />}
      {m.reply && <Related label="Answered by" preview={m.reply} />}
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {open ? <><ChevronUp className="w-3.5 h-3.5" />Hide score details</> : <><ChevronDown className="w-3.5 h-3.5" />Score details</>}
      </button>
      {open && <ScoreCard message={m} />}
    </li>
  );
}
