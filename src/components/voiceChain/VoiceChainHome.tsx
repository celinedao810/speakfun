"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, MessagesSquare, Pencil } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import type { StatusResponse } from '@/lib/voiceChain/types';
import Leaderboard from './Leaderboard';
import MyDay from './MyDay';
import NicknameForm from './NicknameForm';
import PlayPanel from './PlayPanel';
import TeacherLearnerStats from './TeacherLearnerStats';
import { Loading } from './shared';

type Tab = 'play' | 'day' | 'leaderboard' | 'learners';

/** Voice Chain: an anonymous spoken word-chain for teachers and learners. */
export default function VoiceChainHome({ role }: { role: 'teacher' | 'learner' }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('play');
  const [editingName, setEditingName] = useState(false);

  const refresh = useCallback(() => {
    vcFetch<StatusResponse>('status')
      .then(s => { setStatus(s); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load Voice Chain'));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: 'Play' },
    { id: 'day', label: 'My day' },
    { id: 'leaderboard', label: 'Leaderboard' },
    ...(role === 'teacher' ? [{ id: 'learners' as Tab, label: 'Learners' }] : []),
  ];

  const needsNickname = status && !status.nickname && tab !== 'learners';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Voice Chain</h1>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm ${tab === t.id ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {status?.nickname && !editingName && (
          <button type="button" onClick={() => setEditingName(true)}
            className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            Playing as <span className="font-medium text-foreground">{status.nickname}</span><Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Rules />

      <div className="bg-card rounded-xl border border-border px-5 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p>
          : !status ? <Loading />
          : editingName || needsNickname ? (
            <NicknameForm
              current={status.nickname}
              onSaved={nickname => { setStatus({ ...status, nickname }); setEditingName(false); }}
              onCancel={status.nickname ? () => setEditingName(false) : undefined}
            />
          )
          : tab === 'play' ? <PlayPanel status={status} onChange={refresh} />
          : tab === 'day' ? <MyDay />
          : tab === 'leaderboard' ? <Leaderboard />
          : <TeacherLearnerStats />}
      </div>
    </div>
  );
}

const RULES_PREF = 'speakfun:voice-chain:rules-hidden';

function Rules() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(RULES_PREF) === '1') setOpen(false); } catch { /* storage blocked */ }
  }, []);
  const toggle = () => {
    setOpen(o => {
      try { localStorage.setItem(RULES_PREF, o ? '1' : '0'); } catch { /* storage blocked */ }
      return !o;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-accent/40 px-5 py-3">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between text-sm font-medium text-foreground">
        How it works
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4">
          <li>Pick up a waiting voice message from anyone on SpeakFun. Each message goes to one person only — first come, first served.</li>
          <li>Listen, then tap the <strong>last letter of the last word</strong> you heard. Your answer must start with that letter and continue the conversation.</li>
          <li>Answer straight away, like a real conversation: up to {VOICE_CHAIN.maxSeconds} seconds. Your answer becomes the next message in the chain.</li>
          <li>Every message is scored on coherence, grammar, word choice, fluency and pronunciation (100 points).</li>
          <li>You can start {VOICE_CHAIN.startersPerDay} new chains a day. Recordings are deleted after 24 hours; only your time and scores are kept.</li>
          <li>Other players only see your nickname.</li>
        </ul>
      )}
    </div>
  );
}
