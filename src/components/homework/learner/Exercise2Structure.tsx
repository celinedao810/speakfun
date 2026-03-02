"use client";

import React, { useState, useCallback } from 'react';
import { MessageCircle, Timer, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { StructureExerciseItem, StructureScoringResult } from '@/lib/types';
import { scoreStructureReading, scoreOwnSentence } from '@/lib/ai/aiClient';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder from '@/components/AudioRecorder';

interface Exercise2StructureProps {
  structures: StructureExerciseItem[];
  timedMode: boolean;
  onComplete: (score: number) => void;
}

type StructureStep = 'READ_INTRO' | 'READ_RECORDING' | 'READ_RESULT' | 'OWN_INTRO' | 'OWN_RECORDING' | 'OWN_RESULT';

interface StructureAttempt {
  structureId: string;
  readResult: StructureScoringResult | null;
  ownResult: StructureScoringResult | null;
}

export default function Exercise2Structure({ structures, timedMode, onComplete }: Exercise2StructureProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<StructureStep>('READ_INTRO');
  const [readResult, setReadResult] = useState<StructureScoringResult | null>(null);
  const [ownResult, setOwnResult] = useState<StructureScoringResult | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [attempts, setAttempts] = useState<StructureAttempt[]>([]);
  const [readRecordingUrl, setReadRecordingUrl] = useState<string | null>(null);
  const [ownRecordingUrl, setOwnRecordingUrl] = useState<string | null>(null);

  const currentStructure = structures[currentIndex];
  const totalStructures = structures.length;
  const isLast = currentIndex === totalStructures - 1;
  const progressPct = Math.round(((currentIndex * 2 + (step.startsWith('OWN') ? 1 : 0)) / (totalStructures * 2)) * 100);

  const handleReadRecording = useCallback(async (base64: string) => {
    setReadRecordingUrl(`data:audio/webm;base64,${base64}`);
    setIsScoring(true);
    try {
      const result = await scoreStructureReading(currentStructure.exampleSentence, base64, timedMode);
      result.structureItemId = currentStructure.id;
      setReadResult(result);
      setTotalScore(s => s + result.pointsEarned);
      setStep('READ_RESULT');
    } finally {
      setIsScoring(false);
    }
  }, [currentStructure, timedMode]);

  const handleOwnRecording = useCallback(async (base64: string) => {
    setOwnRecordingUrl(`data:audio/webm;base64,${base64}`);
    setIsScoring(true);
    try {
      const result = await scoreOwnSentence(currentStructure.pattern, base64, timedMode);
      result.structureItemId = currentStructure.id;
      setOwnResult(result);
      setTotalScore(s => s + result.pointsEarned);
      setAttempts(prev => [...prev, { structureId: currentStructure.id, readResult, ownResult: result }]);
      setStep('OWN_RESULT');
    } finally {
      setIsScoring(false);
    }
  }, [currentStructure, timedMode, readResult]);

  const handleNextStructure = () => {
    if (isLast) {
      onComplete(totalScore);
      return;
    }
    setReadResult(null);
    setOwnResult(null);
    setReadRecordingUrl(null);
    setOwnRecordingUrl(null);
    setStep('READ_INTRO');
    setCurrentIndex(i => i + 1);
  };

  if (!currentStructure) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/15 p-1.5 rounded-lg">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Sentence Structure</span>
        </div>
        <div className="flex items-center gap-2">
          {timedMode && (
            <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <Timer className="w-3.5 h-3.5" />
              Timed (10s)
            </div>
          )}
          <span className="text-xs text-muted-foreground/60">{currentIndex + 1}/{totalStructures}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Score */}
      <div className="text-center">
        <span className="text-2xl font-bold text-primary">{totalScore.toFixed(1)}</span>
        <span className="text-muted-foreground/60 text-sm ml-1">pts</span>
      </div>

      {/* Structure card */}
      <div className="bg-muted/40 rounded-2xl p-6 border border-border">
        <div className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-1">{currentStructure.topic}</div>
        <p className="text-base font-semibold text-foreground mb-1">{currentStructure.pattern}</p>
        <p className="text-xs text-muted-foreground mb-3">{currentStructure.explanation}</p>
        <div className="bg-card/70 rounded-xl px-4 py-3">
          <p className="text-sm text-muted-foreground italic">"{currentStructure.exampleSentence}"</p>
          <div className="mt-2 flex justify-start">
            <AudioPlayer text={currentStructure.exampleSentence} label="Play example" />
          </div>
        </div>
      </div>

      {/* Step-specific UI */}
      {(step === 'READ_INTRO' || step === 'READ_RECORDING') && (
        <div className="space-y-3">
          <div className="bg-primary/10 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-foreground mb-1">Step 1: Read the example</p>
            <p className="text-xs text-primary">
              Record yourself reading the sentence above.
              {timedMode ? ' You have 10 seconds for full marks.' : ''}
            </p>
          </div>
          <div className="flex justify-center">
            <AudioRecorder
              onRecordingComplete={handleReadRecording}
              isProcessing={isScoring}
              maxDuration={timedMode ? 12 : undefined}
            />
          </div>
        </div>
      )}

      {step === 'READ_RESULT' && readResult && (
        <div className="space-y-3">
          <div className={`rounded-xl px-4 py-3 ${readResult.pointsEarned > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              {readResult.pointsEarned > 0 ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-semibold ${readResult.pointsEarned > 0 ? 'text-green-700' : 'text-red-600'}`}>
                +{readResult.pointsEarned.toFixed(1)}pt · {readResult.penaltiesApplied} error(s)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{readResult.feedback}</p>
            {readRecordingUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground/60 mb-1">Your recording:</p>
                <audio controls src={readRecordingUrl} className="w-full h-9 rounded-lg" />
              </div>
            )}
          </div>
          <button
            onClick={() => setStep('OWN_INTRO')}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition flex items-center justify-center gap-2"
          >
            <ChevronRight className="w-4 h-4" />
            Continue to Step 2
          </button>
        </div>
      )}

      {(step === 'OWN_INTRO' || step === 'OWN_RECORDING') && (
        <div className="space-y-3">
          <div className="bg-amber-50 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-amber-800 mb-1">Step 2: Make your own sentence</p>
            <p className="text-xs text-amber-600">
              Create your own sentence using the structure: <span className="font-medium">"{currentStructure.pattern}"</span>
              {timedMode ? ' You have 10 seconds for full marks.' : ''}
            </p>
          </div>
          <div className="flex justify-center">
            <AudioRecorder
              onRecordingComplete={handleOwnRecording}
              isProcessing={isScoring}
              maxDuration={timedMode ? 12 : undefined}
            />
          </div>
        </div>
      )}

      {step === 'OWN_RESULT' && ownResult && (
        <div className="space-y-3">
          <div className={`rounded-xl px-4 py-3 ${ownResult.grammarCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              {ownResult.grammarCorrect ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-semibold ${ownResult.grammarCorrect ? 'text-green-700' : 'text-red-600'}`}>
                +{ownResult.pointsEarned.toFixed(1)}pt
                {!ownResult.grammarCorrect && ' · Grammar incorrect'}
              </span>
            </div>
            {ownResult.transcription && (
              <p className="text-xs text-muted-foreground italic mb-1">"{ownResult.transcription}"</p>
            )}
            <p className="text-xs text-muted-foreground">{ownResult.feedback}</p>
            {ownRecordingUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground/60 mb-1">Your recording:</p>
                <audio controls src={ownRecordingUrl} className="w-full h-9 rounded-lg" />
              </div>
            )}
          </div>
          <button
            onClick={handleNextStructure}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition flex items-center justify-center gap-2"
          >
            {isLast ? (
              <><CheckCircle className="w-4 h-4" /> Finish Sentences</>
            ) : (
              <><ChevronRight className="w-4 h-4" /> Next Structure</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
