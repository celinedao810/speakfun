"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Flame, HelpCircle, MessagesSquare, Pencil } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import type { StatusResponse } from '@/lib/voiceChain/types';
import { BadgeCelebration, useBadges } from './Badges';
import FunLoading from './FunLoading';
import Leaderboard from './Leaderboard';
import MyDay from './MyDay';
import NicknameForm from './NicknameForm';
import PlayPanel from './PlayPanel';
import QuickGuide, { TOUR_STEPS } from './QuickGuide';
import TeacherLearnerStats from './TeacherLearnerStats';
import Tour from './Tour';
import './voiceChain.css';

type Tab = 'play' | 'day' | 'leaderboard' | 'learners';

const TOUR_DONE = 'speakfun:voice-chain:tour-done';
const GUIDE_OPEN = 'speakfun:voice-chain:guide-open';

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

/** Voice Chain: an anonymous spoken word-chain for teachers and learners. */
export default function VoiceChainHome({ role }: { role: 'teacher' | 'learner' }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('play');
  const [editingName, setEditingName] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const badges = useBadges();

  const refresh = useCallback(() => {
    vcFetch<StatusResponse>('status')
      .then(s => { setStatus(s); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load Voice Chain'));
  }, []);

  // Reload whenever the Play tab is shown or the app comes back to the foreground,
  // so a message picked up earlier is resumed instead of showing the pick-up screen.
  useEffect(() => {
    if (tab !== 'play') return;
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tab, refresh]);

  // Fresh streak/badges whenever My day is opened
  const checkBadges = badges.check;
  useEffect(() => { if (tab === 'day') void checkBadges(); }, [tab, checkBadges]);

  // The quick guide starts open until the tour has been seen once
  useEffect(() => {
    const saved = readPref(GUIDE_OPEN);
    setGuideOpen(saved !== null ? saved === '1' : readPref(TOUR_DONE) !== '1');
  }, []);

  // First visit: run the tour once the Play screen (and its mailbox) is on screen
  const autoTour = !!status?.nickname && tab === 'play' && !status.activeClaim && !editingName;
  useEffect(() => {
    if (!autoTour || readPref(TOUR_DONE) === '1') return;
    const timer = window.setTimeout(() => setTourStep(s => s ?? 0), 600);
    return () => window.clearTimeout(timer);
  }, [autoTour]);

  const startTour = (step: number) => {
    setTab('play');
    setEditingName(false);
    setTourStep(step);
  };

  const closeTour = () => {
    setTourStep(null);
    if (readPref(TOUR_DONE) !== '1') {
      writePref(TOUR_DONE, '1');
      if (readPref(GUIDE_OPEN) === null) setGuideOpen(false);
    }
  };

  const toggleGuide = () => {
    setGuideOpen(o => {
      writePref(GUIDE_OPEN, o ? '0' : '1');
      return !o;
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: 'Play' },
    { id: 'day', label: 'My day' },
    { id: 'leaderboard', label: 'Leaderboard' },
    ...(role === 'teacher' ? [{ id: 'learners' as Tab, label: 'Learners' }] : []),
  ];

  const needsNickname = status && !status.nickname && tab !== 'learners';
  const streak = badges.stats?.currentStreak ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Voice Chain</h1>
        </div>
        <div data-tour="tabs" className="flex max-w-full rounded-lg border border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm ${tab === t.id ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {streak > 0 && (
            <button type="button" onClick={() => setTab('day')} title={`${streak}-day streak`}
              className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-red-500 px-2.5 py-1 text-xs font-semibold text-white">
              <Flame className="w-3.5 h-3.5" />{streak}
            </button>
          )}
          <button type="button" onClick={() => startTour(0)} aria-label="Show the Voice Chain tour"
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <HelpCircle className="w-5 h-5" />
          </button>
          {status?.nickname && !editingName && (
            <button type="button" data-tour="nickname" onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <span className="hidden sm:inline">Playing as</span>
              <span className="font-medium text-foreground">{status.nickname}</span><Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <QuickGuide open={guideOpen} onToggle={toggleGuide} onShowStep={startTour} />

      <div className="bg-card rounded-xl border border-border px-5 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p>
          : !status ? <FunLoading context="home" />
          : editingName || needsNickname ? (
            <NicknameForm
              current={status.nickname}
              onSaved={nickname => { setStatus({ ...status, nickname }); setEditingName(false); }}
              onCancel={status.nickname ? () => setEditingName(false) : undefined}
            />
          )
          : tab === 'play' ? <PlayPanel status={status} onChange={refresh} onSent={() => void badges.check()} />
          : tab === 'day' ? <MyDay badgeStats={badges.stats} />
          : tab === 'leaderboard' ? <Leaderboard />
          : <TeacherLearnerStats />}
      </div>

      {tourStep !== null && <Tour steps={TOUR_STEPS} startAt={tourStep} onClose={closeTour} />}
      {badges.celebrating && tourStep === null && (
        <BadgeCelebration badge={badges.celebrating} remaining={badges.remaining} onClose={badges.dismiss} />
      )}
    </div>
  );
}
