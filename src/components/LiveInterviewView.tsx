"use client";


import React, { useState, useEffect, useRef } from 'react';
import { InterviewQA, LiveTurn, LiveInterviewSession, WordHighlight } from '@/lib/types';
import { evaluateLiveResponse } from '@/lib/ai/aiClient';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder from '@/components/AudioRecorder';
import { 
  Mic, MessageSquare, ChevronRight, CheckCircle2, Trophy, 
  RotateCcw, Sparkles, AlertCircle, Headphones, Lightbulb, 
  Info, ChevronDown, ChevronUp, User, Brain, ListChecks, Play, 
  Loader2, History, X
} from 'lucide-react';

interface LiveInterviewViewProps {
  questions: InterviewQA[];
  onComplete: (session: LiveInterviewSession) => void;
  onExit: () => void;
  industry: string;
  role: string;
}

const LiveInterviewView: React.FC<LiveInterviewViewProps> = ({ 
  questions, 
  onComplete, 
  onExit,
  industry,
  role
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentTurnResult, setCurrentTurnResult] = useState<LiveTurn | null>(null);
  const [showHint, setShowHint] = useState<'BULLETS' | 'FULL' | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const [isSessionFinished, setIsSessionFinished] = useState(false);

  const currentQA = questions[currentIndex];

  const handleResponse = async (base64: string, blobUrl: string) => {
    if (!currentQA) return;
    setIsEvaluating(true);
    try {
      const evaluation = await evaluateLiveResponse(currentQA.question, base64);
      
      const newTurn: LiveTurn = {
        id: Math.random().toString(36).substr(2, 9),
        question: currentQA.question,
        transcription: evaluation.transcription,
        audioUrl: blobUrl,
        score: evaluation.score,
        feedback: evaluation.feedback,
        highlights: evaluation.highlights,
        timestamp: new Date().toISOString()
      };

      setCurrentTurnResult(newTurn);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const nextQuestion = () => {
    if (currentTurnResult) {
      const updatedTurns = [...turns, currentTurnResult];
      setTurns(updatedTurns);
      setCurrentTurnResult(null);
      setShowHint(null);
      setExpandedFeedbackId(null);
      
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        finishSession(updatedTurns);
      }
    }
  };

  const finishSession = (finalTurns: LiveTurn[]) => {
    const avgScore = finalTurns.length > 0 ? finalTurns.reduce((a, b) => a + b.score, 0) / finalTurns.length : 0;
    const session: LiveInterviewSession = {
      id: Math.random().toString(36).substr(2, 9),
      qaIds: questions.map(q => q.id),
      turns: finalTurns,
      averageScore: avgScore,
      date: new Date().toISOString(),
      role,
      industry,
      overallFeedback: avgScore >= 85 ? "Excellent work! Your confidence and pronunciation are at a high level." : "Great practice. Focus on consistent grammar and ending sounds to improve further."
    };
    setIsSessionFinished(true);
    onComplete(session);
  };

  const getContentWordsHints = (text: string) => {
    return text.split(/\s+/).filter(word => word.length > 4).slice(0, 5).join(' • ');
  };

  if (!currentQA && !isSessionFinished) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-6">
        <AlertCircle className="w-16 h-16 text-rose-500" />
        <div className="text-center">
          <h3 className="text-xl font-black text-slate-900">No questions available</h3>
          <p className="text-slate-500 font-medium">Something went wrong. Please return to the library.</p>
        </div>
        <button onClick={onExit} className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all">Go Back</button>
      </div>
    );
  }

  if (isSessionFinished) {
    const avgScore = turns.length > 0 ? turns.reduce((a, b) => a + b.score, 0) / turns.length : 0;
    return (
      <div className="max-w-4xl mx-auto py-12 animate-in zoom-in duration-500">
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden">
          <div className="bg-indigo-600 p-12 text-white text-center relative">
            <Trophy className="w-20 h-20 text-amber-300 mx-auto mb-6" />
            <h2 className="text-4xl font-black mb-4">Practice Finished!</h2>
            <div className="inline-block px-10 py-5 bg-white/10 rounded-[2rem] border border-white/10">
              <span className="text-6xl font-black">{Math.round(avgScore)}%</span>
              <p className="text-[10px] font-black uppercase tracking-widest mt-2 opacity-80">Average Mastery</p>
            </div>
          </div>
          <div className="p-10 space-y-8">
            <div className="p-8 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-start gap-4">
              <Sparkles className="w-8 h-8 text-indigo-600 shrink-0" />
              <div className="space-y-2">
                <h4 className="font-black text-slate-900">Session Feedback</h4>
                <p className="text-slate-700 font-medium leading-relaxed">{avgScore >= 85 ? 'Your speaking skills are very strong. You are ready for the actual interview!' : 'Good progress! Keep practicing the specific sounds identified in the turns below.'}</p>
              </div>
            </div>
            <button onClick={onExit} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
              Return to Dashboard <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-12">
      <div className="flex items-center justify-between mb-8 px-4">
        <button onClick={onExit} className="text-slate-400 hover:text-slate-900 font-bold flex items-center gap-2">
          <X className="w-5 h-5" /> Exit Session
        </button>
        <div className="flex items-center gap-4">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Practice {currentIndex + 1}/{questions.length}</span>
          <div className="h-2 w-48 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all duration-700" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left: Interviewer */}
        <div className="space-y-6 flex flex-col">
          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl p-10 flex-1 flex flex-col relative overflow-hidden">
            <div className="relative z-10 space-y-8">
              <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">
                <Brain className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Interviewer says:</span>
                <h3 className="text-3xl font-black text-slate-900 leading-tight italic">"{currentQA.question}"</h3>
              </div>
              <AudioPlayer key={currentIndex} text={currentQA.question} label="Listen to Question" autoPlay />
              
              <div className="pt-8 border-t border-slate-50 space-y-4">
                <div className="flex items-center gap-3">
                   <Lightbulb className="w-5 h-5 text-amber-500" />
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Need a hint?</h4>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowHint(showHint === 'BULLETS' ? null : 'BULLETS')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${showHint === 'BULLETS' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>Summary Points</button>
                  <button onClick={() => setShowHint(showHint === 'FULL' ? null : 'FULL')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${showHint === 'FULL' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>Full Answer</button>
                </div>
                {showHint === 'BULLETS' && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-sm font-bold text-amber-800 animate-in slide-in-from-top-2">
                    Key concepts: {getContentWordsHints(currentQA.polishedAnswer)}
                  </div>
                )}
                {showHint === 'FULL' && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-sm font-bold text-amber-800 animate-in slide-in-from-top-2 italic">
                    "{currentQA.polishedAnswer}"
                  </div>
                )}
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
              <MessageSquare className="w-64 h-64 fill-indigo-900" />
            </div>
          </div>
        </div>

        {/* Right: User Turn */}
        <div className="space-y-6">
          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-slate-900 px-8 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Interviewee Record</h3>
              {isEvaluating && <Loader2 className="w-4 h-4 text-white animate-spin" />}
            </div>
            
            <div className="p-8 flex-1 flex flex-col">
              {!currentTurnResult ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10">
                   <div className="space-y-4">
                     <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-slate-200">
                        <User className="w-8 h-8 text-slate-200" />
                     </div>
                     <p className="text-slate-400 font-bold max-w-xs">Answer the question naturally. We'll transcribe and evaluate your speaking quality.</p>
                   </div>
                   <AudioRecorder onRecordingComplete={handleResponse} isProcessing={isEvaluating} />
                </div>
              ) : (
                <div className="space-y-8 animate-in zoom-in duration-300">
                  <div className="space-y-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Your Answer</span>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 italic font-bold text-slate-700 leading-relaxed text-center">
                       <div className="flex flex-wrap gap-x-1.5 justify-center">
                         {currentTurnResult.highlights.map((h, i) => (
                           <span key={i} className={h.isCorrect ? 'text-emerald-600' : 'text-rose-500 underline decoration-rose-100 underline-offset-4'}>{h.word}</span>
                         ))}
                       </div>
                    </div>
                    <audio src={currentTurnResult.audioUrl} controls className="w-full h-8" />
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={() => setExpandedFeedbackId(expandedFeedbackId === currentTurnResult.id ? null : currentTurnResult.id)}
                      className="w-full p-6 bg-indigo-50 rounded-2xl border-2 border-indigo-100 flex items-center justify-between hover:bg-indigo-100 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${currentTurnResult.score >= 85 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {Math.round(currentTurnResult.score)}%
                        </div>
                        <div className="text-left">
                           <h4 className="text-sm font-black text-slate-900">View Evaluation</h4>
                           <p className="text-[10px] font-bold text-indigo-400 uppercase">Grammar, Phonetics & Fluency</p>
                        </div>
                      </div>
                      {expandedFeedbackId === currentTurnResult.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    
                    {expandedFeedbackId === currentTurnResult.id && (
                      <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 animate-in slide-in-from-top-4">
                        <div className="grid grid-cols-1 gap-4 text-xs font-bold text-slate-600">
                           <div className="flex flex-col gap-1 p-3 bg-white rounded-xl shadow-sm border border-slate-100"><span className="text-[9px] font-black text-indigo-400 uppercase">Pronunciation</span>{currentTurnResult.feedback.pronunciation}</div>
                           <div className="flex flex-col gap-1 p-3 bg-white rounded-xl shadow-sm border border-slate-100"><span className="text-[9px] font-black text-emerald-400 uppercase">Grammar</span>{currentTurnResult.feedback.grammar}</div>
                           <div className="flex flex-col gap-1 p-3 bg-white rounded-xl shadow-sm border border-slate-100"><span className="text-[9px] font-black text-amber-400 uppercase">Fluency (Linking/Speed)</span>{currentTurnResult.feedback.fluency}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setCurrentTurnResult(null)} className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                       <RotateCcw className="w-4 h-4" /> Try Again
                    </button>
                    <button onClick={nextQuestion} className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                       Next Question <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveInterviewView;
