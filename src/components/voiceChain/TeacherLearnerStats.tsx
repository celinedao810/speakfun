"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatSeconds } from '@/lib/voiceChain/client';
import type { TeacherLearnerStats as LearnerStats } from '@/lib/voiceChain/types';
import type { GameClass } from '@/app/api/games/classes/route';
import { Loading } from './shared';

const RANGES = [7, 14, 30];
const selectClass = 'rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Teachers: Voice Chain activity of learners in their classes, by real name. */
export default function TeacherLearnerStats() {
  const [classes, setClasses] = useState<GameClass[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [learners, setLearners] = useState<LearnerStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/games/classes')
      .then(r => (r.ok ? r.json() : { classes: [] }))
      .then(({ classes: all }: { classes: GameClass[] }) => {
        const mine = all.filter(c => c.role === 'teacher');
        setClasses(mine);
        setClassId(mine[0]?.id ?? null);
      });
  }, []);

  useEffect(() => {
    if (!classId) return;
    setLearners(null);
    setError(null);
    fetch(`/api/voice-chain/teacher-stats?classId=${encodeURIComponent(classId)}&days=${days}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Could not load stats');
        setLearners(data.learners);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load stats'));
  }, [classId, days]);

  if (classes === null) return <Loading />;
  if (classes.length === 0) return <p className="text-sm text-muted-foreground">Create a class to see your learners’ Voice Chain activity.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Class</span>
          <select value={classId ?? ''} onChange={e => setClassId(e.target.value)} className={selectClass}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Period</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className={selectClass}>
            {RANGES.map(n => <option key={n} value={n}>Last {n} days</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Learners play under nicknames; only you see their real names here. Days follow Vietnam time.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p>
        : !learners ? <Loading />
        : learners.length === 0 ? <p className="text-sm text-muted-foreground">No learners in this class yet.</p>
        : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground font-medium">
              <span>Learner</span>
              <span className="w-16 text-right">Messages</span>
              <span className="w-20 text-right">Speaking</span>
              <span className="w-16 text-right">Score</span>
              <span className="w-16 text-right">Active days</span>
            </div>
            <ul className="divide-y divide-border">
              {learners.map(l => {
                const isOpen = expanded === l.learnerId;
                return (
                  <li key={l.learnerId}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : l.learnerId)}
                      className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 text-sm text-left hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-foreground truncate">
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}{l.name}
                      </span>
                      <span className="w-16 text-right text-muted-foreground">{l.messagesSent}</span>
                      <span className="w-20 text-right text-muted-foreground">{formatSeconds(l.speakingSeconds)}</span>
                      <span className="w-16 text-right font-semibold text-foreground">{l.totalScore}</span>
                      <span className="w-16 text-right text-muted-foreground">{l.activeDays}/{days}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 pl-9 space-y-1">
                        {[...l.days].reverse().map(d => (
                          <div key={d.day} className="grid grid-cols-[6rem_1fr] text-xs text-muted-foreground">
                            <span>{new Date(`${d.day}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            <span>
                              {d.messagesSent === 0 ? '—' : `${d.messagesSent} msg (${d.startersSent} started) · ${formatSeconds(d.speakingSeconds)} · ${d.totalScore} pts`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </div>
  );
}
