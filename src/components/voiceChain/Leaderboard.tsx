"use client";

import React, { useEffect, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { formatSeconds, vcFetch } from '@/lib/voiceChain/client';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/voiceChain/types';
import FunLoading from './FunLoading';

// Speaking time is hidden on phones so nicknames keep their room
const COLS = 'grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.5rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_4rem] gap-3 items-center px-3 sm:px-5';

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
  if (!data) return <FunLoading context="leaderboard" />;

  const weekLabel = new Date(`${data.weekStart}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 sm:px-5 py-4 border-b border-border">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-foreground">This week</span>
        <span className="text-xs text-muted-foreground">since Monday {weekLabel}</span>
      </div>

      {data.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground/60">No messages this week yet. Be the first!</p>
      ) : (
        <>
          <div className={`${COLS} py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground/60 font-medium`}>
            <span />
            <span>Nickname</span>
            <span className="text-right">Msgs</span>
            <span className="text-right hidden sm:block">Speaking</span>
            <span className="text-right">Points</span>
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
    <li className={`${COLS} py-3 ${row.isMe ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
      <div className="flex items-center justify-center"><RankIcon rank={row.rank} /></div>
      <span className={`text-sm font-medium truncate ${row.isMe ? 'text-primary' : 'text-foreground'}`}>
        {row.nickname}{row.isMe && <span className="ml-1.5 text-xs text-primary/70">(you)</span>}
      </span>
      <span className="text-sm text-muted-foreground text-right">{row.messagesSent}</span>
      <span className="text-sm text-muted-foreground text-right hidden sm:block">{formatSeconds(row.speakingSeconds)}</span>
      <span className="text-sm font-semibold text-foreground text-right">{row.totalScore}</span>
    </li>
  );
}
