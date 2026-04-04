"use client";

import {useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, CheckCircle, AlertCircle, RotateCcw, ChevronRight } from 'lucide-react';
import { VocabExerciseItem, StructureExerciseItem, FreeTalkScoringResult } from '@/lib/types';
import { scoreFreeTalk } from '@/lib/ai/aiClient';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';

const RECORD_DURATION = 45;
const BASELINE = 8;

interface Exercise3FreeTalkProps {
  vocabWords: VocabExerciseItem[];
  structures: StructureExerciseItem[];
  topic?: string;
  onComplete: (score: number) => void;
}

type Phase = 'READY' | 'RECORDING' | 'SCORING' | 'FEEDBACK';

export default function Exercise3FreeTalk({ vocabWords, structures, topic, onComplete }: Exercise3FreeTalkProps) {
  const [phase, setPhase] = useState<Phase>('READY');
  const [timeLeft, setTimeLeft] = useState(RECORD_DURATION);
  const [bestScore, setBestScore] = useState(0);
  const [result, setResult] = useState<FreeTalkScoringResult | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown during recording
  useEffect(() => {
    if (phase !== 'RECORDING') return;

    setTimeLeft(RECORD_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          // Auto-stop — AudioRecorder maxDuration handles the actual stop
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const handleRecordingComplete = useCallback(async (base64: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingUrl(`data:audio/webm;base64,${base64}`);
    setPhase('SCORING');

    try {
      const r = await scoreFreeTalk(
        base64,
        vocabWords.map(v => v.word),
        structures.map(s => s.pattern),
        topic,
      );
      setBestScore(prev => Math.max(prev, r.score));
      setResult(r);
      setPhase('FEEDBACK');
    } catch {
      setPhase('READY');
    }
  }, [vocabWords, structures]);

  const handleStartRecording = () => {
    setPhase('RECORDING');
    setAttemptCount(a => a + 1);
  };

  const handleReRecord = () => {
    setResult(null);
    setRecordingUrl(null);
    setTimeLeft(RECORD_DURATION);
    setPhase('READY');
  };

  const handleContinue = () => {
    onComplete(bestScore);
  };

  const timerColor = timeLeft > 15 ? 'text-green-400' : timeLeft > 5 ? 'text-amber-400' : 'text-red-400';
  const passedBaseline = (result?.score ?? 0) >= BASELINE;

  // ── READY phase ──
  if (phase === 'READY') {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl mb-3">
            <Mic className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-1">Free Talk · 45 seconds</h3>
          <p className="text-sm text-muted-foreground">
            Speak freely for 45 seconds using the words and structures below.
            {attemptCount > 0 && bestScore < BASELINE && (
              <span className="block mt-1 text-amber-600 font-medium">
                Best so far: {bestScore.toFixed(1)}/10 — keep going, you need {BASELINE}/10 to pass!
              </span>
            )}
          </p>
        </div>

        {/* Today's topic */}
        {topic && (
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">Today&apos;s topic</p>
            <p className="text-sm text-emerald-900 font-medium leading-relaxed">{topic}</p>
          </div>
        )}
        {!topic && (
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-xs text-emerald-600">Preparing your topic...</p>
          </div>
        )}

        {/* Guidance: vocab words */}
        {vocabWords.length > 0 && (
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Vocabulary to use</p>
            <div className="flex flex-wrap gap-2">
              {vocabWords.map(v => (
                <span key={v.id} className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-1 rounded-full font-medium">
                  {v.word}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Guidance: structures */}
        {structures.length > 0 && (
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Structures to use</p>
            <div className="space-y-1.5">
              {structures.map(s => (
                <div key={s.id} className="flex items-start gap-2">
                  <span className="text-violet-400 mt-0.5">·</span>
                  <span className="text-xs text-violet-800 font-mono">{s.pattern}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStartRecording}
          className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-base"
        >
          <Mic className="w-5 h-5" />
          Start Recording
        </button>
      </div>
    );
  }

  // ── RECORDING phase ──
  if (phase === 'RECORDING') {
    return (
      <div className="space-y-5">
        {/* Big countdown timer */}
        <div className="text-center py-4">
          <div className={`text-5xl sm:text-7xl font-black tabular-nums ${timerColor} transition-colors`}>
            {timeLeft}
          </div>
          <p className="text-sm text-muted-foreground mt-1">seconds remaining</p>
        </div>

        {/* Topic reminder */}
        {topic && (
          <div className="bg-emerald-50/70 rounded-xl px-4 py-2.5 border border-emerald-100">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Topic</p>
            <p className="text-xs text-emerald-800 leading-relaxed">{topic}</p>
          </div>
        )}

        {/* Guidance remains visible */}
        {vocabWords.length > 0 && (
          <div className="bg-indigo-50/70 rounded-xl px-4 py-3 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">Vocabulary</p>
            <div className="flex flex-wrap gap-1.5">
              {vocabWords.map(v => (
                <span key={v.id} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                  {v.word}
                </span>
              ))}
            </div>
          </div>
        )}
        {structures.length > 0 && (
          <div className="bg-violet-50/70 rounded-xl px-4 py-3 border border-violet-100">
            <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-1.5">Structures</p>
            <div className="space-y-1">
              {structures.map(s => (
                <p key={s.id} className="text-xs text-violet-700 font-mono">· {s.pattern}</p>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-emerald-600">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Recording...</span>
          </div>
          <AudioRecorder
            ref={recorderRef}
            onRecordingComplete={handleRecordingComplete}
            isProcessing={false}
            maxDuration={RECORD_DURATION + 1}
          />
        </div>
      </div>
    );
  }

  // ── SCORING phase ──
  if (phase === 'SCORING') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing your speech...</p>
      </div>
    );
  }

  // ── FEEDBACK phase ──
  if (phase === 'FEEDBACK' && result) {
    const scoreColor = passedBaseline ? 'text-green-600' : 'text-red-600';
    const scoreBg = passedBaseline ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';

    return (
      <div className="space-y-4">
        {/* Score */}
        <div className={`rounded-2xl p-5 border text-center ${scoreBg}`}>
          {passedBaseline
            ? <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            : <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          }
          <p className={`text-3xl sm:text-4xl font-black ${scoreColor}`}>{result.score.toFixed(1)}<span className="text-xl font-semibold text-muted-foreground">/10</span></p>
          <p className={`text-sm font-semibold mt-1 ${passedBaseline ? 'text-green-700' : 'text-red-600'}`}>
            {passedBaseline ? 'Baseline reached!' : `Baseline not reached (${BASELINE}/10 required)`}
          </p>
          {bestScore > result.score && (
            <p className="text-xs text-muted-foreground mt-1">Best attempt: {bestScore.toFixed(1)}/10</p>
          )}
        </div>

        {/* Transcription */}
        {result.transcription && (
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Your speech</p>
            <p className="text-sm text-foreground italic">"{result.transcription}"</p>
          </div>
        )}

        {/* Recording playback */}
        {recordingUrl && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Your recording:</p>
            <audio controls src={recordingUrl} className="w-full h-9 rounded-lg" />
          </div>
        )}

        {/* Feedback breakdown */}
        <div className="space-y-3">
          {result.pronunciationErrors.length > 0 && (
            <div className="bg-red-50 rounded-xl px-4 py-3 border border-red-100">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">Pronunciation errors</p>
              <ul className="space-y-1">
                {result.pronunciationErrors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700 flex gap-1.5"><span>·</span>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {result.grammarErrors.length > 0 && (
            <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Grammar errors</p>
              <ul className="space-y-1">
                {result.grammarErrors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span>·</span>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {result.vocabularyFeedback && (
            <div className="bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Vocabulary</p>
              <p className="text-xs text-indigo-700">{result.vocabularyFeedback}</p>
            </div>
          )}
          {result.deliveryFeedback && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Delivery</p>
              <p className="text-xs text-slate-600">{result.deliveryFeedback}</p>
            </div>
          )}
          {result.feedback && (
            <div className="bg-muted/40 rounded-xl px-4 py-3 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Overall feedback</p>
              <p className="text-xs text-foreground">{result.feedback}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {!passedBaseline && (
            <button
              onClick={handleReRecord}
              className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Re-record to reach baseline
            </button>
          )}
          <button
            onClick={handleContinue}
            className={`w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
              passedBaseline
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {passedBaseline ? <CheckCircle className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            {passedBaseline ? 'Continue' : 'Skip & Continue'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
