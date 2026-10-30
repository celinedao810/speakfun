"use client";

import React, { useEffect, useState } from 'react';
import { Inbox, Loader2, Mic, PhoneIncoming } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN, VoiceChainMode } from '@/lib/voiceChain/config';
import type { ClaimView, StatusResponse } from '@/lib/voiceChain/types';
import AnswerFlow from './AnswerFlow';
import StartChainFlow from './StartChainFlow';
import { primaryBtn, secondaryBtn } from './shared';

const MODE_PREF = 'speakfun:voice-chain:mode';

interface PlayPanelProps {
  status: StatusResponse;
  onChange: () => void;
}

export default function PlayPanel({ status, onChange }: PlayPanelProps) {
  const [mode, setMode] = useState<VoiceChainMode>('relaxed');
  const [claim, setClaim] = useState<ClaimView | null>(status.activeClaim);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_PREF);
      if (saved === 'relaxed' || saved === 'realtalk') setMode(saved);
    } catch { /* storage blocked */ }
  }, []);

  const chooseMode = (m: VoiceChainMode) => {
    setMode(m);
    try { localStorage.setItem(MODE_PREF, m); } catch { /* storage blocked */ }
  };

  // Resume a claim held from an earlier visit
  const activeClaimId = status.activeClaim?.messageId;
  useEffect(() => {
    if (status.activeClaim) setClaim(c => c ?? status.activeClaim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClaimId]);

  const pickUp = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await vcFetch<{ claim: ClaimView | null }>('claim', { mode });
      if (res.claim) setClaim(res.claim);
      else setNote('No messages are waiting for you right now. Start a new chain, or check back soon!');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not pick up a message');
    } finally {
      setBusy(false);
    }
  };

  if (claim) {
    return (
      <AnswerFlow
        key={claim.messageId}
        claim={claim}
        onExit={again => {
          setClaim(null);
          onChange();
          if (again) void pickUp();
        }}
      />
    );
  }

  if (starting) {
    return <StartChainFlow startersLeft={status.startersLeft} onExit={() => { setStarting(false); onChange(); }} />;
  }

  return (
    <div className="space-y-6">
      {/* Answer */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {status.openCount === 0 ? 'No messages waiting' : `${status.openCount} ${status.openCount === 1 ? 'message' : 'messages'} waiting for an answer`}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(Object.keys(VOICE_CHAIN.modes) as VoiceChainMode[]).map(m => {
            const s = VOICE_CHAIN.modes[m];
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className={`text-left rounded-lg border px-3 py-2.5 transition ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
              >
                <p className={`text-sm font-medium ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Once you pick up a message it’s yours for {Math.round(VOICE_CHAIN.claimSeconds / 60)} minutes — answer it like a real conversation.
        </p>
        <button type="button" className={primaryBtn} onClick={() => void pickUp()} disabled={busy || status.openCount === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneIncoming className="w-4 h-4" />}Pick up a message
        </button>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>

      {/* Start */}
      <div className="space-y-2 pt-5 border-t border-border">
        <p className="text-sm font-semibold text-foreground">Start a new chain</p>
        <p className="text-xs text-muted-foreground">
          {status.startersLeft > 0
            ? `You can start ${status.startersLeft} more ${status.startersLeft === 1 ? 'chain' : 'chains'} today.`
            : `You’ve started ${VOICE_CHAIN.startersPerDay} chains today — answer messages to keep speaking!`}
        </p>
        <button type="button" className={secondaryBtn} onClick={() => setStarting(true)} disabled={status.startersLeft === 0}>
          <Mic className="w-4 h-4" />Record a new message
        </button>
      </div>
    </div>
  );
}
