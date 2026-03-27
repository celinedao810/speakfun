"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageCircle, Bot, User, Lightbulb, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { ConversationExercise, ConversationTurnScoringResult, StructureExerciseItem, StructureAttemptAudit } from '@/lib/types';
import { scoreConversationTurn } from '@/lib/ai/aiClient';
import AudioRecorder from '@/components/AudioRecorder';

interface Exercise3ConversationProps {
  item: ConversationExercise;
  structures: StructureExerciseItem[];
  learnerRole: string;
  learnerName?: string;
  onComplete: (score: number, structureAttempts: StructureAttemptAudit[]) => void;
}

interface CompletedTurn {
  index: number;
  result: ConversationTurnScoringResult;
}

export default function Exercise3Conversation({ item, structures, learnerRole, learnerName, onComplete }: Exercise3ConversationProps) {
  // Index into item.turns of the turn currently being shown/acted on
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedTurns, setCompletedTurns] = useState<CompletedTurn[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  // After an AI turn is displayed, show a "Next" button before advancing
  const [waitingForNext, setWaitingForNext] = useState(true);
  const [totalScore, setTotalScore] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const structureMap = new Map(structures.map(s => [s.id, s]));
  const resolveName = (text: string) =>
    learnerName ? text.replace(/\[Learner'?s?\s*Name\]/gi, learnerName) : text;
  // Normalize turn indices to array position (Gemini may generate 1-based or arbitrary indices).
  // Also repair bad speaker values: LEARNER turns always have hint or targetStructureId; AI turns never do.
  const turns = item.turns.map((t, i) => ({
    ...t,
    index: i,
    speaker: (t.speaker === 'LEARNER' || !!(t.hint || t.targetStructureId)) ? 'LEARNER' : 'AI',
  })) as typeof item.turns;
  const currentTurn = turns[currentIndex] ?? null;
  const isFinished = currentIndex >= turns.length;

  // Visible turns: everything up to and including currentIndex
  const visibleTurns = turns.slice(0, currentIndex + 1);

  // Scroll to bottom on each advance
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentIndex, completedTurns.length]);

  // When we land on an AI turn, show it and wait for learner to tap Next
  useEffect(() => {
    if (currentTurn?.speaker === 'AI') {
      setWaitingForNext(true);
    }
  }, [currentIndex, currentTurn]);

  const advance = useCallback(() => {
    setHintVisible(false);
    setWaitingForNext(false);
    setCurrentIndex(i => i + 1);
  }, []);

  const handleRecording = useCallback(async (base64: string) => {
    if (!currentTurn || currentTurn.speaker !== 'LEARNER') return;
    setIsScoring(true);
    setHintVisible(false);
    try {
      const result = await scoreConversationTurn(
        currentTurn.text,
        currentTurn.hint ?? '',
        base64,
      );
      setCompletedTurns(prev => [...prev, { index: currentTurn.index, result }]);
      setTotalScore(prev => prev + result.pointsEarned);
      // After scoring, wait for learner to tap Next before advancing
      setWaitingForNext(true);
    } finally {
      setIsScoring(false);
    }
  }, [currentTurn]);

  const getResult = (index: number) =>
    completedTurns.find(ct => ct.index === index)?.result;

  const learnerTurns = turns.filter(t => t.speaker === 'LEARNER');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="bg-violet-100 p-1.5 rounded-lg">
          <MessageCircle className="w-4 h-4 text-violet-600" />
        </div>
        <span className="text-sm font-semibold text-slate-700">Conversation Practice</span>
      </div>

      {/* Scenario + roles */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-4 border border-violet-100 space-y-1">
        <p className="text-xs text-violet-500 font-medium uppercase tracking-wide">Scenario</p>
        <p className="text-sm text-slate-700">{item.scenario}</p>
        <div className="flex gap-4 mt-2 pt-2 border-t border-violet-100">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">{item.aiRole}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs text-violet-600 font-medium">
              You: {learnerRole || item.learnerRole}
            </span>
          </div>
        </div>
      </div>

      {/* Conversation — one turn at a time */}
      <div className="space-y-3">
        {visibleTurns.map(turn => {
          const result = getResult(turn.index);
          const isCurrentTurn = turn.index === currentIndex;

          /* ── AI turn ── */
          if (turn.speaker === 'AI') {
            return (
              <div key={turn.index} className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
                    <p className="text-xs text-slate-400 mb-0.5">{item.aiRole}</p>
                    <p className="text-sm text-slate-800">{resolveName(turn.text)}</p>
                  </div>
                </div>
                {/* Next button only on the current AI turn */}
                {isCurrentTurn && waitingForNext && !isFinished && (
                  <div className="flex justify-end pr-2">
                    <button
                      onClick={advance}
                      className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-full transition"
                    >
                      Tiếp theo <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          /* ── LEARNER turn: completed ── */
          if (result) {
            const pts = result.pointsEarned;
            const isGood = pts >= 8;
            const isMid = pts >= 4 && pts < 8;
            return (
              <div key={turn.index} className="space-y-2">
                {/* Learner bubble */}
                <div className="flex gap-2 items-end justify-end">
                  <div className={`rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] ${
                    isGood ? 'bg-violet-600 text-white' : isMid ? 'bg-amber-100 border border-amber-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <p className={`text-xs mb-0.5 ${isGood ? 'text-violet-200' : 'text-slate-400'}`}>You said</p>
                    <p className={`text-sm ${isGood ? 'text-white' : isMid ? 'text-amber-800' : 'text-red-700'}`}>
                      {result.transcription}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-violet-500" />
                  </div>
                </div>
                {/* Score card */}
                <div className={`mx-9 rounded-xl px-3 py-2 text-xs ${
                  isGood ? 'bg-green-50 border border-green-100' : isMid ? 'bg-amber-50 border border-amber-100' : 'bg-red-50 border border-red-100'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      {result.structureExact ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      ) : result.structureUsed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      )}
                      <span className={`font-medium ${result.structureExact ? 'text-green-700' : result.structureUsed ? 'text-amber-700' : 'text-red-700'}`}>
                        {result.structureExact ? 'Cấu trúc chính xác' : result.structureUsed ? 'Cấu trúc tương tự' : 'Chưa dùng cấu trúc'}
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${isGood ? 'text-green-700' : isMid ? 'text-amber-700' : 'text-red-600'}`}>
                      +{pts.toFixed(1)}đ
                    </span>
                  </div>
                  {result.penaltiesApplied > 0 && (
                    <p className="text-slate-500">−{(result.penaltiesApplied * 0.5).toFixed(1)}đ ({result.penaltiesApplied} lỗi)</p>
                  )}
                  <p className="text-slate-600 mt-1">{result.feedback}</p>
                  {!result.structureExact && result.correctedSentence && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200">
                      <span className="text-slate-400">Có thể nói: </span>
                      <span className="text-slate-600 italic">"{result.correctedSentence}"</span>
                    </div>
                  )}
                </div>
                {/* Next button after scoring */}
                {isCurrentTurn && waitingForNext && (
                  <div className="flex justify-end pr-2">
                    <button
                      onClick={advance}
                      className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-full transition"
                    >
                      Tiếp theo <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          /* ── LEARNER turn: active (needs recording) ── */
          if (isCurrentTurn) {
            const targetStructure = turn.targetStructureId ? structureMap.get(turn.targetStructureId) : null;
            return (
              <div key={turn.index} className="space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <div className="h-px flex-1 bg-violet-100" />
                  <span className="text-xs text-violet-500 font-medium px-2">Your turn</span>
                  <div className="h-px flex-1 bg-violet-100" />
                </div>

                {/* Hint toggle */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setHintVisible(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-full transition"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    {hintVisible ? 'Ẩn gợi ý' : 'Cần gợi ý?'}
                  </button>
                </div>

                {hintVisible && turn.hint && (
                  <div className="mx-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs space-y-1">
                    <p className="text-amber-600 font-medium">Cấu trúc cần dùng:</p>
                    <p className="text-amber-800 font-mono">{turn.hint}</p>
                    {targetStructure && (
                      <p className="text-amber-700 mt-1">{targetStructure.explanation}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col items-center gap-2">
                  <AudioRecorder
                    onRecordingComplete={handleRecording}
                    isProcessing={isScoring}
                  />
                  <p className="text-xs text-slate-400 text-center">Nhấn để ghi âm câu trả lời của bạn</p>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Finished */}
        {isFinished && (
          <div className="space-y-3 pt-2">
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-5 border border-violet-100 text-center">
              <p className="text-xs text-violet-500 uppercase tracking-wide mb-1">Tổng điểm hội thoại</p>
              <div className="text-4xl font-black text-violet-700">{totalScore.toFixed(1)}</div>
              <div className="text-xs text-slate-400 mt-1">
                / {learnerTurns.length * 10} điểm tối đa
              </div>
            </div>
            <button
              onClick={() => {
                const structureAttempts: StructureAttemptAudit[] = completedTurns
                  .filter(ct => item.turns[ct.index]?.targetStructureId)
                  .map(ct => ({
                    structureItemId: item.turns[ct.index].targetStructureId!,
                    lessonId: item.lessonId,
                    isCorrect: ct.result.structureExact || ct.result.structureUsed,
                    attemptTimestamp: new Date().toISOString(),
                  }));
                onComplete(totalScore, structureAttempts);
              }}
              className="w-full py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Hoàn thành
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
