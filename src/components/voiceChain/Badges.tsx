"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ear, Flame, Lock, MessageCircle, Mic, Star, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { vcFetch } from '@/lib/voiceChain/client';
import {
  BADGE_GROUPS, BadgeGroup, BadgeState, BadgeStats, BadgeTier, evaluateBadges,
} from '@/lib/voiceChain/badges';
import { primaryBtn } from './shared';

const GROUP_ICON: Record<BadgeGroup, LucideIcon> = {
  streak: Flame,
  messages: MessageCircle,
  speaking: Mic,
  score: Star,
  ears: Ear,
  realtalk: Zap,
};

const TIER_STYLE: Record<BadgeTier, string> = {
  bronze: 'bg-gradient-to-br from-amber-600 to-orange-800 text-white',
  silver: 'bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 text-white',
  gold: 'bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950',
  platinum: 'bg-gradient-to-br from-violet-400 to-fuchsia-600 text-white',
};

function formatValue(b: BadgeState, value: number) {
  if (b.metric === 'speakingSeconds') {
    const m = Math.floor(value / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
  }
  return value.toLocaleString();
}

export function Medallion({ badge, size = 'md' }: { badge: BadgeState; size?: 'md' | 'lg' }) {
  const Icon = GROUP_ICON[badge.group];
  const dims = size === 'lg' ? 'w-24 h-24' : 'w-14 h-14';
  const icon = size === 'lg' ? 'w-11 h-11' : 'w-6 h-6';
  return (
    <div className={`relative ${dims} rounded-full flex items-center justify-center shadow-sm ring-4 ring-background ${
      badge.earned ? TIER_STYLE[badge.tier] : 'bg-muted text-muted-foreground/50'
    }`}>
      <Icon className={icon} strokeWidth={2} />
      {!badge.earned && (
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
          <Lock className="w-3 h-3 text-muted-foreground" />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streak card + grid (My day)
// ---------------------------------------------------------------------------

export function StreakCard({ stats }: { stats: BadgeStats }) {
  const on = stats.currentStreak > 0;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-3">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${on ? 'bg-gradient-to-br from-amber-400 to-red-500 text-white' : 'bg-muted text-muted-foreground'}`}>
        <Flame className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-foreground">
          {stats.currentStreak}-day streak
        </p>
        <p className="text-xs text-muted-foreground">
          {on ? 'Speak once a day to keep it going.' : 'Send a message today to start a streak.'}
          {stats.longestStreak > 0 && ` Longest: ${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}.`}
        </p>
      </div>
    </div>
  );
}

export function BadgeGrid({ stats }: { stats: BadgeStats }) {
  const [showAll, setShowAll] = useState(false);
  const badges = evaluateBadges(stats);
  const earned = badges.filter(b => b.earned).length;

  // Compact view: what's earned plus the next badge to aim for in each group
  const visible = (group: BadgeGroup) => {
    const inGroup = badges.filter(b => b.group === group);
    if (showAll) return inGroup;
    const next = inGroup.find(b => !b.earned);
    return inGroup.filter(b => b.earned || b === next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Badges</p>
        <p className="text-xs text-muted-foreground">{earned} of {badges.length} earned</p>
      </div>
      {BADGE_GROUPS.map(({ group, label }) => (
        <div key={group}>
          <p className="text-xs font-medium text-foreground mb-2">{label}</p>
          <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-x-2 gap-y-4">
            {visible(group).map(b => (
              <li key={b.id} className="flex flex-col items-center text-center gap-1.5" title={b.description}>
                <Medallion badge={b} />
                <p className={`text-xs font-medium leading-tight ${b.earned ? 'text-foreground' : 'text-muted-foreground'}`}>{b.title}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{b.description}</p>
                {!b.earned && (
                  <div className="w-full max-w-[5.5rem]">
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, (b.value / b.goal) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatValue(b, b.value)} / {formatValue(b, b.goal)}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" onClick={() => setShowAll(v => !v)} className="text-xs font-medium text-primary hover:underline">
        {showAll ? 'Show fewer badges' : `Show all ${badges.length} badges`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New-badge detection + celebration
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

/**
 * Loads badge stats and celebrates badges earned since the last check.
 * Seen badges are remembered per user in localStorage; on the very first check
 * already-earned badges are stored silently (no flood of old badges after release).
 */
export function useBadges() {
  const { user } = useAuth();
  const [stats, setStats] = useState<BadgeStats | null>(null);
  const [queue, setQueue] = useState<BadgeState[]>([]);
  const userId = user?.id;
  const busyRef = useRef(false);

  const check = useCallback(async () => {
    if (!userId || busyRef.current) return;
    busyRef.current = true;
    try {
      const { stats: s } = await vcFetch<{ stats: BadgeStats }>('badges');
      setStats(s);
      const earned = evaluateBadges(s).filter(b => b.earned);
      const key = `speakfun:voice-chain:badges-seen:${userId}`;
      let seen: string[] | null = null;
      try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* storage blocked */ }
      // First check ever: remember what's already earned, but still celebrate a brand-new player's first badge
      const firstCheck = seen === null;
      const seenSet = new Set(seen ?? []);
      const fresh = earned.filter(b => !seenSet.has(b.id));
      try { localStorage.setItem(key, JSON.stringify(earned.map(b => b.id))); } catch { /* storage blocked */ }
      const toShow = firstCheck ? (s.messages <= 1 ? fresh : []) : fresh;
      if (toShow.length) setQueue(q => [...q, ...toShow]);
    } catch {
      // Badges are a bonus; never block the game on them
    } finally {
      busyRef.current = false;
    }
  }, [userId]);

  useEffect(() => { void check(); }, [check]);

  const dismiss = useCallback(() => setQueue(q => q.slice(1)), []);
  return { stats, check, celebrating: queue[0] ?? null, remaining: queue.length, dismiss };
}

export function BadgeCelebration({ badge, remaining, onClose }: { badge: BadgeState; remaining: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 90 + (i % 3) * 30;
    return {
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      style: {
        '--vc-x': `${Math.cos(angle) * dist}px`,
        '--vc-y': `${Math.sin(angle) * dist}px`,
        '--vc-r': `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
        animationDelay: `${0.15 + (i % 4) * 0.03}s`,
      } as React.CSSProperties,
    };
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label="Badge unlocked" onClick={onClose}>
      <div key={badge.id} className="vc-fade-up relative w-full max-w-xs rounded-2xl bg-card border border-border px-6 py-7 text-center shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="relative mx-auto w-24 h-24">
          {pieces.map((p, i) => (
            <span key={i} className="vc-confetti absolute left-1/2 top-1/2 w-2 h-3 rounded-sm opacity-0" style={{ ...p.style, backgroundColor: p.color }} />
          ))}
          <div className="vc-badge-pop"><Medallion badge={badge} size="lg" /></div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">Badge unlocked!</p>
        <p className="mt-1 text-lg font-bold text-foreground">{badge.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
        <button type="button" className={`${primaryBtn} mt-5 w-full`} onClick={onClose} autoFocus>
          {remaining > 1 ? `Nice! (${remaining - 1} more)` : 'Nice!'}
        </button>
      </div>
    </div>
  );
}
