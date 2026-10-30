"use client";

import React from 'react';
import { Heart, Smartphone } from 'lucide-react';
import FunLoading from './FunLoading';
import { clock } from './shared';

export type MailboxState = 'idle' | 'checking' | 'found' | 'empty';

interface MailboxProps {
  state: MailboxState;
  /** Tapping the mailbox (idle) checks for mail. */
  onCheck: () => void;
  /** Tapping the envelope (found) opens the message. */
  onOpen: () => void;
  senderNickname?: string;
  emptyLine?: string;
  /** Shake support: 'granted' shows the hint, 'needs-permission' shows the enable chip. */
  shake: 'unsupported' | 'needs-permission' | 'granted' | 'denied';
  onEnableShake: () => void;
  /** Seconds left to open the envelope before it goes back to the mailbox. */
  holdLeft?: number;
  /** Puts the unopened envelope back, with no penalty. */
  onPutBack?: () => void;
  /** True while the envelope is being opened. */
  opening?: boolean;
}

/** A floating mailbox: tap (or shake) to check for mail, then tap the envelope to open it. */
export default function Mailbox({
  state, onCheck, onOpen, senderNickname, emptyLine, shake, onEnableShake, holdLeft, onPutBack, opening,
}: MailboxProps) {
  const open = state === 'found' || state === 'empty';

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="relative w-44 h-48">
        {/* Envelope */}
        {state === 'found' && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open the message from ${senderNickname ?? 'someone'}`}
            className="vc-envelope-in absolute left-1/2 top-0 z-10 w-28 h-[4.5rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            style={{ transform: 'translate(-50%, 0)' }}
          >
            <svg viewBox="0 0 112 72" className="w-full h-full drop-shadow-md">
              <rect x="1" y="1" width="110" height="70" rx="6" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
              <path d="M2 6 L56 42 L110 6" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <span className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-destructive flex items-center justify-center shadow">
              <Heart className="w-3.5 h-3.5 text-white fill-white" />
            </span>
          </button>
        )}

        {/* Mailbox */}
        <button
          type="button"
          onClick={state === 'idle' ? onCheck : state === 'found' ? onOpen : undefined}
          disabled={state === 'checking' || state === 'empty'}
          aria-label={state === 'found' ? 'Open your mail' : 'Check the mailbox'}
          className={`absolute inset-x-0 bottom-3 top-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl ${state === 'idle' ? 'vc-float cursor-pointer' : ''}`}
        >
          <div className={state === 'checking' ? 'vc-shake w-full h-full' : 'w-full h-full'}>
            <svg viewBox="0 0 160 170" className="w-full h-full overflow-visible">
              {/* post */}
              <rect x="72" y="104" width="16" height="62" rx="3" fill="var(--chart-4)" />
              {/* body */}
              <path d="M24 106 V58 a56 46 0 0 1 112 0 V106 Z" fill="var(--primary)" />
              <path d="M24 106 V58 a56 46 0 0 1 112 0 V106 Z" fill="none" stroke="var(--chart-3)" strokeWidth="3" />
              {/* inside (visible when the door is open) */}
              <path d="M40 104 V62 a40 32 0 0 1 80 0 V104 Z" fill="var(--chart-4)" opacity={open ? 0.9 : 0} />
              {/* door */}
              <g className={`vc-door ${open ? 'vc-door-open' : ''}`}>
                <path d="M40 104 V62 a40 32 0 0 1 80 0 V104 Z" fill="var(--chart-2)" />
                <rect x="70" y="66" width="20" height="5" rx="2.5" fill="var(--chart-4)" opacity="0.6" />
              </g>
              {/* flag */}
              <g className={`vc-flag ${state === 'found' ? 'vc-flag-up' : ''}`}>
                <rect x="134" y="44" width="5" height="50" rx="2" fill="var(--chart-4)" />
                <path d="M139 44 h18 v14 h-18 z" fill="var(--destructive)" />
              </g>
            </svg>
          </div>
        </button>

        {/* shadow */}
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-0 w-24 h-2.5 rounded-full bg-foreground/25 blur-[2px] ${state === 'idle' ? 'vc-shadow' : ''}`} />

        {/* attention ring while there is mail */}
        {state === 'found' && (
          <span className="vc-pulse-ring pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 w-32 h-20 rounded-xl border-2 border-primary" />
        )}
      </div>

      {/* Caption */}
      <div className="min-h-[3.5rem] flex flex-col items-center text-center">
        {state === 'idle' && (
          <>
            <p className="text-sm font-medium text-foreground">Tap the mailbox{shake === 'granted' ? ' or shake your phone' : ''}</p>
            <p className="text-xs text-muted-foreground">to get the next waiting message</p>
            {shake === 'needs-permission' && (
              <button type="button" onClick={onEnableShake}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                <Smartphone className="w-3.5 h-3.5" />Turn on shake to check
              </button>
            )}
          </>
        )}
        {state === 'checking' && <FunLoading context="mailbox" className="py-0" />}
        {state === 'found' && (
          <>
            <p className="vc-fade-up text-sm font-semibold text-foreground">You’ve got mail from {senderNickname ?? 'someone'}!</p>
            <p className="text-xs text-muted-foreground">
              {opening ? 'Opening…' : <>Tap the envelope to open it{holdLeft !== undefined && <> · within <span className="font-medium tabular-nums">{clock(holdLeft)}</span></>}</>}
            </p>
            {onPutBack && !opening && (
              <button type="button" onClick={onPutBack} className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Not now — put it back
              </button>
            )}
          </>
        )}
        {state === 'empty' && <p className="vc-fade-up text-sm text-muted-foreground max-w-xs">{emptyLine}</p>}
      </div>
    </div>
  );
}
