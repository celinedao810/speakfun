"use client";

import React, { useEffect, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { formatSeconds, vcFetch } from '@/lib/voiceChain/client';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/voiceChain/types';
import { Loading } from './shared';

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-500';
  if (rank === 2) return 'text-muted-foreground/60';
  if (rank === 3) return 'text-amber-700';
  return 'text-muted-foreground/40';
}

function RankIcon({ rank }: { rank: number }) {
  if (rank <= 3) return <Medal className={`w-4 h-4 ${rankColor(rank)}`} />;
  return <span className="text-xs text-muted-foreground/60 font-mono w-4 text-center">{rank}</span>;
}

/** This week's leaderboard across SpeakFun — nicknames only. */
export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vcFetch<LeaderboardResponse>('leaderboard')
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load the leaderboard'));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Loading />;

  const weekLabel = new Date(`${data.weekStart}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-foreground">This week</span>
        <span className="text-xs text-muted-foreground">since Monday {weekLabel}</span>
      </div>

      {data.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground/60">No messages this week yet. Be the first!</p>
      ) : (
        <>
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-5 py-2 bg-muted/50 border-b border-border">
            <span className="w-6" />
            <span className="text-xs text-muted-foreground/60 font-medium">Nickname</span>
            <span className="text-xs text-muted-foreground/60 font-medium text-right w-16">Messages</span>
            <span className="text-xs text-muted-foreground/60 font-medium text-right w-16">Speaking</span>
            <span className="text-xs text-muted-foreground/60 font-medium text-right w-14">Points</span>
          </div>
          <ul className="divide-y divide-border">
            {data.rows.map(r => <Row key={r.rank} row={r} />)}
            {data.me && (
              <>
                <li className="px-5 py-1 text-center text-xs text-muted-foreground/60">…</li>
                <Row row={data.me} />
              </>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function Row({ row }: { row: LeaderboardRow }) {
  return (
    <li className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-5 py-3 ${row.isMe ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
      <div className="w-6 flex items-center justify-center"><RankIcon rank={row.rank} /></div>
      <span className={`text-sm font-medium truncate ${row.isMe ? 'text-primary' : 'text-foreground'}`}>
        {row.nickname}{row.isMe && <span className="ml-1.5 text-xs text-primary/70">(you)</span>}
      </span>
      <span className="text-sm text-muted-foreground text-right w-16">{row.messagesSent}</span>
      <span className="text-sm text-muted-foreground text-right w-16">{formatSeconds(row.speakingSeconds)}</span>
      <span className="text-sm font-semibold text-foreground text-right w-14">{row.totalScore}</span>
    </li>
  );
}
