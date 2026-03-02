"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ExperienceLevel, LearnerProgress, InterviewQA, QuestionType, InterviewSession, DrillSession, DrillAttempt, WordHighlight, LiveInterviewSession } from '@/lib/types';
import {
  generateInterviewQuestions,
  polishInterviewAnswer,
  getAISuggestion,
  scorePronunciation,
  fixUserQuestions,
} from '@/lib/ai/aiClient';
import type { AISuggestion } from '@/lib/services/geminiService';
import { 
  Briefcase, Search, Sparkles, Wand2, Mic, Save, SaveAll, Loader2, 
  ChevronRight, ArrowLeft, MessageSquare, BookOpen, CheckCircle2,
  Trophy, RotateCcw, LayoutDashboard, History, Trash2, Home,
  Lightbulb, Quote, Copy, Check, Users, Code, BrainCircuit,
  Eraser, ShieldCheck, Coffee, Edit3, ChevronDown, ChevronUp,
  ExternalLink, FileText, Upload, X, FileUp, Zap, Type as TypeIcon,
  HelpCircle, Settings2, UserCircle, Plus, Layers, Clock, Tag, Settings,
  Square, Play, Volume2, Info, Headphones, Activity, ListChecks, Target, AlertTriangle,
  Type, Brain
} from 'lucide-react';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder from '@/components/AudioRecorder';
import LiveInterviewView from '@/components/LiveInterviewView';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'so', 'if', 'than', 'because', 'while', 'although', 'after', 'before', 'that', 'which', 'who', 'whom', 'whose', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'this', 'that', 'these', 'those', 'some', 'any', 'each', 'every', 'few', 'many', 'much', 'all', 'both', 'either', 'neither', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'shall', 'will', 'should', 'would', 'can', 'could', 'may', 'might', 'must', 'with', 'from', 'into', 'about', 'just'
]);

const getContentWordsText = (text: string) => {
  if (!text) return "";
  return text.split(/\s+/).map(word => {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    return FUNCTION_WORDS.has(clean) ? '____' : word;
  }).join(' ');
};

interface InterviewPrepViewProps {
  progress: LearnerProgress;
  onSaveQA: (qa: InterviewQA) => void;
  onDeleteQA: (id: string) => void;
  onUpdateSession: (session: InterviewSession) => void;
  onDeleteSession: (id: string) => void;
  onSaveDrillSession: (session: DrillSession) => void;
  onSaveLiveSession: (session: LiveInterviewSession) => void;
  onBackToDashboard: () => void;
}

const SENIORITY_LEVELS: ExperienceLevel[] = [
  'Entry Level', 'Junior', 'Middle', 'Senior', 'Team Lead', 'Middle Manager', 'C-level'
];

const QUESTION_TYPES: { id: QuestionType; label: string; desc: string; icon: any }[] = [
  { 
    id: 'HR/Screening', 
    label: 'HR / Screening', 
    desc: 'Initial screening. Focus on expectations, motivation, and basics.', 
    icon: UserCircle 
  },
  { 
    id: 'Hiring Manager', 
    label: 'Hiring Manager', 
    desc: 'Technical/Role round. Focus on depth, problem-solving, and impact.', 
    icon: Briefcase 
  },
  { 
    id: 'Culture Fit', 
    label: 'Culture Fit', 
    desc: 'Soft skills and values. Focus on teamwork and alignment.', 
    icon: Users 
  },
];

type RefinementOption = 'none' | 'simplify' | 'grammar' | 'professional' | 'casual' | 'other';

