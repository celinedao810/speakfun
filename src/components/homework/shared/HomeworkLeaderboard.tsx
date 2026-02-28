"use client";

import React, { useEffect, useState } from 'react';
import { Trophy, Loader2, Medal } from 'lucide-react';
import { LeaderboardEntry } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { fetchLeaderboard } from '@/lib/supabase/queries/homework';

interface HomeworkLeaderboardProps {
  classId: string;
  currentLearnerId?: string;
}

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-500';
  if (rank === 2) return 'text-muted-foreground/60';
  if (rank === 3) return 'text-amber-700';
  return 'text-muted-foreground/40';
}

function RankIcon({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <Medal className={`w-4 h-4 ${rankColor(rank)}`} />;
  }
  return <span className="text-xs text-muted-foreground/60 font-mono w-4 text-center">{rank}</span>;
}

export default function HomeworkLeaderboard({ classId, currentLearnerId }: HomeworkLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard(supabase, classId)
      .then(data => {
        const ranked = data.map((e, i) => ({ ...e, rank: i + 1 }));
        setEntries(ranked);
      })
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-muted-foreground/60 animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground/60">
        No submissions yet. Be the first to complete homework!
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-foreground">Leaderboard</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-5 py-2 bg-muted/50 border-b border-border">
        <span className="w-6" />
        <span className="text-xs text-muted-foreground/60 font-medium">Name</span>
        <span className="text-xs text-muted-foreground/60 font-medium text-right w-16">Homework</span>
        <span className="text-xs text-muted-foreground/60 font-medium text-right w-16">Points</span>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border">
        {entries.map(entry => {
          const isMe = entry.learnerId === currentLearnerId;
          return (
            <li
              key={entry.learnerId}
              className={`grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-5 py-3 transition ${
                isMe ? 'bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              <div className="w-6 flex items-center justify-center">
                <RankIcon rank={entry.rank ?? 99} />
              </div>
              <div className="min-w-0">
                <span className={`text-sm font-medium truncate block ${isMe ? 'text-primary' : 'text-foreground'}`}>
                  {entry.learnerName}
                  {isMe && <span className="ml-1.5 text-xs text-primary/70">(you)</span>}
                </span>
              </div>
              <span className="text-xs text-muted-foreground text-right w-16 tabular-nums">
                {entry.homeworkCompleted}/{entry.totalSubmissions || '—'}
              </span>
              <span className={`text-sm font-bold text-right w-16 tabular-nums ${isMe ? 'text-primary' : 'text-foreground'}`}>
                {entry.totalPoints.toFixed(0)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
