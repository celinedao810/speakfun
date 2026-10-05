"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseContinuousSpeechOptions<T> {
  /**
   * Called with a base64 WAV clip each time the learner finishes a phrase, plus
   * whatever onSpeechStart returned when that phrase began.
   */
  onUtterance: (base64Wav: string, atStart: T) => void;
  /**
   * Called the moment a phrase begins. Its return value travels with that clip, so
   * callers can snapshot what was on screen when the learner started speaking.
   */
  onSpeechStart?: () => T;
  /** Clips with less voiced audio than this are discarded as noise. */
  minVoicedMs?: number;
  /** Pause length that ends an utterance. */
  silenceMs?: number;
  /** Hard cut so one long ramble can't hold up scoring. */
  maxUtteranceMs?: number;
}

/** ~43ms per frame at 48kHz. */
const FRAME_SIZE = 2048;
const CALIBRATION_MS = 400;
/** Absolute floor so a dead-silent room can't drive the threshold to ~0. */
const FLOOR_MIN = 0.012;
const NOISE_MULTIPLIER = 2.5;
/** Consecutive over-threshold frames needed to open an utterance. */
const ONSET_FRAMES = 2;
/**
 * Audio kept from before the onset is detected. Without it a clip starts ~100ms
 * into the word, and a short word like "bug" arrives as "-ug".
 */
const PRE_ROLL_MS = 400;
/** Plenty for speech, and keeps a few-second clip well under 200KB. */
const TARGET_SAMPLE_RATE = 16_000;

interface Utterance<T> {
  frames: Float32Array[];
  durationMs: number;
  voicedMs: number;
  silenceMs: number;
  atStart: T;
}

