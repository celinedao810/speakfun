"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, AlertCircle, RotateCcw, ChevronRight, MicOff } from 'lucide-react';
import { VocabExerciseItem, StructureExerciseItem, FreeTalkScoringResult } from '@/lib/types';
import { scoreFreeTalk, generateAnswerGuide } from '@/lib/ai/aiClient';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';

const RECORD_DURATION = 45;
const BASELINE = 7;
const MAX_ATTEMPTS_BEFORE_SKIP = 5;

interface Exercise3FreeTalkProps {
  vocabWords: VocabExerciseItem[];
  structures: StructureExerciseItem[];
  topic?: string;
  onComplete: (score: number) => void;
}

type Phase = 'READY' | 'SCORING' | 'FEEDBACK';

export default function Exercise3FreeTalk({ vocabWords, structures, topic, onComplete }: Exercise3FreeTalkProps) {
  const [phase, setPhase] = useState<Phase>('READY');
  const [timeLeft, setTimeLeft] = useState(RECORD_DURATION);
  const [isRecording, setIsRecording] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [result, setResult] = useState<FreeTalkScoringResult | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<{ attempt: number; score: number }[]>([]);
  const [answerGuide, setAnswerGuide] = useState<string[] | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);

  const recorderRef = useRef<AudioRecorderHandle>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown only while actively recording
  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(RECORD_DURATION);
      return;
    }
    setTimeLeft(RECORD_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // Fetch answer guide once the topic is ready
  useEffect(() => {
    if (!topic) return;
    setGuideLoading(true);
    generateAnswerGuide(topic, vocabWords.map(v => v.word), structures.map(s => s.pattern))
      .then(bullets => { if (bullets?.length) setAnswerGuide(bullets); })
      .catch(() => {})
      .finally(() => setGuideLoading(false));
  }, [topic]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
    if (recording) setAttemptCount(a => a + 1);
  }, []);

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
      setAttemptHistory(prev => [...prev, { attempt: prev.length + 1, score: r.score }]);
      setResult(r);
      setPhase('FEEDBACK');
    } catch {
      setPhase('READY');
    }
  }, [vocabWords, structures, topic]);

  const handleReRecord = () => {
    setResult(null);
    setRecordingUrl(null);
    setTimeLeft(RECORD_DURATION);
    setIsRecording(false);
    recorderRef.current?.reset();
    setPhase('READY');
  };

  const handleContinue = () => {
    // Passed: use best score. Skipping after max attempts: use latest score.
    const scoreToSave = passedBaseline ? bestScore : (result?.score ?? 0);
    onComplete(scoreToSave);
  };

  const timerColor = timeLeft > 15 ? 'text-green-400' : timeLeft > 5 ? 'text-amber-400' : 'text-red-400';
  const passedBaseline = (result?.score ?? 0) >= BASELINE;
  const canSkip = attemptCount >= MAX_ATTEMPTS_BEFORE_SKIP;

  // ── READY phase (includes live recording state) ──
  if (phase === 'READY') {
    return (
      <div className="space-y-4">
        {/* Countdown — only visible while recording */}
        {isRecording && (
          <div className="text-center py-2">
            <div className={`text-5xl sm:text-6xl font-black tabular-nums ${timerColor} transition-colors`}>
              {timeLeft}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">seconds remaining</p>
          </div>
        )}

        {/* Header — only when not recording */}
        {!isRecording && (
          <div className="text-center">
            <h3 className="text-lg font-bold text-foreground mb-1">Free Talk · 45 seconds</h3>
            <p className="text-sm text-muted-foreground">
              Speak freely for 45 seconds using the words and structures below.
              {attemptCount > 0 && bestScore < BASELINE && (
                <span className="block mt-1 text-amber-600 font-medium">
                  Best so far: {bestScore.toFixed(1)}/10 — you need {BASELINE}/10 to pass ({attemptCount}/{MAX_ATTEMPTS_BEFORE_SKIP} attempts used)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Today's topic */}
        {topic && (
          <div className={`bg-emerald-50 rounded-xl border border-emerald-200 ${isRecording ? 'px-4 py-2.5' : 'p-4'}`}>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Today&apos;s topic</p>
            <p className="text-sm text-emerald-900 font-medium leading-relaxed">{topic}</p>
          </div>
        )}
        {!topic && !isRecording && (
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-xs text-emerald-600">Preparing your topic...</p>
          </div>
        )}

        {/* Tip note — only in READY state, not while recording */}
        {!isRecording && (
          <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Tip:</strong> The topic above is just a suggestion — you don&apos;t have to follow it exactly.
              Try to use <strong>at least one word</strong> or <strong>one structure</strong> from the lists below in your answer.
            </p>
          </div>
        )}

        {/* Answer guide */}
        {(guideLoading || answerGuide) && !isRecording && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Answer guide</p>
            {guideLoading && !answerGuide ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                Preparing a suggested outline…
              </div>
            ) : answerGuide && (
              <ol className="space-y-2">
                {answerGuide.map((bullet, i) => {
                  // Split label tags like [vocab: "word"] or [structure: "..."] from the text
                  const parts = bullet.split(/(\[(?:vocab|structure):[^\]]+\])/g);
                  return (
                    <li key={i} className="flex gap-2 text-xs text-emerald-900 leading-relaxed">
                      <span className="shrink-0 font-bold text-emerald-500">{i + 1}.</span>
                      <span>
                        {parts.map((part, j) => {
                          if (/^\[(?:vocab|structure):/.test(part)) {
                            return (
                              <span key={j} className="inline-block mx-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">
                                {part.slice(1, -1)}
                              </span>
                            );
                          }
                          return <span key={j}>{part}</span>;
                        })}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="text-[10px] text-emerald-500 mt-2 italic">This is just a suggested outline — feel free to answer in your own way.</p>
          </div>
        )}

        {/* Vocabulary */}
        {vocabWords.length > 0 && (
          <div className={`bg-indigo-50 rounded-xl border border-indigo-100 ${isRecording ? 'px-3 py-2' : 'p-4'}`}>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Vocabulary to use</p>
            <div className="flex flex-wrap gap-1.5">
              {vocabWords.map(v => (
                <span key={v.id} className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  {v.word}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Structures */}
        {structures.length > 0 && (
          <div className={`bg-violet-50 rounded-xl border border-violet-100 ${isRecording ? 'px-3 py-2' : 'p-4'}`}>
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1.5">Structures to use</p>
            <div className="space-y-1">
              {structures.map(s => (
                <div key={s.id} className="flex items-start gap-2">
                  <span className="text-violet-400 mt-0.5">·</span>
                  <span className="text-xs text-violet-800 font-mono">{s.pattern}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mic / recording controls */}
        <div className="flex flex-col items-center gap-1 pt-1">
          {isRecording && (
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Recording...</span>
            </div>
          )}
          <AudioRecorder
            ref={recorderRef}
            onRecordingComplete={handleRecordingComplete}
            onRecordingStateChange={handleRecordingStateChange}
            isProcessing={false}
            maxDuration={RECORD_DURATION + 1}
            hideStop
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
          <p className={`text-3xl sm:text-4xl font-black ${scoreColor}`}>
            {result.score.toFixed(1)}<span className="text-xl font-semibold text-muted-foreground">/10</span>
          </p>
          <p className={`text-sm font-semibold mt-1 ${passedBaseline ? 'text-green-700' : 'text-red-600'}`}>
            {passedBaseline ? 'Passed!' : `Need ${BASELINE}/10 to pass`}
          </p>
          {passedBaseline && attemptHistory.length > 0 && (
            <p className="text-xs text-green-600 mt-1">Passed on attempt {attemptHistory.length}</p>
          )}
          {bestScore > result.score && (
            <p className="text-xs text-muted-foreground mt-1">Best attempt: {bestScore.toFixed(1)}/10</p>
          )}
        </div>

        {/* Attempt history pills */}
        {attemptHistory.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {attemptHistory.map(h => (
              <span key={h.attempt} className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                h.score >= BASELINE ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                #{h.attempt}: {h.score.toFixed(1)}
              </span>
            ))}
          </div>
        )}

        {/* Transcription */}
        {result.transcription && (
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Your speech</p>
            <p className="text-sm text-foreground italic">&ldquo;{result.transcription}&rdquo;</p>
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
              Try again
            </button>
          )}
          {passedBaseline && (
            <button
              onClick={handleContinue}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {!passedBaseline && canSkip && (
            <button
              onClick={handleContinue}
              className="w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 bg-muted text-muted-foreground hover:bg-muted/80"
            >
              <MicOff className="w-4 h-4" />
              Skip & Continue (attempt {attemptCount}/{MAX_ATTEMPTS_BEFORE_SKIP})
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
