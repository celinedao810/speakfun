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
import { secondaryBtn, useSecondsUntil } from './shared';

const MODE_PREF = 'speakfun:voice-chain:mode';
/** Keep the mailbox shaking at least this long, so checking feels like something happened. */
const MIN_CHECK_MS = 1100;

const NO_TIME = new Date(0).toISOString();
const BACK_IN_MAILBOX = 'That envelope went back to the mailbox — tap to check again.';

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
  // An opened message you're coming back to resumes the answer screen; an unopened
  // one is still an envelope in the mailbox.
  const held = status.activeClaim;
  const [claim, setClaim] = useState<ClaimView | null>(held?.opened ? held : null);
  const [starting, setStarting] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxState>(held && !held.opened ? 'found' : 'idle');
  const [found, setFound] = useState<ClaimView | null>(held && !held.opened ? held : null);
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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

  // Resume a message held from an earlier visit: opened → answer screen, unopened → envelope
  const activeClaimId = status.activeClaim?.messageId;
  useEffect(() => {
    const active = status.activeClaim;
    if (!active) return;
    if (active.opened) {
      setClaim(c => c ?? active);
    } else if (!claim) {
      setFound(active);
      setMailbox('found');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClaimId]);

  // An unopened envelope goes back to the mailbox when its hold runs out (no penalty)
  const holdLeft = useSecondsUntil(found?.claimExpiresAt ?? NO_TIME);
  useEffect(() => {
    if (mailbox !== 'found' || !found || opening) return;
    // Timed to the real deadline (holdLeft rounds down, so it reads 0 a moment early)
    const timer = window.setTimeout(() => {
      setFound(null);
      setMailbox('idle');
      setInfo(BACK_IN_MAILBOX);
    }, Math.max(0, new Date(found.claimExpiresAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [mailbox, found, opening]);

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
    setInfo(null);
    try {
      const [res] = await Promise.all([
        vcFetch<{ claim: ClaimView | null }>('claim', { mode }),
        new Promise(resolve => setTimeout(resolve, MIN_CHECK_MS)),
      ]);
      if (!res.claim) {
        emptyLineRef.current = EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)];
        setMailbox('empty');
      } else if (res.claim.opened) {
        // Already opened this one before: go straight back to it
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

  // Opening starts the time to answer
  const openEnvelope = async () => {
    if (!found || opening) return;
    setOpening(true);
    try {
      const res = await vcFetch<{ claim: ClaimView }>('open', { messageId: found.messageId });
      setClaim(res.claim);
      setFound(null);
      setMailbox('idle');
    } catch (err) {
      setFound(null);
      setMailbox('idle');
      setInfo(err instanceof Error ? err.message : BACK_IN_MAILBOX);
    } finally {
      setOpening(false);
    }
  };

  // Not now: the envelope goes back, and can come to you again later
  const putBack = async () => {
    if (!found) return;
    const id = found.messageId;
    setFound(null);
    setMailbox('idle');
    setInfo('Put back — it can come to you again later.');
    await vcFetch('release', { messageId: id }).catch(() => undefined);
    onChange();
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
          onOpen={() => void openEnvelope()}
          senderNickname={found?.senderNickname}
          holdLeft={found ? holdLeft : undefined}
          onPutBack={() => void putBack()}
          opening={opening}
          emptyLine={emptyLineRef.current}
          shake={shake.permission}
          onEnableShake={() => void shake.enable()}
        />
        {note && <p className="text-sm text-destructive text-center">{note}</p>}
        {info && mailbox === 'idle' && <p className="text-sm text-muted-foreground text-center">{info}</p>}
        <p className="text-xs text-muted-foreground text-center mt-1">
          Open an envelope within a minute, then you have {Math.round(VOICE_CHAIN.claimSeconds / 60)} minutes to start your answer.
          Didn’t open it? It goes back to the mailbox and can come to you again.
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