/** Downsamples mono float frames to 16kHz and packs them as a base64 16-bit PCM WAV. */
function encodeWavBase64(frames: Float32Array[], inputRate: number): string {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const input = new Float32Array(total);
  let offset = 0;
  for (const f of frames) { input.set(f, offset); offset += f.length; }

  const outRate = Math.min(inputRate, TARGET_SAMPLE_RATE);
  const step = inputRate / outRate;
  const outLen = Math.floor(total / step);
  const view = new DataView(new ArrayBuffer(44 + outLen * 2));

  const writeStr = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + outLen * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);         // fmt chunk size
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true); // byte rate
  view.setUint16(32, 2, true);          // block align
  view.setUint16(34, 16, true);         // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, outLen * 2, true);

  // Average each window of input samples — a cheap low-pass that avoids aliasing.
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(Math.floor((i + 1) * step), total);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }

  const bytes = new Uint8Array(view.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Keeps one mic stream open and emits a separate WAV clip per spoken phrase.
 *
 * Raw samples are read straight off the stream (ScriptProcessorNode) instead of
 * starting a MediaRecorder at each onset: a recorder only starts once speech is
 * detected, so it always clipped the start of the word. Here the last PRE_ROLL_MS
 * of audio is always buffered and becomes the head of each clip. WAV also sidesteps
 * Safari, whose MediaRecorder produces mp4 rather than webm.
 */
export function useContinuousSpeech<T = void>({
  onUtterance,
  onSpeechStart,
  minVoicedMs = 120,
  silenceMs = 700,
  maxUtteranceMs = 6_000,
}: UseContinuousSpeechOptions<T>) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const sampleRateRef = useRef(48_000);

  const utteranceRef = useRef<Utterance<T> | null>(null);
  const preRollRef = useRef<{ frames: Float32Array[]; ms: number }>({ frames: [], ms: 0 });
  const onsetCountRef = useRef(0);

  /**
   * 1 while a phrase is being captured. Clips are encoded and handed to onUtterance
   * synchronously when the phrase ends, so callers polling this before declaring an
   * exercise over can't miss a phrase spoken just as the last block resolves.
   */
  const busyRef = useRef(0);

  const thresholdRef = useRef(FLOOR_MIN);
  const calibrationRef = useRef<{ samples: number[]; ms: number } | null>(null);
  const levelRef = useRef(0);

  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const onSpeechStartRef = useRef(onSpeechStart);
  onSpeechStartRef.current = onSpeechStart;

  /** Ends the current phrase, emitting it unless it's too little speech to be a word. */
  const closeUtterance = useCallback((emit: boolean) => {
    const utt = utteranceRef.current;
    utteranceRef.current = null;
    onsetCountRef.current = 0;
    setIsSpeaking(false);
    if (!utt) return;
    try {
      if (emit && utt.voicedMs >= minVoicedMs) {
        onUtteranceRef.current(encodeWavBase64(utt.frames, sampleRateRef.current), utt.atStart);
      }
    } finally {
      busyRef.current = 0;
    }
  }, [minVoicedMs]);

  const onFrame = useCallback((input: Float32Array) => {
    // The browser reuses the input buffer between callbacks, so keep a copy.
    const frame = new Float32Array(input);
    const frameMs = (frame.length / sampleRateRef.current) * 1000;

    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);

    // Smooth for display only — gating uses the raw value.
    levelRef.current = levelRef.current * 0.7 + Math.min(rms * 4, 1) * 0.3;
    setLevel(levelRef.current);

    const utt = utteranceRef.current;
    if (!utt) {
      const preRoll = preRollRef.current;
      preRoll.frames.push(frame);
      preRoll.ms += frameMs;
      while (preRoll.frames.length > 1 && preRoll.ms - frameMs >= PRE_ROLL_MS) {
        preRoll.frames.shift();
        preRoll.ms -= frameMs;
      }

      // Calibrate the noise floor from the room's first moments.
      const cal = calibrationRef.current;
      if (cal) {
        cal.samples.push(rms);
        cal.ms += frameMs;
        if (cal.ms >= CALIBRATION_MS) {
          const floor = cal.samples.reduce((a, b) => a + b, 0) / cal.samples.length;
          thresholdRef.current = Math.max(floor * NOISE_MULTIPLIER, FLOOR_MIN);
          calibrationRef.current = null;
        }
        return;
      }

      // Wait for a sustained onset so a single click doesn't open a clip.
      onsetCountRef.current = rms > thresholdRef.current ? onsetCountRef.current + 1 : 0;
      if (onsetCountRef.current >= ONSET_FRAMES) {
        utteranceRef.current = {
          frames: preRoll.frames,  // already ends with the onset frames
          durationMs: 0,
          voicedMs: onsetCountRef.current * frameMs,
          silenceMs: 0,
          atStart: onSpeechStartRef.current?.() as T,
        };
        preRollRef.current = { frames: [], ms: 0 };
        busyRef.current = 1;
        setIsSpeaking(true);
      }
      return;
    }

    utt.frames.push(frame);
    utt.durationMs += frameMs;
    if (rms > thresholdRef.current) {
      utt.voicedMs += frameMs;
      utt.silenceMs = 0;
    } else {
      utt.silenceMs += frameMs;
    }
    if (utt.silenceMs >= silenceMs || utt.durationMs >= maxUtteranceMs) closeUtterance(true);
  }, [closeUtterance, silenceMs, maxUtteranceMs]);

  // The audio callback is wired once per start(); go through a ref so a re-created
  // onFrame (changed options) can't leave a stale gate running.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  /** Closes the mic. flush: emit a phrase that was mid-capture rather than drop it. */
  const release = useCallback((flush: boolean) => {
    closeUtterance(flush);

    nodesRef.current.forEach(n => n.disconnect());
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});

    preRollRef.current = { frames: [], ms: 0 };
    levelRef.current = 0;
    setLevel(0);
    setIsListening(false);
  }, [closeUtterance]);

  /** Stop button: the learner may have just spoken, so their last phrase still counts. */
  const stop = useCallback(() => release(true), [release]);

  /** Returns false if the mic could not be opened, so callers can hold off. */
  const start = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctor();
      audioCtxRef.current = ctx;
      // iOS starts the context suspended; the tap that called start() unlocks it.
      if (ctx.state === 'suspended') await ctx.resume();
      sampleRateRef.current = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessorNode is deprecated but runs everywhere without a separate
      // worklet module, and unlike rAF/setInterval it isn't throttled in a
      // background tab. It only fires while connected to the destination, so route
      // it through a muted gain to avoid playing the mic back.
      const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      processor.onaudioprocess = e => onFrameRef.current(e.inputBuffer.getChannelData(0));
      source.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);
      nodesRef.current = [source, processor, mute];

      calibrationRef.current = { samples: [], ms: 0 };
      thresholdRef.current = FLOOR_MIN;
      onsetCountRef.current = 0;
      preRollRef.current = { frames: [], ms: 0 };

      setIsListening(true);
      return true;
    } catch (err) {
      console.error('[useContinuousSpeech] Mic unavailable:', err);
      setError('Không thể truy cập micro. Hãy cho phép quyền micro rồi thử lại.');
      release(false);
      return false;
    }
  }, [release]);

  // Release the mic if the learner navigates away mid-exercise — nothing left to score.
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => () => releaseRef.current(false), []);

  return { isListening, isSpeaking, level, error, start, stop, busyRef };
}
