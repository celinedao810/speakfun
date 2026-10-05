"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseContinuousSpeechOptions<T> {
  /**
   * Called with a base64 webm clip each time the learner finishes a phrase, plus
   * whatever onSpeechStart returned when that phrase began.
   */
  onUtterance: (base64: string, atStart: T) => void;
  /**
   * Called the moment a phrase begins. Its return value travels with that clip, so
   * callers can snapshot what was on screen when the learner started speaking.
   */
  onSpeechStart?: () => T;
  /** Clips shorter than this are discarded as noise. */
  minSpeechMs?: number;
  /** Pause length that ends an utterance. */
  silenceMs?: number;
  /** Hard cut so one long ramble can't hold up scoring. */
  maxUtteranceMs?: number;
}

const POLL_MS = 50;
const CALIBRATION_MS = 400;
/** Absolute floor so a dead-silent room can't drive the threshold to ~0. */
const FLOOR_MIN = 0.012;
const NOISE_MULTIPLIER = 2.5;
/** Consecutive over-threshold polls needed to open an utterance. */
const ONSET_POLLS = 2;

/**
 * Keeps one mic stream open and emits a separate clip per spoken phrase.
 *
 * A fresh MediaRecorder is created per utterance on the *same* MediaStream rather
 * than slicing one long recording: webm only carries its header in the first chunk,
 * so mid-stream slices aren't independently decodable. Stopping a MediaRecorder
 * doesn't kill the stream (only track.stop() does), so this costs no re-prompt and
 * no stream-acquisition latency between phrases.
 */
export function useContinuousSpeech<T = void>({
  onUtterance,
  onSpeechStart,
  minSpeechMs = 300,
  silenceMs = 700,
  maxUtteranceMs = 6_000,
}: UseContinuousSpeechOptions<T>) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pollRef = useRef<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechStartRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const onsetCountRef = useRef(0);

  /**
   * >0 while a clip is being recorded or decoded but hasn't reached onUtterance yet.
   * Callers poll this before declaring an exercise over, so a phrase spoken just as
   * the last block resolves still gets counted.
   */
  const busyRef = useRef(0);

  const thresholdRef = useRef(FLOOR_MIN);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibratingRef = useRef(true);
  const levelRef = useRef(0);

  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const onSpeechStartRef = useRef(onSpeechStart);
  onSpeechStartRef.current = onSpeechStart;

  /** Reads the analyser once and returns RMS in 0–1. */
  const readRms = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  /** Ends the current utterance; its onstop handler decides whether to emit it. */
  const closeUtterance = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    silenceStartRef.current = null;
    onsetCountRef.current = 0;
    setIsSpeaking(false);
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const openUtterance = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch (err) {
      console.error('[useContinuousSpeech] MediaRecorder failed:', err);
      return;
    }

    // Chunks live in the closure, not a ref — each utterance owns its own buffer
    // so a clip that's still decoding can't be clobbered by the next one.
    const localChunks: Blob[] = [];
    const startedAt = performance.now();
    const atStart = onSpeechStartRef.current?.() as T;

    rec.ondataavailable = e => { if (e.data.size > 0) localChunks.push(e.data); };
    rec.onstop = () => {
      const durationMs = performance.now() - startedAt;
      if (localChunks.length === 0 || durationMs < minSpeechMs) {
        busyRef.current--;
        return;
      }
      const blob = new Blob(localChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          if (base64) onUtteranceRef.current(base64, atStart);
        } finally {
          busyRef.current--;  // only after the consumer has taken it
        }
      };
      reader.onerror = () => { busyRef.current--; };
      reader.readAsDataURL(blob);
    };

    try {
      rec.start();
    } catch (err) {
      console.error('[useContinuousSpeech] MediaRecorder.start failed:', err);
      onsetCountRef.current = 0;  // wait for a fresh onset rather than retrying every poll
      return;
    }
    // Count the clip only once it's really recording — onstop is what decrements,
    // and it never fires for a recorder that failed to start.
    busyRef.current++;
    speechStartRef.current = startedAt;
    silenceStartRef.current = null;
    recorderRef.current = rec;
    setIsSpeaking(true);
  }, [minSpeechMs]);

  const poll = useCallback(() => {
    const rms = readRms();

    // Smooth for display only — gating uses the raw value.
    levelRef.current = levelRef.current * 0.7 + Math.min(rms * 4, 1) * 0.3;
    setLevel(levelRef.current);

    // Calibrate the noise floor from the room's first moments.
    if (calibratingRef.current) {
      calibrationSamplesRef.current.push(rms);
      if (calibrationSamplesRef.current.length * POLL_MS >= CALIBRATION_MS) {
        const samples = calibrationSamplesRef.current;
        const floor = samples.reduce((a, b) => a + b, 0) / samples.length;
        thresholdRef.current = Math.max(floor * NOISE_MULTIPLIER, FLOOR_MIN);
        calibratingRef.current = false;
      }
      return;
    }

    const now = performance.now();
    const speaking = rms > thresholdRef.current;

    if (!recorderRef.current) {
      // Idle: wait for a sustained onset so a single click doesn't open a clip.
      onsetCountRef.current = speaking ? onsetCountRef.current + 1 : 0;
      if (onsetCountRef.current >= ONSET_POLLS) openUtterance();
      return;
    }

    if (now - speechStartRef.current >= maxUtteranceMs) {
      closeUtterance();
      return;
    }

    if (speaking) {
      silenceStartRef.current = null;
    } else {
      if (silenceStartRef.current === null) silenceStartRef.current = now;
      else if (now - silenceStartRef.current >= silenceMs) closeUtterance();
    }
  }, [readRms, openUtterance, closeUtterance, maxUtteranceMs, silenceMs]);

  // The interval captures poll once; go through a ref so a re-created poll
  // (changed options) can't leave a stale gate running.
  const pollFnRef = useRef(poll);
  pollFnRef.current = poll;

  const stop = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // Let any in-flight clip through — the learner may have just spoken.
    const hadRecorder = !!recorderRef.current;
    closeUtterance();

    const stream = streamRef.current;
    const ctx = audioCtxRef.current;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;

    const teardown = () => {
      stream?.getTracks().forEach(t => t.stop());
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    };
    // MediaRecorder.stop() flushes asynchronously; killing the tracks in the same
    // turn can truncate the learner's last word. Give onstop a moment to fire.
    if (hadRecorder) window.setTimeout(teardown, 250);
    else teardown();

    levelRef.current = 0;
    setLevel(0);
    setIsSpeaking(false);
    setIsListening(false);
  }, [closeUtterance]);

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
      // iOS starts the context suspended; the tap that called start() unlocks it.
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      calibrationSamplesRef.current = [];
      calibratingRef.current = true;
      thresholdRef.current = FLOOR_MIN;
      onsetCountRef.current = 0;
      silenceStartRef.current = null;

      setIsListening(true);
      // setInterval, not rAF: rAF throttles in a backgrounded tab, which would
      // silently stop the gate mid-exercise.
      pollRef.current = window.setInterval(() => pollFnRef.current(), POLL_MS);
      return true;
    } catch (err) {
      console.error('[useContinuousSpeech] Mic unavailable:', err);
      setError('Không thể truy cập micro. Hãy cho phép quyền micro rồi thử lại.');
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      return false;
    }
  }, []);

  // Release the mic if the learner navigates away mid-exercise.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), []);

  return { isListening, isSpeaking, level, error, start, stop, busyRef };
}
