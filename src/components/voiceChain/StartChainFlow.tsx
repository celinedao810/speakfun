"use client";

import React, { useState } from 'react';
import { Loader2, Mic, Send, Trash2 } from 'lucide-react';
import { vcFetch } from '@/lib/voiceChain/client';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { useVoiceRecorder } from '@/lib/voiceChain/useVoiceRecorder';
import type { MyMessage, SubmitResponse } from '@/lib/voiceChain/types';
import RecordingControls from './RecordingControls';
import ScoreCard from './ScoreCard';
import { primaryBtn, secondaryBtn } from './shared';

interface StartChainFlowProps {
  startersLeft: number;
  onExit: () => void;
}

/** Records a new chain starter. The take can be discarded before sending, never edited after. */
export default function StartChainFlow({ startersLeft, onExit }: StartChainFlowProps) {
  const recorder = useVoiceRecorder(VOICE_CHAIN.maxSeconds);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MyMessage | null>(null);

  const send = async () => {
    const take = recorder.recording;
    if (!take) return;
    setSending(true);
    setError(null);
    try {
      const res = await vcFetch<SubmitResponse>('submit', {
        audioBase64: take.base64,
        mimeType: take.mimeType,
        durationSeconds: take.durationSeconds,
      });
      if (res.accepted) {
        setResult(res.message);
      } else {
        setError(res.error + (res.transcript ? ` We heard: “${res.transcript}”` : ''));
        recorder.discard();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-emerald-600">Your chain has started! The first person to pick it up will answer it.</p>
        <ScoreCard message={result} showNextLetter />
        <button type="button" className={primaryBtn} onClick={onExit}>Done</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Start a new chain</p>
        <p className="text-xs text-muted-foreground mt-1">
          Say something that invites an answer — a question, a short story, an opinion — for up to {VOICE_CHAIN.maxSeconds} seconds.
          The next person must start with the last letter of your last word, so finish clearly.
          You can start {startersLeft} more {startersLeft === 1 ? 'chain' : 'chains'} today.
        </p>
      </div>

      {(recorder.state === 'recording' || recorder.state === 'starting') && (
        <RecordingControls state={recorder.state} elapsed={recorder.elapsed} onStop={recorder.stop} />
      )}

      {recorder.state === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={() => { setError(null); void recorder.start(); }}>
            <Mic className="w-4 h-4" />Start recording
          </button>
          <button type="button" className={secondaryBtn} onClick={onExit}>Cancel</button>
        </div>
      )}

      {recorder.state === 'done' && recorder.recording && (
        <div className="space-y-3">
          <audio src={recorder.recording.url} controls className="w-full h-10" />
          <p className="text-xs text-muted-foreground">Listen back if you like. Once sent, it can’t be changed.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} onClick={() => void send()} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Scoring…' : 'Send'}
            </button>
            <button type="button" className={secondaryBtn} onClick={recorder.discard} disabled={sending}>
              <Trash2 className="w-4 h-4" />Record again
            </button>
          </div>
        </div>
      )}

      {(error || recorder.error) && <p className="text-sm text-destructive">{error ?? recorder.error}</p>}
    </div>
  );
}