const REFINEMENT_OPTIONS: { id: RefinementOption; label: string; icon: any; color: string }[] = [
  { id: 'simplify', label: 'Simplify it', icon: Eraser, color: 'text-sky-600 bg-sky-50 border-sky-100' },
  { id: 'grammar', label: 'Correct grammar only', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { id: 'professional', label: 'Make it more professional', icon: Briefcase, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  { id: 'casual', label: 'Make it more casual', icon: Coffee, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { id: 'other', label: 'Other', icon: Edit3, color: 'text-slate-600 bg-slate-50 border-slate-100' },
];

const InterviewPrepView: React.FC<InterviewPrepViewProps> = ({ 
  progress, 
  onSaveQA, 
  onDeleteQA, 
  onUpdateSession, 
  onDeleteSession, 
  onSaveDrillSession,
  onSaveLiveSession,
  onBackToDashboard 
}) => {
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [level, setLevel] = useState<ExperienceLevel | null>('Middle');
  const [qType, setQType] = useState<QuestionType>('HR/Screening');
  
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isFixingQuestions, setIsFixingQuestions] = useState(false);
  
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [personalDetails, setPersonalDetails] = useState('');
  const [polishedAnswer, setPolishedAnswer] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);

  // Tailored Mode states
  const [sessionName, setSessionName] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdPastedText, setJdPastedText] = useState('');
  const [jdInputMethod, setJdInputMethod] = useState<'FILE' | 'TEXT'>('FILE');
  
  const [sampleQuestions, setSampleQuestions] = useState('');
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);

  // Refinement states
  const [selectedRefinement, setSelectedRefinement] = useState<RefinementOption>('none');
  const [customInstruction, setCustomInstruction] = useState('');

  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [practiceResult, setPracticeResult] = useState<{score: number, feedback: string, ipa: string, highlights?: WordHighlight[]} | null>(null);

  const [view, setView] = useState<'LEVEL_SELECT' | 'PDF_UPLOAD' | 'TYPE_SELECT' | 'QUESTION_LIST' | 'QA_WORKSPACE' | 'SAVED_COLLECTION' | 'EDIT_SESSION' | 'DRILL_SESSION' | 'DRILL_SUMMARY' | 'DRILL_HISTORY' | 'LIVE_CHAT'>('LEVEL_SELECT');
  
  // Library expansion state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedQAIds, setSelectedQAIds] = useState<Set<string>>(new Set());

  // Drill state
  const [currentDrillIndex, setCurrentDrillIndex] = useState(0);
  const [drillStep, setDrillStep] = useState<1 | 2 | 3>(1); 
  const [drillQASequence, setDrillQASequence] = useState<InterviewQA[]>([]);
  const [currentDrillPartScores, setCurrentDrillPartScores] = useState<number[]>([]);
  const [drillAttempts, setDrillAttempts] = useState<DrillAttempt[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<DrillSession | null>(null);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const toggleSelectQA = (id: string) => {
    const next = new Set(selectedQAIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedQAIds(next);
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(" ") + "\n";
    }
    return fullText;
  };

  const handlePDFUpload = async () => {
    const isJdReady = jdInputMethod === 'TEXT' ? jdPastedText.trim().length > 50 : !!jdFile;
    if (!cvFile || !isJdReady) return;

    setIsParsingPDF(true);
    try {
      const [cv, extractedJd] = await Promise.all([
        extractTextFromPDF(cvFile),
        jdInputMethod === 'FILE' && jdFile ? extractTextFromPDF(jdFile) : Promise.resolve(jdPastedText)
      ]);
      
      const newSession: InterviewSession = {
        id: Math.random().toString(36).substr(2, 9),
        sessionName: sessionName.trim() || undefined,
        role: progress.preferences?.role || "Professional",
        industry: progress.preferences?.industry || "General",
        seniority: 'Tailored',
        cvText: cv,
        jdText: extractedJd,
        mode: 'TAILORED',
        questions: [],
        dateCreated: new Date().toISOString()
      };
      
      setActiveSession(newSession);
      onUpdateSession(newSession);
      setView('TYPE_SELECT');
    } catch (e) {
      console.error("PDF Parsing error:", e);
      alert("Error reading PDF files. Please ensure they are valid and try again.");
    } finally {
      setIsParsingPDF(false);
    }
  };

  const startStandardSession = (lvl: ExperienceLevel) => {
    const existing = progress.interviewSessions.find(s => 
      s.mode === 'STANDARD' && s.role === progress.preferences?.role && s.seniority === lvl
    );

    if (existing) {
      setActiveSession(existing);
      setView('QUESTION_LIST');
    } else {
      const newSession: InterviewSession = {
        id: Math.random().toString(36).substr(2, 9),
        role: progress.preferences?.role || "Professional",
        industry: progress.preferences?.industry || "General",
        seniority: lvl,
        mode: 'STANDARD',
        questions: [],
        dateCreated: new Date().toISOString()
      };
      setActiveSession(newSession);
      onUpdateSession(newSession);
      setView('TYPE_SELECT');
    }
    setLevel(lvl);
  };

  const fetchQuestions = async (selectedType: QuestionType) => {
    if (!activeSession) return;
    setIsLoadingQuestions(true);
    
    try {
      const q = await generateInterviewQuestions(
        activeSession.role,
        activeSession.seniority === 'Tailored' ? null : activeSession.seniority,
        activeSession.industry,
        selectedType,
        activeSession.jdText || '',
        sampleQuestions
      );

      const updatedSession = { ...activeSession };
      const existingRound = updatedSession.questions.find(rq => rq.type === selectedType);
      
      if (existingRound) {
        existingRound.list = [...new Set([...q, ...existingRound.list])];
      } else {
        updatedSession.questions.push({ type: selectedType, list: q });
      }

      setActiveSession(updatedSession);
      onUpdateSession(updatedSession);
      setQType(selectedType);
      setView('QUESTION_LIST');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleAddSampleAsQuestions = async () => {
    if (!sampleQuestions.trim() || !activeSession) return;
    setIsFixingQuestions(true);
    try {
      const fixed = await fixUserQuestions(sampleQuestions);
      const updatedSession = { ...activeSession };
      
      let round = updatedSession.questions.find(rq => rq.type === qType);
      if (!round) {
        round = { type: qType, list: [] };
        updatedSession.questions.push(round);
      }
      round.list = [...new Set([...fixed, ...round.list])];

      setActiveSession(updatedSession);
      onUpdateSession(updatedSession);
      setSampleQuestions('');
      setShowGuidance(false);
      setView('QUESTION_LIST');
    } catch (e) {
      console.error(e);
      alert("Error processing your questions. Please try again.");
    } finally {
      setIsFixingQuestions(false);
    }
  };

  const handleSelectNewQuestion = (q: string) => {
    setActiveQuestion(q);
    setPersonalDetails('');
    setPolishedAnswer('');
    setAiSuggestion(null);
    setPracticeResult(null);
    setSelectedRefinement('none');
    setCustomInstruction('');
    setView('QA_WORKSPACE');
  };

  const handlePolish = async () => {
    if (!activeQuestion || !personalDetails || !activeSession) return;
    setIsPolishing(true);
    
    let instruction = "";
    if (selectedRefinement === 'simplify') instruction = "Simplify the vocabulary and sentence structure to be more direct.";
    else if (selectedRefinement === 'grammar') instruction = "Only correct the grammar and spelling. DO NOT change the style or vocabulary of my original input, just make it grammatically perfect.";
    else if (selectedRefinement === 'professional') instruction = "Make the tone highly professional, using strong action verbs and formal business language.";
    else if (selectedRefinement === 'casual') instruction = "Make the tone more conversational, relaxed, and friendly, as if talking to a supportive colleague.";
    else if (selectedRefinement === 'other') instruction = customInstruction;

    try {
      const result = await polishInterviewAnswer(
        activeQuestion, 
        personalDetails,
        activeSession.role,
        activeSession.seniority === 'Tailored' ? null : activeSession.seniority,
        progress.preferences?.level || "B1",
        instruction,
        activeSession.cvText || ''
      );
      setPolishedAnswer(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPolishing(false);
    }
  };

  const fetchSuggestion = async () => {
    if (!activeQuestion || !activeSession) return;
    setIsLoadingSuggestion(true);
    try {
      const res = await getAISuggestion(
        activeQuestion,
        activeSession.role,
        activeSession.seniority === 'Tailored' ? null : activeSession.seniority,
        progress.preferences?.level || "B1",
        activeSession.cvText || '',
        activeSession.jdText || ''
      );
      setAiSuggestion(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  const handleUseSuggestion = () => {
    if (!aiSuggestion) return;
    setApplyingSuggestion(true);
    setPolishedAnswer(aiSuggestion.answer);
    setPracticeResult(null); 
    setTimeout(() => setApplyingSuggestion(false), 1000);
  };

  const handlePracticeRecording = async (base64: string) => {
    const currentAnswer = view === 'DRILL_SESSION' ? (drillQASequence[currentDrillIndex]?.polishedAnswer || "") : polishedAnswer;
    if (!currentAnswer) return;
    
    setIsProcessingSpeech(true);
    try {
      const res = await scorePronunciation(currentAnswer, base64, false, true);
      const resultData = {
        score: res.score,
        feedback: res.feedback,
        ipa: res.ipaTranscription,
        highlights: res.highlights
      };

      if (view === 'DRILL_SESSION') {
        const nextPartScores = [...currentDrillPartScores];
        nextPartScores[drillStep - 1] = res.score;
        setCurrentDrillPartScores(nextPartScores);
      }
      
      setPracticeResult(resultData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingSpeech(false);
    }
  };

  const handleSaveQA = () => {
    if (!activeQuestion || !polishedAnswer || !activeSession) return;
    const newQA: InterviewQA = {
      id: Math.random().toString(36).substr(2, 9),
      question: activeQuestion,
      personalDetails,
      polishedAnswer,
      industry: activeSession.industry,
      role: activeSession.role,
      seniority: activeSession.seniority,
      dateSaved: new Date().toISOString()
    };
    onSaveQA(newQA);
    setView('SAVED_COLLECTION');
  };

  const handleUpdateSessionContext = async () => {
    if (!activeSession) return;
    setIsParsingPDF(true);
    try {
      const updatedCv = cvFile ? await extractTextFromPDF(cvFile) : activeSession.cvText;
      const updatedJd = jdFile ? await extractTextFromPDF(jdFile) : jdPastedText || activeSession.jdText;
      
      let updatedSession: InterviewSession = {
        ...activeSession,
        sessionName: sessionName.trim() || undefined,
        cvText: updatedCv,
        jdText: updatedJd,
      };

      setIsLoadingQuestions(true);
      try {
        const newQuestions = await generateInterviewQuestions(
          updatedSession.role,
          updatedSession.seniority === 'Tailored' ? null : updatedSession.seniority,
          updatedSession.industry,
          qType,
          updatedSession.jdText || '',
          sampleQuestions
        );

        const roundIndex = updatedSession.questions.findIndex(rq => rq.type === qType);
        if (roundIndex !== -1) {
          updatedSession.questions[roundIndex] = { type: qType, list: newQuestions };
        } else {
          updatedSession.questions.push({ type: qType, list: newQuestions });
        }
      } catch (genErr) {
        console.error("Failed to re-generate questions:", genErr);
      } finally {
        setIsLoadingQuestions(false);
      }
      
      setActiveSession(updatedSession);
      onUpdateSession(updatedSession);
      setView('QUESTION_LIST');
    } catch (e) {
      console.error(e);
      alert("Error updating session context.");
    } finally {
      setIsParsingPDF(false);
    }
  };

  const startDrill = () => {
    if (selectedQAIds.size === 0) return;
    const sequence = progress.interviewPrep.filter(qa => selectedQAIds.has(qa.id));
    if (sequence.length === 0) return;
    setDrillQASequence(sequence);
    setCurrentDrillIndex(0);
    setDrillStep(1);
    setCurrentDrillPartScores([]);
    setDrillAttempts([]);
    setPracticeResult(null);
    setView('DRILL_SESSION');
  };

  const finishDrill = (finalAttempts: DrillAttempt[]) => {
    const totalScore = finalAttempts.length > 0 ? finalAttempts.reduce((sum, att) => sum + att.score, 0) : 0;
    const avgScore = finalAttempts.length > 0 ? totalScore / finalAttempts.length : 0;
    
    const session: DrillSession = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      attempts: finalAttempts,
      averageScore: avgScore,
      generalFeedback: avgScore >= 80 ? "Excellent performance! Your speaking rhythm and clarity are job-ready." : "Good effort. Focus more on chunking your ideas and maintaining professional intonation."
    };
    
    onSaveDrillSession(session);
    setView('DRILL_SUMMARY');
  };

  const handleNextDrillStep = () => {
    if (drillStep < 3) {
      setDrillStep(prev => (prev + 1) as 1 | 2 | 3);
      setPracticeResult(null);
    } else {
      const currentQA = drillQASequence[currentDrillIndex];
      if (!currentQA) return;
      
      const avgScore = currentDrillPartScores.length > 0 ? currentDrillPartScores.reduce((a, b) => a + b, 0) / 3 : 0;
      
      const newAttempt: DrillAttempt = {
        qaId: currentQA.id,
        question: currentQA.question,
        answer: currentQA.polishedAnswer,
        score: avgScore,
        feedback: `Avg score across 3 parts: ${Math.round(avgScore)}%. (P1: ${currentDrillPartScores[0] || 0}%, P2: ${currentDrillPartScores[1] || 0}%, P3: ${currentDrillPartScores[2] || 0}%)`,
        highlights: practiceResult?.highlights || [],
      };
      
      const updatedAttempts = [...drillAttempts, newAttempt];
      setDrillAttempts(updatedAttempts);

      if (currentDrillIndex < drillQASequence.length - 1) {
        setCurrentDrillIndex(prev => prev + 1);
        setDrillStep(1);
        setCurrentDrillPartScores([]);
        setPracticeResult(null);
      } else {
        finishDrill(updatedAttempts);
      }
    }
  };

  const startLivePractice = () => {
    if (selectedQAIds.size === 0) return;
    const sequence = progress.interviewPrep.filter(qa => selectedQAIds.has(qa.id));
    if (sequence.length === 0) return;
    setDrillQASequence(sequence);
    setCurrentDrillIndex(0);
    setView('LIVE_CHAT');
  };

  const getLatestAttemptForQA = (qaId: string) => {
    for (const session of progress.drillSessions) {
      const attempt = session.attempts.find(att => att.qaId === qaId);
      if (attempt) return { attempt, session };
    }
    return null;
  };

  const openLatestSessionForQA = (qaId: string) => {
    const data = getLatestAttemptForQA(qaId);
    if (data) {
      setSelectedHistorySession(data.session);
      setView('DRILL_HISTORY');
    }
  };

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
      <div className="flex items-center gap-4">
        {view !== 'LEVEL_SELECT' ? (
          <button 
            onClick={() => {
              if (view === 'QA_WORKSPACE') setView('QUESTION_LIST');
              else if (view === 'QUESTION_LIST') setView('TYPE_SELECT');
              else if (view === 'TYPE_SELECT') setView(activeSession?.mode === 'STANDARD' ? 'LEVEL_SELECT' : 'PDF_UPLOAD');
              else if (view === 'PDF_UPLOAD') setView('LEVEL_SELECT');
              else if (view === 'SAVED_COLLECTION') setView('LEVEL_SELECT');
              else if (view === 'EDIT_SESSION') setView('QUESTION_LIST');
              else if (view === 'DRILL_SESSION' || view === 'LIVE_CHAT') {
                 if (confirm("Are you sure you want to exit the practice? Your progress will be lost.")) setView('SAVED_COLLECTION');
              }
              else if (view === 'DRILL_SUMMARY') setView('SAVED_COLLECTION');
              else if (view === 'DRILL_HISTORY') setView('SAVED_COLLECTION');
              else setView('LEVEL_SELECT');
            }}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        ) : (
          <button 
            onClick={onBackToDashboard}
            className="p-2 hover:bg-indigo-50 rounded-full text-indigo-600 transition-colors"
            title="Back to Dashboard"
          >
            <Home className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Interview Mastery</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest truncate">
              {view === 'DRILL_SESSION' ? `Drill: ${currentDrillIndex + 1} of ${drillQASequence.length}` : 
               view === 'LIVE_CHAT' ? `Live Practice: ${currentDrillIndex + 1} of ${drillQASequence.length}` :
               view === 'DRILL_HISTORY' ? 'Practice History' :
               activeSession?.sessionName ? activeSession.sessionName : activeSession?.mode === 'TAILORED' ? 'Tailored Experience' : activeSession ? `Standard Mode: ${activeSession.seniority}` : 'Select a Round'}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto">
        <button 
          onClick={onBackToDashboard}
          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-200 transition-all shadow-sm"
        >
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </button>
        <button 
          onClick={() => setView('SAVED_COLLECTION')}
          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-sm font-black text-indigo-600 hover:border-indigo-100 transition-all shadow-sm"
        >
          <SaveAll className="w-5 h-5" />
          Library ({progress.interviewPrep.length})
        </button>
      </div>
    </div>
  );

  if (view === 'LIVE_CHAT') {
    return (
      <LiveInterviewView 
        questions={drillQASequence}
        industry={progress.preferences?.industry || 'General'}
        role={progress.preferences?.role || 'Professional'}
        onExit={() => setView('SAVED_COLLECTION')}
        onComplete={(session) => {
          onSaveLiveSession(session);
        }}
      />
    );
  }

  if (view === 'LEVEL_SELECT') {
    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <button 
          onClick={() => { setActiveSession(null); setSessionName(''); setView('PDF_UPLOAD'); }}
          className="w-full mb-12 bg-gradient-to-r from-indigo-600 to-violet-700 p-8 rounded-[2.5rem] border border-indigo-400 shadow-xl shadow-indigo-100 text-left flex items-center justify-between group overflow-hidden relative"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
              <span className="text-[10px] font-black text-indigo-100 uppercase tracking-widest">New Analysis</span>
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Analyze CV & JD</h3>
            <p className="text-indigo-100 font-medium max-w-md">Generate hyper-specific questions for your dream job application.</p>
          </div>
          <div className="relative z-10 p-5 bg-white/10 rounded-3xl group-hover:bg-white/20 transition-all">
            <FileUp className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Briefcase className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Standard Practice Rounds</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {SENIORITY_LEVELS.map(l => (
                  <button
                    key={l}
                    onClick={() => startStandardSession(l)}
                    className="p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all group text-left"
                  >
                    <div className="text-xs font-black text-slate-900 mb-1">{l}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Role Agnostic</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Recent Sessions
              </h3>
            </div>
            <div className="space-y-3">
              {progress.interviewSessions.length === 0 ? (
                <div className="p-8 text-center bg-slate-100/50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No saved sessions</p>
                </div>
              ) : (
                progress.interviewSessions.map(session => (
                  <div key={session.id} className="group relative">
                    <button
                      onClick={() => { setActiveSession(session); setView('QUESTION_LIST'); }}
                      className="w-full p-5 bg-white border border-slate-200 rounded-2xl text-left hover:border-indigo-600 hover:shadow-lg transition-all flex items-center gap-4"
                    >
                      <div className={`p-2.5 rounded-xl ${session.mode === 'TAILORED' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                        {session.mode === 'TAILORED' ? <Zap className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-black text-slate-900 truncate">
                          {session.sessionName || session.role}
                        </h4>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">
                          {session.sessionName ? `${session.role} • ` : ''}{session.mode} • {session.seniority}
                        </p>
                      </div>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                      className="absolute -top-2 -right-2 p-1.5 bg-white border border-slate-200 text-slate-300 hover:text-rose-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'PDF_UPLOAD' || view === 'EDIT_SESSION') {
    const isEditing = view === 'EDIT_SESSION';
    const isJdReady = jdInputMethod === 'TEXT' ? jdPastedText.trim().length > 50 : !!jdFile;

    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {isEditing ? <Settings className="w-8 h-8" /> : <FileUp className="w-8 h-8" />}
            </div>
            <h3 className="text-2xl font-black text-slate-900">{isEditing ? 'Session Context' : 'Application Analysis'}</h3>
            <p className="text-slate-500 font-medium">{isEditing ? 'Update CV/JD. Questions will be re-generated.' : 'Upload documents and name this target to distinguish it later.'}</p>
          </div>
          <div className="space-y-10">
            <div className="space-y-3 px-2">
              <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                <Tag className="w-3.5 h-3.5" /> {isEditing ? 'Rename Session' : 'Target Name (Optional)'}
              </label>
              <input 
                type="text" 
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Google Frontend Interview, Acme Startup Role..."
                className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-slate-700 placeholder:text-slate-300"
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{isEditing ? 'Replace Resume (Optional)' : 'Your Resume (CV PDF)'}</label>
                <div className={`relative border-2 border-dashed rounded-[2rem] p-8 text-center transition-all min-h-[220px] flex flex-col justify-center ${cvFile ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-400'}`}>
                  {cvFile ? (
                    <div className="space-y-4">
                      <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mx-auto"><FileText className="w-6 h-6" /></div>
                      <p className="text-sm font-black text-slate-900 truncate px-4">{cvFile.name}</p>
                      <button onClick={() => setCvFile(null)} className="text-xs font-black text-rose-500 hover:underline uppercase">Remove File</button>
                    </div>
                  ) : (
                    <>
                      <input type="file" accept=".pdf" onChange={(e) => setCvFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm"><Upload className="w-6 h-6 text-slate-300" /></div>
                      <p className="text-xs font-bold text-slate-500">{isEditing ? 'Click to replace CV' : 'Upload Resume PDF'}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isEditing ? 'Update JD' : 'Job Description (JD)'}</label>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setJdInputMethod('FILE')} className={`p-1.5 rounded-md transition-all ${jdInputMethod === 'FILE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Upload PDF"><FileText className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setJdInputMethod('TEXT')} className={`p-1.5 rounded-md transition-all ${jdInputMethod === 'TEXT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`} title="Paste Text"><TypeIcon className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className={`relative border-2 border-dashed rounded-[2rem] transition-all min-h-[220px] overflow-hidden flex flex-col ${isJdReady || (isEditing && jdPastedText) ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-400'}`}>
                  {jdInputMethod === 'FILE' ? (
                    <div className="flex-1 flex flex-col justify-center text-center p-8">
                      {jdFile ? (
                        <div className="space-y-4">
                          <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mx-auto"><Briefcase className="w-6 h-6" /></div>
                          <p className="text-sm font-black text-slate-900 truncate px-4">{jdFile.name}</p>
                          <button onClick={() => setJdFile(null)} className="text-xs font-black text-rose-500 hover:underline uppercase">Remove File</button>
                        </div>
                      ) : (
                        <>
                          <input type="file" accept=".pdf" onChange={(e) => setJdFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm"><Upload className="w-6 h-6 text-slate-300" /></div>
                          <p className="text-xs font-bold text-slate-500">{isEditing ? 'Click to replace JD' : 'Upload JD PDF'}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col p-4">
                      <textarea value={jdPastedText} onChange={(e) => setJdPastedText(e.target.value)} placeholder="Paste Job Description here..." className="w-full h-full flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 resize-none placeholder:text-slate-300" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 flex gap-4">
            {isEditing && <button onClick={() => setView('QUESTION_LIST')} className="flex-1 bg-slate-100 text-slate-600 font-black py-5 rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>}
            <button disabled={(!isEditing && (!cvFile || !isJdReady)) || isParsingPDF} onClick={isEditing ? handleUpdateSessionContext : handlePDFUpload} className="flex-[2] bg-indigo-600 text-white font-black py-5 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {(isParsingPDF || isLoadingQuestions) ? <Loader2 className="w-5 h-5 animate-spin" /> : isEditing ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
              {isEditing ? (isLoadingQuestions ? 'Generating...' : 'Save & Re-generate') : 'Prepare Tailored Practice'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'TYPE_SELECT') {
    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl text-center">
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6"><Sparkles className="w-10 h-10" /></div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">Round Type</h3>
          <p className="text-slate-500 mb-10">Choose which round to generate questions for.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {QUESTION_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button key={type.id} onClick={() => fetchQuestions(type.id)} className="p-8 rounded-[2rem] border-2 border-slate-100 hover:border-indigo-600 hover:bg-indigo-50/50 hover:shadow-lg transition-all flex flex-col items-center text-center group">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-slate-400 group-hover:text-indigo-600 transition-colors"><Icon className="w-6 h-6" /></div>
                  <div className="text-lg font-black text-slate-900 group-hover:text-indigo-600 mb-2">{type.label}</div>
                  <div className="text-xs font-medium text-slate-400 leading-relaxed">{type.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'QUESTION_LIST') {
    const currentRound = activeSession?.questions.find(rq => rq.type === qType);
    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
             <div>
               <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{activeSession?.sessionName ? `${activeSession.sessionName} Round` : activeSession?.mode === 'TAILORED' ? 'Application Specific' : `${qType} Round`}</span>
               <h3 className="text-lg font-black text-slate-900">{activeSession?.role} • {qType}</h3>
             </div>
             {(isLoadingQuestions || isFixingQuestions) && <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />}
          </div>
          <div className="space-y-4">
            {(!currentRound || currentRound.list.length === 0) ? (
              <div className="p-12 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                <p className="text-slate-400 font-bold mb-6">No questions generated for this round yet.</p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button onClick={() => fetchQuestions(qType)} className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all">Generate Initial Questions</button>
                  {activeSession?.mode === 'TAILORED' && <button onClick={() => { setSessionName(activeSession.sessionName || ''); setJdPastedText(activeSession.jdText || ''); setCvFile(null); setJdFile(null); setJdInputMethod(activeSession.jdText ? 'TEXT' : 'FILE'); setView('EDIT_SESSION'); }} className="px-6 py-3 bg-slate-100 text-slate-600 font-black rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"><Settings className="w-4 h-4" /> Edit Context</button>}
                </div>
              </div>
            ) : (
              currentRound.list.map((q, i) => (
                <button key={i} onClick={() => handleSelectNewQuestion(q)} className="w-full text-left p-6 bg-white rounded-3xl border border-slate-200 hover:border-indigo-600 hover:shadow-xl transition-all flex items-center justify-between group">
                  <div className="flex items-center gap-6">
                    <span className="text-2xl font-black text-indigo-100 group-hover:text-indigo-200 transition-colors">{i+1 < 10 ? `0${i+1}` : i+1}</span>
                    <span className="text-lg font-bold text-slate-700 leading-snug">{q}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" />
                </button>
              ))
            )}
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-8">
            <button onClick={() => setShowGuidance(!showGuidance)} className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Settings2 className="w-4 h-4" /></div>
                <div className="text-left"><h4 className="text-sm font-black text-slate-900">Add more questions or specific topics</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tailor this round</p></div>
              </div>
              <div className={`transition-transform duration-300 ${showGuidance ? 'rotate-180' : ''}`}><ChevronDown className="w-5 h-5 text-slate-300" /></div>
            </button>
            {showGuidance && (
              <div className="p-6 pt-0 space-y-4 animate-in slide-in-from-top-4 duration-300">
                <textarea value={sampleQuestions} onChange={(e) => setSampleQuestions(e.target.value)} placeholder="E.g., 'Ask about my experience with React' or 'Focus on conflict resolution'..." className="w-full h-32 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-medium text-sm text-slate-700 leading-relaxed resize-none" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={handleAddSampleAsQuestions} disabled={isFixingQuestions || !sampleQuestions.trim()} className="py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">{isFixingQuestions ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-4 h-4" />} Add Custom Questions</button>
                  <button onClick={() => fetchQuestions(qType)} disabled={isLoadingQuestions} className="py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">{isLoadingQuestions ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 8 New AI Questions</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'QA_WORKSPACE') {
    return (
      <div className="max-w-7xl mx-auto py-12">
        {renderHeader()}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
              <div className="mb-6"><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2">{qType} Round</span><h3 className="text-2xl font-black text-slate-900 leading-tight">"{activeQuestion}"</h3></div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Your Raw Story / Bullet Points</label>{activeSession?.mode === 'TAILORED' && <span className="text-[9px] font-black text-indigo-400 uppercase px-2 py-0.5 bg-indigo-50 rounded-lg">Resume Context Linked</span>}</div>
                  <textarea value={personalDetails} onChange={(e) => setPersonalDetails(e.target.value)} placeholder="Note down your experiences or rough points here..." className="w-full h-48 p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-medium text-slate-700 leading-relaxed resize-none" />
                </div>
                <div className="space-y-6">
                   <button onClick={handlePolish} disabled={!personalDetails || isPolishing} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all">{isPolishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />} {polishedAnswer ? "Update Polished Answer" : "Generate Polished Answer"}</button>
                  <div className="space-y-4 pt-2 border-t border-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Style Refinement</p>
                    <div className="flex flex-wrap gap-2 justify-center">{REFINEMENT_OPTIONS.map((opt) => (<button key={opt.id} onClick={() => setSelectedRefinement(selectedRefinement === opt.id ? 'none' : opt.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black transition-all border-2 ${selectedRefinement === opt.id ? opt.color : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}><opt.icon className="w-3.5 h-3.5" /> {opt.label}</button>))}</div>
                  </div>
                  <button onClick={fetchSuggestion} className="w-full py-3 bg-white border-2 border-slate-100 text-slate-500 font-black rounded-2xl hover:border-indigo-100 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">{isLoadingSuggestion ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4" />} Suggested Answer</button>
                </div>
              </div>
            </div>
            {aiSuggestion && (
              <div className="bg-white p-8 rounded-[2.5rem] border-2 border-amber-100 shadow-xl animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                   <div className="flex items-center gap-3"><div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl"><Lightbulb className="w-6 h-6" /></div><h4 className="font-black text-slate-900 text-lg">AI Suggestion</h4></div>
                   <button onClick={() => setAiSuggestion(null)} className="text-xs font-black text-slate-300 uppercase tracking-widest hover:text-slate-500">Dismiss</button>
                </div>
                <div className="space-y-6">
                  <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50"><span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2">Tips</span><p className="text-sm font-bold text-amber-900 leading-relaxed">{aiSuggestion.tips}</p></div>
                  <div className="relative pt-4">
                    <div className="absolute -top-3 -left-3 text-slate-100 -z-0"><Quote className="w-12 h-12 fill-current" /></div>
                    <div className="relative z-10 p-6 bg-white rounded-2xl border-2 border-slate-50 italic text-slate-700 font-medium leading-relaxed">"{aiSuggestion.answer}"</div>
                    <div className="mt-4 flex justify-end gap-3"><button onClick={handleUseSuggestion} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100">{applyingSuggestion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {applyingSuggestion ? 'Applying...' : 'Use this Answer'}</button></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className={`bg-white rounded-[2.5rem] border-2 transition-all p-8 shadow-xl ${polishedAnswer ? 'border-emerald-100' : 'border-slate-100 opacity-50'}`}>
               <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Polished Answer</span>{polishedAnswer && <button onClick={handleSaveQA} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100"><Save className="w-5 h-5" /></button>}</div>
               {isPolishing ? <div className="py-20 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /><p className="text-slate-400 font-bold">Refining your answer...</p></div> : polishedAnswer ? (
                 <div className="space-y-8">
                    <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 text-lg font-bold text-slate-800 leading-relaxed text-center italic">"{polishedAnswer}"</div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between"><h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Speaking Drill</h4><AudioPlayer text={polishedAnswer} label="Model Audio" /></div>
                      {practiceResult ? (
                        <div className={`p-6 rounded-3xl border-2 animate-in zoom-in ${practiceResult.score === 0 ? 'bg-rose-50 border-rose-100' : 'bg-indigo-50 border-indigo-100'}`}>
                           <div className="flex items-center gap-6 mb-4">
                              <div className={`w-20 h-20 bg-white rounded-full border-4 flex flex-col items-center justify-center ${practiceResult.score === 0 ? 'border-rose-400' : 'border-indigo-400'}`}><span className={`text-2xl font-black ${practiceResult.score === 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{practiceResult.score}%</span><span className="text-[8px] font-black text-slate-400 uppercase leading-none">Score</span></div>
                              <div className="flex-1"><span className={`text-[10px] font-black uppercase tracking-widest mb-1 block ${practiceResult.score === 0 ? 'text-rose-400' : 'text-indigo-400'}`}>{practiceResult.score === 0 ? 'Lỗi' : 'Feedback'}</span><p className={`text-xs font-bold italic ${practiceResult.score === 0 ? 'text-rose-700' : 'text-slate-700'}`}>"{practiceResult.feedback}"</p></div>
                           </div>
                           <button onClick={() => setPracticeResult(null)} className={`w-full py-3 bg-white font-black rounded-xl border transition-all flex items-center justify-center gap-2 ${practiceResult.score === 0 ? 'text-rose-600 border-rose-100 hover:bg-rose-50' : 'text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}><RotateCcw className="w-4 h-4" /> {practiceResult.score === 0 ? 'Thử ghi âm lại' : 'Try Again'}</button>
                        </div>
                      ) : <AudioRecorder onRecordingComplete={(base64) => handlePracticeRecording(base64)} isProcessing={isProcessingSpeech} />}
                    </div>
                 </div>
               ) : <div className="py-32 flex flex-col items-center justify-center space-y-4 text-center px-10"><div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200"><MessageSquare className="w-8 h-8" /></div><p className="text-slate-400 font-bold max-w-xs">Draft your points to see the polished professional response here.</p></div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'SAVED_COLLECTION') {
    const groupedQA = progress.interviewPrep.reduce((acc, qa) => {
      const key = `${qa.industry} - ${qa.role} (${qa.seniority})`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(qa);
      return acc;
    }, {} as Record<string, InterviewQA[]>);

    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="flex justify-between items-center mb-8 px-2">
          <div className="flex items-center gap-4"><h3 className="text-xl font-black text-slate-900">Your Q&A Library</h3><button onClick={() => setView('DRILL_HISTORY')} className="px-4 py-2 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"><History className="w-4 h-4" /> History</button></div>
          {selectedQAIds.size > 0 && (<div className="flex gap-2"><button onClick={startDrill} className="bg-slate-900 text-white font-black px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"><Target className="w-5 h-5" /> Start Drill ({selectedQAIds.size})</button><button onClick={startLivePractice} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"><Zap className="w-5 h-5" /> Live Practice</button></div>)}
        </div>
        {progress.interviewPrep.length === 0 ? (
          <div className="py-32 text-center bg-white rounded-[3rem] border border-slate-200 shadow-xl"><div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300"><Save className="w-10 h-10" /></div><h3 className="text-xl font-black text-slate-900 mb-2">Library is Empty</h3><p className="text-slate-400 max-w-xs mx-auto mb-8 font-medium">Your polished interview responses will appear here for review.</p><button onClick={() => setView('LEVEL_SELECT')} className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all">Go Practice</button></div>
        ) : (
          <div className="space-y-10">
            {(Object.entries(groupedQA) as [string, InterviewQA[]][]).map(([group, items]) => (
              <div key={group} className="space-y-4">
                 <div className="flex items-center gap-4 px-2"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">{group}</span><div className="h-px flex-1 bg-slate-200"></div></div>
                 <div className="space-y-2">
                    {items.map(qa => {
                      const latest = getLatestAttemptForQA(qa.id);
                      return (
                        <div key={qa.id} className={`bg-white rounded-3xl border transition-all duration-300 overflow-hidden ${expandedIds.has(qa.id) ? 'border-indigo-200 shadow-lg ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-300 shadow-sm'}`}>
                          <div className="flex items-center px-4">
                            <button onClick={() => toggleSelectQA(qa.id)} className={`p-2 rounded-xl transition-all ${selectedQAIds.has(qa.id) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}>{selectedQAIds.has(qa.id) ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</button>
                            <button onClick={() => toggleExpand(qa.id)} className="flex-1 text-left p-6 flex items-start gap-4">
                              <div className={`mt-1 p-2 rounded-xl ${expandedIds.has(qa.id) ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>{expandedIds.has(qa.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
                              <div className="flex-1 min-w-0">
                                <h4 className={`text-lg font-black ${expandedIds.has(qa.id) ? 'text-indigo-600' : 'text-slate-900'} truncate`}>{qa.question}</h4>
                                {latest && (
                                  <div className="mt-2 flex items-center gap-2">
                                     <button onClick={(e) => { e.stopPropagation(); openLatestSessionForQA(qa.id); }} className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight flex items-center gap-1 transition-all hover:scale-105 ${latest.attempt.score >= 80 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : latest.attempt.score === 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`} title="Click to view full session"><Target className="w-2.5 h-2.5" /> {latest.attempt.score === 0 ? 'Chưa đạt / Không tiếng' : `Latest Drill Score: ${Math.round(latest.attempt.score)}%`}</button>
                                     <span className="text-[8px] font-bold text-slate-300 uppercase">{new Date(latest.session.date).toLocaleDateString()}</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          </div>
                          {expandedIds.has(qa.id) && (
                            <div className="px-7 pb-7 pt-2 animate-in slide-in-from-top-4 duration-300">
                               <div className="space-y-6">
                                  <div className="relative pt-4"><div className="absolute -top-3 -left-3 text-slate-100 -z-0"><Quote className="w-16 h-16 fill-current" /></div><div className="relative z-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 italic font-bold text-slate-700 leading-relaxed text-center">"{qa.polishedAnswer}"</div></div>
                                  <div className="flex items-center justify-between pt-4 border-t border-slate-50"><button onClick={() => { setActiveQuestion(qa.question); setPolishedAnswer(qa.polishedAnswer); setPersonalDetails(qa.personalDetails); setView('QA_WORKSPACE'); }} className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all text-xs">Edit Answer</button><button onClick={() => onDeleteQA(qa.id)} className="p-3 text-slate-300 hover:text-rose-600 transition-all"><Trash2 className="w-5 h-5" /></button></div>
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === 'DRILL_SESSION') {
    const currentQA = drillQASequence[currentDrillIndex];
    if (!currentQA) return null;
    const isLastStep = drillStep === 3;
    const isLastQuestion = currentDrillIndex === drillQASequence.length - 1;
    const contentWordsAnswer = getContentWordsText(currentQA.polishedAnswer);

    return (
      <div className="max-w-5xl mx-auto py-12">
        {renderHeader()}
        <div className="mb-8">
          <div className="flex justify-between items-end mb-4 px-2">
            <div className="flex items-center gap-4"><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Question {currentDrillIndex + 1} of {drillQASequence.length}</span><div className="flex items-center gap-1">{[1, 2, 3].map(s => (<div key={s} className={`h-1.5 w-8 rounded-full transition-all ${drillStep >= s ? 'bg-indigo-600' : 'bg-slate-200'}`} />))}</div></div>
            <span className="text-xs font-black text-slate-400 uppercase">Part {drillStep} of 3</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-700" style={{ width: `${((currentDrillIndex) / drillQASequence.length) * 100 + (drillStep / 3) * (100 / drillQASequence.length)}%` }} /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch">
          <div className="space-y-6 flex flex-col">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex-1 flex flex-col p-8 md:p-12 relative">
              <div className="mb-10 text-center"><div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">{drillStep === 1 ? <Headphones className="w-8 h-8" /> : drillStep === 2 ? <Type className="w-8 h-8" /> : <Brain className="w-8 h-8" />}</div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{drillStep === 1 ? 'Listen to Question' : drillStep === 2 ? 'Master Content Words' : 'Recall & Speak'}</p><h3 className="text-3xl font-black text-slate-900 leading-tight">"{currentQA.question}"</h3>{drillStep > 1 && (<div className="mt-8 p-6 bg-indigo-50 rounded-3xl border border-indigo-100 border-dashed animate-in fade-in"><p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Goal: Content Words Only</p><p className="text-lg font-bold text-indigo-900 leading-relaxed italic">"{contentWordsAnswer}"</p></div>)}</div>
              <div className="mt-auto pt-8 border-t border-slate-100"><AudioPlayer key={`${currentQA.id}-${drillStep}`} text={currentQA.question} label="Listen to Question" autoPlay /></div>
              <div className="absolute top-6 right-6 opacity-5 text-slate-900 pointer-events-none"><Quote className="w-24 h-24 fill-current" /></div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden min-h-[500px] flex flex-col">
              <div className="bg-indigo-600 px-8 py-4 border-b border-indigo-700 flex items-center justify-between"><h3 className="text-[10px] font-black text-white uppercase tracking-widest">{drillStep === 3 ? '1-Minute Timed Challenge' : 'Your Response'}</h3>{isProcessingSpeech && <Loader2 className="w-4 h-4 text-white animate-spin" />}</div>
              <div className="p-8 flex-1 flex flex-col">
                <div className="mb-10"><div className="flex items-center justify-between mb-4"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model Answer</span><AudioPlayer key={`ref-${currentQA.id}-${drillStep}`} text={currentQA.polishedAnswer} label="Reference Audio" /></div><div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 text-lg font-bold text-slate-800 leading-relaxed text-center italic">{practiceResult?.highlights ? (<div className="flex flex-wrap gap-x-2 justify-center">{practiceResult.highlights.map((h, i) => (<span key={i} className={h.isCorrect ? 'text-emerald-600' : 'text-rose-500 underline decoration-rose-200 decoration-2 underline-offset-4'}>{h.word}</span>))}</div>) : (`"${drillStep === 1 ? currentQA.polishedAnswer : contentWordsAnswer}"`)}</div></div>
                {!practiceResult ? (<AudioRecorder onRecordingComplete={handlePracticeRecording} isProcessing={isProcessingSpeech} maxDuration={drillStep === 3 ? 60 : undefined} />) : (
                  <div className="space-y-6 animate-in zoom-in duration-300">
                    <div className={`p-6 rounded-3xl border-2 transition-all ${practiceResult.score === 0 ? 'bg-rose-50 border-rose-200 shadow-rose-100' : 'bg-indigo-50 border-indigo-100 shadow-indigo-100'}`}>
                      <div className="flex items-center gap-6 mb-4"><div className={`w-20 h-20 bg-white rounded-full border-4 flex flex-col items-center justify-center ${practiceResult.score === 0 ? 'border-rose-400' : 'border-indigo-400'}`}><span className={`text-2xl font-black ${practiceResult.score === 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{Math.round(practiceResult.score)}%</span><span className="text-[8px] font-black text-slate-400 uppercase leading-none">Score</span></div><div className="flex-1"><div className="flex items-center gap-2 mb-1">{practiceResult.score === 0 && <AlertTriangle className="w-3 h-3 text-rose-500" />}<span className={`text-[10px] font-black uppercase tracking-widest block ${practiceResult.score === 0 ? 'text-rose-400' : 'text-indigo-400'}`}>{practiceResult.score === 0 ? 'Không phát hiện giọng nói' : 'AI Feedback'}</span></div><p className={`text-xs font-bold italic ${practiceResult.score === 0 ? 'text-rose-800' : 'text-slate-700'}`}>"{practiceResult.feedback}"</p></div></div>
                      <div className="grid grid-cols-2 gap-4"><button onClick={() => setPracticeResult(null)} className={`py-4 bg-white font-black rounded-2xl border transition-all flex items-center justify-center gap-2 ${practiceResult.score === 0 ? 'text-rose-600 border-rose-100 hover:bg-rose-50' : 'text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}><RotateCcw className="w-4 h-4" /> {practiceResult.score === 0 ? 'Thử lại' : 'Retry Part'}</button><button onClick={handleNextDrillStep} disabled={practiceResult.score === 0} className={`py-4 text-white font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${practiceResult.score === 0 ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>{isLastStep ? (isLastQuestion ? 'Finish Drill' : 'Next Question') : 'Next Part'} <ChevronRight className="w-4 h-4" /></button></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'DRILL_SUMMARY' || (view === 'DRILL_HISTORY' && selectedHistorySession)) {
    const session = view === 'DRILL_SUMMARY' ? progress.drillSessions[0] : selectedHistorySession;
    if (!session) return null;
    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in duration-500">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-12 text-white text-center relative"><div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md"><Trophy className="w-12 h-12 text-amber-300" /></div><h2 className="text-4xl font-black mb-4">{view === 'DRILL_SUMMARY' ? 'Drill Complete!' : 'Practice Review'}</h2><div className="inline-flex flex-col items-center px-8 py-4 bg-white/10 rounded-2xl border border-white/10"><span className="text-5xl font-black">{Math.round(session.averageScore)}%</span><span className="text-xs font-black text-indigo-100 uppercase tracking-widest mt-1">Overall Mastery</span></div><p className="text-[10px] text-indigo-200 mt-4 uppercase font-bold tracking-widest">{new Date(session.date).toLocaleDateString()} at {new Date(session.date).toLocaleTimeString()}</p></div>
          <div className="p-10 space-y-10">
            <div className="p-8 bg-indigo-50 rounded-3xl border border-indigo-100"><div className="flex items-center gap-3 mb-4"><Sparkles className="w-6 h-6 text-indigo-600" /><h4 className="font-black text-slate-900">AI Performance Review</h4></div><p className="text-slate-700 font-bold leading-relaxed">{session.generalFeedback}</p></div>
            <div className="flex gap-4"><button onClick={startLivePractice} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3"><Zap className="w-5 h-5" /> Start Live Interview Practice</button></div>
            <div className="space-y-6"><h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2"><ListChecks className="w-4 h-4" /> Average Score Breakdown</h4><div className="space-y-4">{session.attempts.map((att, i) => (<div key={i} className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden hover:border-indigo-100 transition-all shadow-sm"><div className="p-6 flex items-center justify-between gap-6 border-b border-slate-50 bg-slate-50/30"><div className="flex items-center gap-6 flex-1 min-w-0"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${att.score >= 80 ? 'bg-emerald-50 text-white' : att.score === 0 ? 'bg-rose-50 text-white' : 'bg-slate-100 text-slate-400'}`}>{Math.round(att.score)}%</div><div className="min-w-0"><h5 className="text-sm font-black text-slate-900 truncate">"{att.question}"</h5><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 italic">Aggregated Mastery: {Math.round(att.score)}%</p></div></div></div><div className="p-6 space-y-4"><div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-sm font-medium text-slate-600 leading-relaxed">{att.highlights && att.highlights.length > 0 ? (<div className="flex flex-wrap gap-x-1.5">{att.highlights.map((h, hi) => (<span key={hi} className={h.isCorrect ? 'text-emerald-600' : 'text-rose-500 underline decoration-rose-100 underline-offset-4'}>{h.word}</span>))}</div>) : att.answer}</div></div></div>))}</div></div>
            <button onClick={() => { setView('SAVED_COLLECTION'); setSelectedHistorySession(null); }} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">Back to Library <ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'DRILL_HISTORY') {
    return (
      <div className="max-w-4xl mx-auto py-12">
        {renderHeader()}
        <div className="flex items-center justify-between mb-8 px-2"><h3 className="text-xl font-black text-slate-900">Drill History</h3><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{progress.drillSessions.length} Past Sessions</span></div>
        {progress.drillSessions.length === 0 ? (
          <div className="py-32 text-center bg-white rounded-[3rem] border border-slate-200 shadow-xl"><div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300"><History className="w-10 h-10" /></div><h3 className="text-xl font-black text-slate-900 mb-2">No History Yet</h3><p className="text-slate-400 max-w-xs mx-auto mb-8 font-medium">Complete your first practice drill to start building your history.</p><button onClick={() => setView('SAVED_COLLECTION')} className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all">Go to Library</button></div>
        ) : (
          <div className="space-y-4">{progress.drillSessions.map(session => (<button key={session.id} onClick={() => setSelectedHistorySession(session)} className="w-full group p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-indigo-600 hover:shadow-xl transition-all flex items-center justify-between text-left"><div className="flex items-center gap-6"><div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 border-2 transition-colors ${session.averageScore >= 80 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : session.averageScore === 0 ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-slate-100 bg-slate-50 text-slate-400'}`}><span className="text-xl font-black leading-none">{Math.round(session.averageScore)}%</span><span className="text-[8px] font-bold uppercase tracking-widest mt-1">Mastery</span></div><div><h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">Session with {session.attempts.length} Questions</h4><div className="flex items-center gap-3 mt-1"><p className="text-xs font-bold text-slate-400">{new Date(session.date).toLocaleDateString()} • {new Date(session.date).toLocaleTimeString()}</p></div></div></div><ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /></button>))}</div>
        )}
      </div>
    );
  }

  return null;
};

export default InterviewPrepView;