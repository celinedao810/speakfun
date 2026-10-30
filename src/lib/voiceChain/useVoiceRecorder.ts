"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceRecording {
  blob: Blob;
  url: string;
  base64: string;
  mimeType: string;
  durationSeconds: number;
}

export type RecorderState = 'idle' | 'starting' | 'recording' | 'done';

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * MediaRecorder hook for Voice Chain: can be started programmatically (auto-start
 * after the think countdown) and stops itself at `maxSeconds`.
 */
export function useVoiceRecorder(maxSeconds: number) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current) return false;
    setError(null);
    setRecording(null);
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      discardRef.current = false;

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        clearTimer();
        stream.getTracks().forEach(t => t.stop());
        recorderRef.current = null;
        const durationSeconds = Math.min(maxSeconds, (performance.now() - startedAtRef.current) / 1000);
        if (discardRef.current || chunksRef.current.length === 0) {
          setState('idle');
          return;
        }
        const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        const base64 = await blobToBase64(blob);
        setRecording({ blob, url: URL.createObjectURL(blob), base64, mimeType: type, durationSeconds });
        setState('done');
      };

      rec.start(250);
      startedAtRef.current = performance.now();
      setElapsed(0);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        const secs = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(Math.min(maxSeconds, secs));
        if (secs >= maxSeconds) stop();
      }, 200);
      return true;
    } catch (err) {
      console.error('[voice-chain] Recording failed:', err);
      recorderRef.current = null;
      setError('Microphone not available. Please allow microphone access and try again.');
      setState('idle');
      return false;
    }
  }, [maxSeconds, stop]);

  /** Throws away the current take (or cancels an ongoing one). */
  const discard = useCallback(() => {
    discardRef.current = true;
    if (recorderRef.current) stop();
    setRecording(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setElapsed(0);
    setState('idle');
  }, [stop]);

  useEffect(() => () => {
    clearTimer();
    discardRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  return { state, elapsed, recording, error, start, stop, discard };
}
