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

const NOTHING_RECORDED = 'We couldn’t hear anything from your microphone. Tap “Record again” to try once more.';

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
 *
 * iPhones only reliably grant the microphone when it is requested during a tap, so
 * call `prepare()` from the tap that leads to an automatic start: the mic opens
 * then, and `start()` later records on that already-open stream.
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
  /** Microphone opened ahead of time by prepare(), waiting for start(). */
  const preparedRef = useRef<Promise<MediaStream | null> | null>(null);
  /** Bumped on every start(); a slower, older start() that resolves later gives up. */
  const startTokenRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  /** Opens the microphone now (call it synchronously inside a tap handler). */
  const prepare = useCallback((): Promise<boolean> => {
    if (!preparedRef.current) {
      preparedRef.current = navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        console.error('[voice-chain] Microphone failed:', err);
        preparedRef.current = null;
        setError('Microphone not available. Please allow microphone access and try again.');
        return null;
      });
    }
    return preparedRef.current.then(Boolean);
  }, []);

  /** Closes a microphone opened by prepare() that won't be used (e.g. wrong letter, replaying). */
  const release = useCallback(() => {
    const pending = preparedRef.current;
    preparedRef.current = null;
    void pending?.then(stream => stream?.getTracks().forEach(t => t.stop()));
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current) return false;
    const token = ++startTokenRef.current;
    setError(null);
    setRecording(null);
    setState('starting');
    try {
      // Use the microphone opened by prepare() if it's still live; otherwise ask now
      const pending = preparedRef.current;
      preparedRef.current = null;
      const prepared = pending ? await pending : null;
      // iOS can leave an early-opened mic "live" but muted (silent): only reuse a working one
      const usable = prepared?.getAudioTracks().some(t => t.readyState === 'live' && !t.muted);
      if (prepared && !usable) prepared.getTracks().forEach(t => t.stop());
      const stream = usable && prepared ? prepared : await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== startTokenRef.current || recorderRef.current) {
        // A newer start() (e.g. the "tap to start" fallback) took over
        stream.getTracks().forEach(t => t.stop());
        return false;
      }
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      discardRef.current = false;

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onerror = e => {
        // The recorder stops itself after an error; onstop keeps whatever was captured
        console.error('[voice-chain] Recorder error:', e);
      };
      // The mic was cut off (call, Siri, screen lock…): finish the take with what we have
      stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => stop()));
      rec.onstop = async () => {
        clearTimer();
        stream.getTracks().forEach(t => t.stop());
        recorderRef.current = null;
        const durationSeconds = Math.min(maxSeconds, (performance.now() - startedAtRef.current) / 1000);
        if (discardRef.current) {
          setState('idle');
          return;
        }
        if (chunksRef.current.length === 0) {
          console.warn('[voice-chain] Recording ended with no audio data');
          setError(NOTHING_RECORDED);
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
      if (token !== startTokenRef.current) return false; // a newer start() is in charge
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
    void preparedRef.current?.then(stream => stream?.getTracks().forEach(t => t.stop()));
  }, []);

  return { state, elapsed, recording, error, start, stop, discard, prepare, release };
}
