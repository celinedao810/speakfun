"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN, VoiceChainMode } from '@/lib/voiceChain/config';
import { useShake } from '@/lib/voiceChain/useShake';
import type { ClaimView, StatusResponse } from '@/lib/voiceChain/types';
import AnswerFlow from './AnswerFlow';
import Mailbox, { MailboxState } from './Mailbox';
import StartChainFlow from './StartChainFlow';
import { secondaryBtn } from './shared';

const MODE_PREF = 'speakfun:voice-chain:mode';
/** Keep the mailbox shaking at least this long, so checking feels like something happened. */
const MIN_CHECK_MS = 1100;

const EMPTY_LINES = [
  'No mail yet — maybe start a chain and make the first move?',
  'The mailbox is empty. Everyone must be shy today!',
  'Nothing here right now. Try again in a little while.',
  'Quiet day! Record a message and get the chain going.',
];

interface PlayPanelProps {
  status: StatusResponse;
  onChange: () => void;
  /** Called after a message is accepted (used to check for new badges). */
  onSent: () => void;
}

export default function PlayPanel({ status, onChange, onSent }: PlayPanelProps) {
  const [mode, setMode] = useState<VoiceChainMode>('relaxed');
  const [claim, setClaim] = useState<ClaimView | null>(status.activeClaim);
  const [starting, setStarting] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxState>('idle');
  const [found, setFound] = useState<ClaimView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const emptyLineRef = useRef(EMPTY_LINES[0]);

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

  // Back to a resting mailbox a few seconds after finding it empty
  useEffect(() => {
    if (mailbox !== 'empty') return;
    const timer = window.setTimeout(() => setMailbox('idle'), 3500);
    return () => window.clearTimeout(timer);
  }, [mailbox]);

  const check = useCallback(async () => {
    if (mailbox === 'checking') return;
    setMailbox('checking');
    setNote(null);
    try {
      const [res] = await Promise.all([
        vcFetch<{ claim: ClaimView | null }>('claim', { mode }),
        new Promise(resolve => setTimeout(resolve, MIN_CHECK_MS)),
      ]);
      if (!res.claim) {
        emptyLineRef.current = EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)];
        setMailbox('empty');
      } else if (res.claim.resumed) {
        // Already holding this one from before: go straight back to it
        setMailbox('idle');
        setClaim(res.claim);
      } else {
        setFound(res.claim);
        setMailbox('found');
        navigator.vibrate?.([60, 40, 60]);
      }
    } catch (err) {
      setMailbox('idle');
      setNote(err instanceof Error ? err.message : 'Could not check the mailbox');
    }
  }, [mailbox, mode]);

  const shake = useShake(() => { void check(); }, !claim && !starting && mailbox === 'idle');

  const openEnvelope = () => {
    if (!found) return;
    setClaim(found);
    setFound(null);
    setMailbox('idle');
  };

  if (claim) {
    return (
      <AnswerFlow
        key={claim.messageId}
        claim={claim}
        onSent={onSent}
        onExit={again => {
          setClaim(null);
          onChange();
          if (again) void check();
        }}
      />
    );
  }

  if (starting) {
    return (
      <StartChainFlow
        startersLeft={status.startersLeft}
        onSent={onSent}
        onExit={() => { setStarting(false); onChange(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode */}
      <div data-tour="modes" className="grid grid-cols-2 gap-2">
        {(Object.keys(VOICE_CHAIN.modes) as VoiceChainMode[]).map(m => {
          const s = VOICE_CHAIN.modes[m];
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => chooseMode(m)}
              disabled={mailbox !== 'idle'}
              aria-pressed={active}
              className={`text-left rounded-lg border px-3 py-2 transition disabled:opacity-60 ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
            >
              <p className={`text-sm font-medium ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{s.label}</p>
              <p className="text-xs text-muted-foreground leading-snug">{s.description}</p>
            </button>
          );
        })}
      </div>

      {/* Mailbox */}
      <div data-tour="mailbox" className="flex flex-col items-center">
        <Mailbox
          state={mailbox}
          onCheck={() => void check()}
          onOpen={openEnvelope}
          senderNickname={found?.senderNickname}
          emptyLine={emptyLineRef.current}
          shake={shake.permission}
          onEnableShake={() => void shake.enable()}
        />
        {note && <p className="text-sm text-destructive text-center">{note}</p>}
        <p className="text-xs text-muted-foreground text-center mt-1">
          When you get a message, it’s yours for {Math.round(VOICE_CHAIN.claimSeconds / 60)} minutes — open it and answer straight away.
        </p>
      </div>

      {/* Start */}
      <div data-tour="start-chain" className="space-y-2 pt-5 border-t border-border">
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
