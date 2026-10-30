"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWavBase64 } from '@/lib/audio/useContinuousSpeech';

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
  // Apple browsers (all iOS browsers are WebKit) decode their own MP4/AAC most reliably;
  // elsewhere WebM/Opus is the native format. Either way the take is converted to WAV below.
  const apple = typeof navigator !== 'undefined' && navigator.vendor?.startsWith('Apple');
  const order = apple
    ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return order.find(type => MediaRecorder.isTypeSupported(type));
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
 * Re-encodes a recording as 16 kHz mono WAV. Recorder output (especially WebM) often
 * has no duration and doesn't play from a URL on iPhones; WAV plays in every browser
 * and is a supported Gemini audio type.
 */
async function toWav(blob: Blob): Promise<{ blob: Blob; base64: string; durationSeconds: number }> {
  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio not available');
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    const base64 = encodeWavBase64([mono], buffer.sampleRate);
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    return { blob: new Blob([bytes], { type: 'audio/wav' }), base64, durationSeconds: buffer.duration };
  } finally {
    void ctx.close();
  }
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
        let take: VoiceRecording;
        try {
          const wav = await toWav(blob);
          take = {
            blob: wav.blob,
            url: URL.createObjectURL(wav.blob),
            base64: wav.base64,
            mimeType: 'audio/wav',
            durationSeconds: Math.min(maxSeconds, wav.durationSeconds || durationSeconds),
          };
        } catch (err) {
          // Couldn't convert: send the original recording rather than failing
          console.warn('[voice-chain] WAV conversion failed, sending original audio:', err);
          take = { blob, url: URL.createObjectURL(blob), base64: await blobToBase64(blob), mimeType: type, durationSeconds };
        }
        if (discardRef.current) {
          URL.revokeObjectURL(take.url);
          setState('idle');
          return;
        }
        setRecording(take);
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
