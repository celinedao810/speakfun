"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Flag, Headphones, History, Mic, Play, RotateCcw, Send, X } from 'lucide-react';
import { chainLabel, vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { useVoiceRecorder } from '@/lib/voiceChain/useVoiceRecorder';
import type { ClaimView, LetterResponse, MyMessage, SubmitResponse } from '@/lib/voiceChain/types';
import LetterPad from './LetterPad';
import PaperPlane from './PaperPlane';
import RecordingControls from './RecordingControls';
import ScoreCard from './ScoreCard';
import { clock, ghostBtn, primaryBtn, secondaryBtn, useCountdown, useSecondsUntil } from './shared';

type Phase = 'listen' | 'letter' | 'think' | 'record' | 'scoring' | 'result' | 'rejected' | 'expired';

interface AnswerFlowProps {
  claim: ClaimView;
  /** `again` = pick up another message straight away. */
  onExit: (again?: boolean) => void;
  /** Called once the answer is accepted. */
  onSent?: () => void;
}

/**
 * Answering a picked-up message:
 * listen → pick the letter (listening check) → short think countdown → record (auto-starts) → scored.
 */
export default function AnswerFlow({ claim: initialClaim, onExit, onSent }: AnswerFlowProps) {
  const settings = VOICE_CHAIN.modes[initialClaim.mode];
  const [claim, setClaim] = useState(initialClaim);
  const letterKnown = claim.letterOk || claim.letterRevealed;

  // Coming back without plays left and without the letter: go straight to picking it from memory.
  const [phase, setPhase] = useState<Phase>(
    !letterKnown && initialClaim.playsLeft <= 0 ? 'letter' : 'listen',
  );
  // Counted on the server, so it survives leaving and coming back.
  const [playsLeft, setPlaysLeft] = useState<number>(initialClaim.playsLeft);
  const [playing, setPlaying] = useState(false);
  const [wrongLetters, setWrongLetters] = useState<string[]>([]);
  /** Letter being checked, and the confirmed one (shown green for a moment). */
  const [pendingLetter, setPendingLetter] = useState<string | null>(null);
  const [correctLetter, setCorrectLetter] = useState<string | null>(null);
  const [letterNote, setLetterNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MyMessage | null>(null);
  const [rejection, setRejection] = useState<Extract<SubmitResponse, { accepted: false }> | null>(null);
  const [thinkRound, setThinkRound] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Already listened before leaving? Then finishing a replay doesn't move the flow on by itself.
  const heardOnceRef = useRef(initialClaim.playsLeft < settings.plays);
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
    // Start playback inside the tap itself (iOS blocks audio started after an await);
    // the server counts the play in parallel and stops it if none were left.
    audio.currentTime = 0;
    audio.play().then(() => setPlaying(true))
      .catch(() => setError(e => e ?? 'Could not play the message. Check your sound and try again.'));
    setPlaysLeft(p => p - 1);
    vcFetch<{ allowed: boolean; playsLeft: number; claimExpiresAt: string }>('play', { messageId: claim.messageId })
      .then(res => {
        setPlaysLeft(res.playsLeft);
        // Listening doesn't use up answer time: the server added the message's length back
        if (res.claimExpiresAt) setClaim(c => ({ ...c, claimExpiresAt: res.claimExpiresAt }));
        if (!res.allowed) {
          audio.pause();
          setPlaying(false);
        }
      })
      .catch(err => {
        audio.pause();
        setPlaying(false);
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        if (/no longer yours/i.test(msg)) { setError(msg); setPhase('expired'); }
      });
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
    setPendingLetter(letter);
    // Shows the right letter in green for a moment before moving on to the countdown
    const moveOn = async (right: string | null) => {
      audioRef.current?.pause();
      setPendingLetter(null);
      setCorrectLetter(right);
      await new Promise(resolve => setTimeout(resolve, 700));
      setPhase('think');
    };
    try {
      const res = await vcFetch<LetterResponse>('letter', letter ? { messageId: claim.messageId, letter } : { messageId: claim.messageId, giveUp: true });
      applyLetter(res);
      if (res.correct) {
        setLetterNote(`Correct — “${res.letter?.toUpperCase()}”!`);
        await moveOn(res.letter);
      } else if (res.letterRevealed) {
        if (letter) setWrongLetters(w => [...w, letter]);
        setLetterNote(`The letter was “${res.letter?.toUpperCase()}” (−${VOICE_CHAIN.revealPenalty} points).`);
        await moveOn(res.letter);
      } else if (letter) {
        recorder.release(); // not recording yet — close the mic while they listen again
        setWrongLetters(w => [...w, letter]);
        const tries = `${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'try' : 'tries'} left`;
        setLetterNote(`Not “${letter.toUpperCase()}”. ${playsLeft > 0 ? `Listen to the last word again — ${tries}.` : `${tries[0].toUpperCase()}${tries.slice(1)}.`}`);
      }
    } catch (err) {
      recorder.release();
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPendingLetter(null);
      setBusy(false);
    }
  };

  const letterTimeLeft = useCountdown(
    settings.letterSeconds,
    // Paused while the message is (re)playing; a fresh countdown starts when it ends
    phase === 'letter' && settings.letterSeconds !== null && !busy && !playing,
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

  // If the microphone hasn't started 3s after the countdown (iPhones can hold back a
  // request that isn't part of a tap), offer a button: tapping it always works.
  const [slowStart, setSlowStart] = useState(false);
  useEffect(() => {
    if (phase !== 'record' || recorder.state !== 'starting') { setSlowStart(false); return; }
    const timer = window.setTimeout(() => setSlowStart(true), 3000);
    return () => window.clearTimeout(timer);
  }, [phase, recorder.state]);

  // A mic opened in advance must not stay on once the message is no longer ours
  const releaseMic = recorder.release;
  useEffect(() => { if (phase === 'expired') releaseMic(); }, [phase, releaseMic]);

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
        onSent?.();
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
    recorder.prepare();
    setRejection(null);
    setError(null);
    setThinkRound(r => r + 1);
    setPhase('think');
  };

  // ---- Leave ---------------------------------------------------------------------------
  const giveUp = async () => {
    setBusy(true);
    recorder.discard();
    recorder.release();
    audioRef.current?.pause();
    await vcFetch('release', { messageId: claim.messageId }).catch(() => undefined);
    onExit();
  };

  const report = async () => {
    if (!window.confirm('Report this message as inappropriate? It will be removed from the game.')) return;
    setBusy(true);
    recorder.discard();
    recorder.release();
    audioRef.current?.pause();
    await vcFetch('report', { messageId: claim.messageId }).catch(() => undefined);
    onExit();
  };

  const canLeave = phase === 'listen' || phase === 'letter' || phase === 'think';
  const letter = claim.letter?.toUpperCase();

  return (
    <div className="space-y-5">
      {claim.audioUrl && (
        <audio ref={audioRef} src={claim.audioUrl} preload="auto" onEnded={onEnded} className="hidden"
          onError={() => {
            setPlaying(false);
            setError('This message can’t be played on your device — give it up and pick up another one.');
          }} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">Message from {claim.senderNickname}</p>
        <span className="text-xs text-muted-foreground">
          {claim.chainPosition > 1 ? chainLabel(claim.chainPosition) : 'Starts a new chain'} · {Math.round(claim.durationSeconds)}s
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{settings.label}</span>
        {phase !== 'result' && phase !== 'expired' && (
          <span className={`ml-auto flex items-center gap-1 text-xs ${claimLeft < 60 ? 'text-destructive' : 'text-muted-foreground'}`}>
            <Clock className="w-3.5 h-3.5" />{clock(claimLeft)}
          </span>
        )}
      </div>

      {/* Coming back to a message picked up earlier */}
      {claim.resumed && (phase === 'listen' || phase === 'letter' || phase === 'think') && (
        <div className="flex gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs text-accent-foreground">
          <History className="w-4 h-4 shrink-0" />
          <p>
            <strong>Welcome back.</strong> This is the message from {claim.senderNickname} you picked up earlier
            in {settings.label} mode — not a new one. The clock kept running while you were away.{' '}
            {playsLeft > 0
              ? `You can still play it ${playsLeft} more ${playsLeft === 1 ? 'time' : 'times'}.`
              : 'You’ve used all your plays, so you can’t listen to it again.'}
            {letter && ` Your letter is “${letter}”.`}
          </p>
        </div>
      )}

      {!claim.audioUrl && phase !== 'expired' && (
        <p className="text-sm text-destructive">This recording is no longer available. Give it up and pick another one.</p>
      )}

      {/* Listen */}
      {(phase === 'listen' || (phase === 'letter' && playsLeft > 0)) && claim.audioUrl && (
        <div className="flex flex-wrap items-center gap-3">
          {playsLeft > 0 && (
            <button type="button" onClick={play} disabled={playing}
              className={phase === 'listen' && !heardOnceRef.current ? primaryBtn : secondaryBtn}>
              {playing ? <><Headphones className="w-4 h-4 animate-pulse" />Playing…</>
                : heardOnceRef.current ? <><RotateCcw className="w-4 h-4" />Replay</>
                : <><Play className="w-4 h-4" />Play message</>}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {playsLeft > 0 ? `${playsLeft} ${playsLeft === 1 ? 'play' : 'plays'} left` : 'No plays left'}
          </span>
          {/* Resumed after listening: move on without having to play it again */}
          {phase === 'listen' && heardOnceRef.current && (
            <button type="button" className={primaryBtn} disabled={playing}
              onClick={() => {
                audioRef.current?.pause();
                if (letterKnown) recorder.prepare();
                setPhase(letterKnown ? 'think' : 'letter');
              }}>
              {letterKnown ? <><Mic className="w-4 h-4" />Continue to answer</> : 'Pick the letter'}
            </button>
          )}
          {phase === 'listen' && !heardOnceRef.current && (
            <p className="w-full text-xs text-muted-foreground">
              Listen carefully to the <strong>last word</strong> — your answer must start with its last letter and continue the conversation.
            </p>
          )}
          {playsLeft > 0 && (
            <p className="w-full text-[11px] text-muted-foreground">The clock doesn’t count the time the message is playing.</p>
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
          {playsLeft <= 0 && !letterNote && (
            <p className="text-xs text-muted-foreground">No plays left — pick the letter from memory, or show it.</p>
          )}
          <LetterPad
            letters={claim.letterChoices}
            onPick={l => { recorder.prepare(); void pickLetter(l); }}
            pending={pendingLetter}
            correct={correctLetter}
            wrong={wrongLetters}
          />
          <div className="flex items-center gap-3">
            {letterNote && <p className="text-xs text-muted-foreground">{letterNote}</p>}
            <button type="button" className={`${ghostBtn} ml-auto`} onClick={() => { recorder.prepare(); void pickLetter(null); }} disabled={busy}>
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
          {slowStart && recorder.state === 'starting' && (
            <div className="flex justify-center">
              <button type="button" className={primaryBtn} onClick={() => void recorder.start()}>
                <Mic className="w-4 h-4" />Tap to start recording
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scoring */}
      {phase === 'scoring' && <PaperPlane />}

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
          <p className="vc-fade-up flex items-center gap-2 text-sm font-medium text-emerald-600">
            <Send className="w-4 h-4" />Delivered! Your answer is now waiting for the next person.
          </p>
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
