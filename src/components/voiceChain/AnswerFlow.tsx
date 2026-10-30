"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Flag, Headphones, Loader2, Mic, Play, RotateCcw, X } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { useVoiceRecorder } from '@/lib/voiceChain/useVoiceRecorder';
import type { ClaimView, LetterResponse, MyMessage, SubmitResponse } from '@/lib/voiceChain/types';
import LetterPad from './LetterPad';
import RecordingControls from './RecordingControls';
import ScoreCard from './ScoreCard';
import { clock, ghostBtn, primaryBtn, secondaryBtn, useCountdown, useSecondsUntil } from './shared';

type Phase = 'listen' | 'letter' | 'think' | 'record' | 'scoring' | 'result' | 'rejected' | 'expired';

interface AnswerFlowProps {
  claim: ClaimView;
  /** `again` = pick up another message straight away. */
  onExit: (again?: boolean) => void;
}

/**
 * Answering a picked-up message:
 * listen → pick the letter (listening check) → short think countdown → record (auto-starts) → scored.
 */
export default function AnswerFlow({ claim: initialClaim, onExit }: AnswerFlowProps) {
  const settings = VOICE_CHAIN.modes[initialClaim.mode];
  const [claim, setClaim] = useState(initialClaim);
  const letterKnown = claim.letterOk || claim.letterRevealed;

  const [phase, setPhase] = useState<Phase>('listen');
  const [playsLeft, setPlaysLeft] = useState<number>(settings.plays);
  const [playing, setPlaying] = useState(false);
  const [wrongLetters, setWrongLetters] = useState<string[]>([]);
  const [letterNote, setLetterNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MyMessage | null>(null);
  const [rejection, setRejection] = useState<Extract<SubmitResponse, { accepted: false }> | null>(null);
  const [thinkRound, setThinkRound] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heardOnceRef = useRef(false);
  const recorder = useVoiceRecorder(VOICE_CHAIN.maxSeconds);
  const claimLeft = useSecondsUntil(claim.claimExpiresAt);

  // ---- Claim timer --------------------------------------------------------------
  useEffect(() => {
    if (claimLeft > 0) return;
    if (phase === 'listen' || phase === 'letter' || phase === 'think' || phase === 'rejected') {
      audioRef.current?.pause();
      setPhase('expired');
    }
    // While recording the take is still accepted for a short grace period, so let it finish.
  }, [claimLeft, phase]);

  // ---- Listening ------------------------------------------------------------------
  const play = () => {
    const audio = audioRef.current;
    if (!audio || playing || playsLeft <= 0) return;
    audio.currentTime = 0;
    audio.play().then(() => {
      setPlaying(true);
      setPlaysLeft(p => p - 1);
    }).catch(() => setError('Could not play the message. Check your sound and try again.'));
  };

  const onEnded = () => {
    setPlaying(false);
    if (!heardOnceRef.current) {
      heardOnceRef.current = true;
      setPhase(letterKnown ? 'think' : 'letter');
    }
  };

  // ---- Letter check ---------------------------------------------------------------
  const applyLetter = useCallback((res: LetterResponse) => {
    setClaim(c => ({
      ...c,
      letterOk: res.letterOk,
      letterRevealed: res.letterRevealed,
      letter: res.letter,
      letterAttemptsLeft: res.attemptsLeft,
    }));
  }, []);

  const pickLetter = async (letter: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await vcFetch<LetterResponse>('letter', letter ? { messageId: claim.messageId, letter } : { messageId: claim.messageId, giveUp: true });
      applyLetter(res);
      if (res.correct) {
        setLetterNote(`Correct — “${res.letter?.toUpperCase()}”!`);
        audioRef.current?.pause();
        setPhase('think');
      } else if (res.letterRevealed) {
        setLetterNote(`The letter was “${res.letter?.toUpperCase()}” (−${VOICE_CHAIN.revealPenalty} points).`);
        audioRef.current?.pause();
        setPhase('think');
      } else if (letter) {
        setWrongLetters(w => [...w, letter]);
        setLetterNote(`Not “${letter.toUpperCase()}”. Listen to the last word again — ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'try' : 'tries'} left.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const letterTimeLeft = useCountdown(
    settings.letterSeconds,
    phase === 'letter' && settings.letterSeconds !== null && !busy,
    () => { void pickLetter(null); },
  );

  // ---- Think → record ------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    audioRef.current?.pause();
    setError(null);
    setPhase('record');
    const ok = await recorder.start();
    if (!ok) setPhase('think');
  }, [recorder]);

  const thinkLeft = useCountdown(settings.thinkSeconds, phase === 'think' && !recorder.error, () => { void startRecording(); }, thinkRound);

  // ---- Submit ------------------------------------------------------------------------
  const submit = useCallback(async () => {
    const take = recorder.recording;
    if (!take) return;
    setPhase('scoring');
    setError(null);
    try {
      const res = await vcFetch<SubmitResponse>('submit', {
        parentId: claim.messageId,
        audioBase64: take.base64,
        mimeType: take.mimeType,
        durationSeconds: take.durationSeconds,
      });
      if (res.accepted) {
        setResult(res.message);
        setPhase('result');
      } else {
        setRejection(res);
        if (res.takesLeft !== null) setClaim(c => ({ ...c, takesLeft: res.takesLeft as number }));
        setPhase('rejected');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (/no longer yours|no more tries/i.test(msg)) {
        setError(msg);
        setPhase('expired');
      } else {
        setError(msg);
        setPhase('rejected');
        setRejection(null);
      }
    }
  }, [recorder.recording, claim.messageId]);

  useEffect(() => {
    if (phase === 'record' && recorder.state === 'done' && recorder.recording) void submit();
  }, [phase, recorder.state, recorder.recording, submit]);

  const retry = () => {
    recorder.discard();
    setRejection(null);
    setError(null);
    setThinkRound(r => r + 1);
    setPhase('think');
  };

  // ---- Leave ---------------------------------------------------------------------------
  const giveUp = async () => {
    setBusy(true);
    recorder.discard();
    audioRef.current?.pause();
    await vcFetch('release', { messageId: claim.messageId }).catch(() => undefined);
    onExit();
  };

  const report = async () => {
    if (!window.confirm('Report this message as inappropriate? It will be removed from the game.')) return;
    setBusy(true);
    recorder.discard();
    audioRef.current?.pause();
    await vcFetch('report', { messageId: claim.messageId }).catch(() => undefined);
    onExit();
  };

  const canLeave = phase === 'listen' || phase === 'letter' || phase === 'think';
  const letter = claim.letter?.toUpperCase();

  return (
    <div className="space-y-5">
      {claim.audioUrl && <audio ref={audioRef} src={claim.audioUrl} preload="auto" onEnded={onEnded} className="hidden" />}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">Message from {claim.senderNickname}</p>
        <span className="text-xs text-muted-foreground">Link #{claim.chainPosition} · {Math.round(claim.durationSeconds)}s</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{settings.label}</span>
        {phase !== 'result' && phase !== 'expired' && (
          <span className={`ml-auto flex items-center gap-1 text-xs ${claimLeft < 60 ? 'text-destructive' : 'text-muted-foreground'}`}>
            <Clock className="w-3.5 h-3.5" />{clock(claimLeft)}
          </span>
        )}
      </div>

      {!claim.audioUrl && phase !== 'expired' && (
        <p className="text-sm text-destructive">This recording is no longer available. Give it up and pick another one.</p>
      )}

      {/* Listen */}
      {(phase === 'listen' || phase === 'letter') && claim.audioUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={play} disabled={playing || playsLeft <= 0} className={phase === 'listen' ? primaryBtn : secondaryBtn}>
            {playing ? <><Headphones className="w-4 h-4 animate-pulse" />Playing…</>
              : phase === 'listen' ? <><Play className="w-4 h-4" />Play message</>
              : <><RotateCcw className="w-4 h-4" />Replay</>}
          </button>
          <span className="text-xs text-muted-foreground">
            {playsLeft} {playsLeft === 1 ? 'play' : 'plays'} left
          </span>
          {phase === 'listen' && (
            <p className="w-full text-xs text-muted-foreground">
              Listen carefully to the <strong>last word</strong> — your answer must start with its last letter and continue the conversation.
            </p>
          )}
        </div>
      )}

      {/* Letter */}
      {phase === 'letter' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">What is the last letter of the last word?</p>
            {settings.letterSeconds !== null && (
              <span className={`text-xs font-medium ${letterTimeLeft <= 3 ? 'text-destructive' : 'text-muted-foreground'}`}>{letterTimeLeft}s</span>
            )}
          </div>
          <LetterPad onPick={l => void pickLetter(l)} disabled={busy} wrong={wrongLetters} />
          <div className="flex items-center gap-3">
            {letterNote && <p className="text-xs text-muted-foreground">{letterNote}</p>}
            <button type="button" className={`${ghostBtn} ml-auto`} onClick={() => void pickLetter(null)} disabled={busy}>
              Show me the letter (−{VOICE_CHAIN.revealPenalty})
            </button>
          </div>
        </div>
      )}

      {/* Think */}
      {phase === 'think' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {letterNote && <p className="text-xs text-muted-foreground">{letterNote}</p>}
          <p className="text-sm text-muted-foreground">Start your answer with</p>
          <p className="text-5xl font-bold text-primary">{letter}</p>
          <p className="text-sm text-muted-foreground">and continue what {claim.senderNickname} said.</p>
          {recorder.error ? (
            <>
              <p className="text-xs text-destructive">{recorder.error}</p>
              <button type="button" className={primaryBtn} onClick={() => void startRecording()}><Mic className="w-4 h-4" />Try again</button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Recording starts in <strong className="text-foreground">{thinkLeft}s</strong></p>
              <button type="button" className={primaryBtn} onClick={() => void startRecording()}><Mic className="w-4 h-4" />Start now</button>
            </>
          )}
          {claim.takesLeft < VOICE_CHAIN.maxTakes && (
            <p className="text-xs text-muted-foreground">{claim.takesLeft} {claim.takesLeft === 1 ? 'try' : 'tries'} left</p>
          )}
        </div>
      )}

      {/* Record */}
      {phase === 'record' && (
        <div className="space-y-2">
          <p className="text-center text-sm text-muted-foreground">Start with “<strong className="text-primary">{letter}</strong>”</p>
          <RecordingControls state={recorder.state} elapsed={recorder.elapsed} onStop={recorder.stop} />
        </div>
      )}

      {/* Scoring */}
      {phase === 'scoring' && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />Listening to your answer…
        </div>
      )}

      {/* Rejected */}
      {phase === 'rejected' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{rejection?.error ?? error}</p>
          {rejection?.transcript && <p className="text-xs text-muted-foreground italic">We heard: “{rejection.transcript}”</p>}
          {rejection && rejection.takesLeft === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">No more tries — the message went back to the pool for someone else.</p>
              <button type="button" className={primaryBtn} onClick={() => onExit()}>Done</button>
            </>
          ) : rejection ? (
            <button type="button" className={primaryBtn} onClick={retry}>
              <RotateCcw className="w-4 h-4" />Record again ({claim.takesLeft} {claim.takesLeft === 1 ? 'try' : 'tries'} left)
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" className={primaryBtn} onClick={() => setPhase('record')}>Send again</button>
              <button type="button" className={secondaryBtn} onClick={retry}>Record again</button>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {phase === 'result' && result && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-emerald-600">Sent! Your answer is now waiting for the next person.</p>
          <ScoreCard message={result} showNextLetter />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} onClick={() => onExit(true)}>Pick up another</button>
            <button type="button" className={secondaryBtn} onClick={() => onExit()}>Done</button>
          </div>
        </div>
      )}

      {/* Expired */}
      {phase === 'expired' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{error ?? 'Time’s up — this message went back to the pool for someone else.'}</p>
          <button type="button" className={primaryBtn} onClick={() => onExit()}>OK</button>
        </div>
      )}

      {error && phase !== 'rejected' && phase !== 'expired' && <p className="text-xs text-destructive">{error}</p>}

      {canLeave && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <button type="button" className={ghostBtn} onClick={() => void giveUp()} disabled={busy}><X className="w-3.5 h-3.5" />Give up</button>
          <button type="button" className={`${ghostBtn} ml-auto`} onClick={() => void report()} disabled={busy}><Flag className="w-3.5 h-3.5" />Report</button>
        </div>
      )}
    </div>
  );
}
