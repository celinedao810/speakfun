"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ExercisePack, PhonicSound, LearnerPreferences } from '@/lib/types';
import { generateDailyPack, generateEndingSoundPack, generateLinkingSoundPack, scorePronunciation, scoreEndingSoundPronunciation, PronunciationResult } from '@/lib/services/geminiService';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';
import { 
  Loader2, Sparkles, RotateCcw, ArrowRight, PlayCircle, History, 
  MessageSquare, Headphones, Gamepad2, Layers, CheckCircle2, 
  XCircle, Trophy, Volume2, Clock, Target, Ghost, Check, X, Info, BookOpen,
  Keyboard, ListChecks, AlertCircle, RefreshCw, Quote, Ear
} from 'lucide-react';

interface Attempt {
  id: string;
  timestamp: number;
  audioUrl: string;
  result: PronunciationResult;
}

interface GameWord {
  id: string;
  text: string;
  targetSound: string;
  x: number;
  y: number;
  speed: number;
  isActive: boolean;
}

interface GameResults {
  correct: string[];
  wrong: string[];
}

interface ExerciseViewProps {
  sound: PhonicSound;
  day: number;
  preferences?: LearnerPreferences;
  onComplete: (score: number, detailedScores: any) => void;
}

const ExerciseView: React.FC<ExerciseViewProps> = ({ sound, day, preferences, onComplete }) => {
  const [step, setStep] = useState(1);
  const [pack, setPack] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChildRecording, setIsChildRecording] = useState(false);
  const [autoAdvanceAfterAssessment, setAutoAdvanceAfterAssessment] = useState(false);
  const [stepScores, setStepScores] = useState<Record<number, number>>({});
  
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const stepRef = useRef(step);

  useEffect(() => { stepRef.current = step; }, [step]);

  // Specific state for Ending Sounds (New 5-step flow)
  const [step1Phase, setStep1Phase] = useState<'examples' | 'summary' | 'quiz'>('examples');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<boolean[]>([]);
  const [quizSelection, setQuizSelection] = useState<string | null>(null);
  const [step4PhraseIndex, setStep4PhraseIndex] = useState(0);
  const [step4Scores, setStep4Scores] = useState<number[]>([]);
  
  // Specific state for Games
  const [gameWords, setGameWords] = useState<GameWord[]>([]);
  const [gameScore, setGameScore] = useState(0);
  const [gameIsOver, setGameIsOver] = useState(false);
  const [draggedWordId, setDraggedWordId] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResults>({ correct: [], wrong: [] });
  const gameLoopRef = useRef<number | null>(null);
  const [oddRound, setOddRound] = useState(0);
  const [oddRoundScores, setOddRoundScores] = useState<number[]>([]);
  const [oddSelection, setOddSelection] = useState<number | null>(null);

  // Specific state for Linking Sounds
  const [linkStepIndex, setLinkStepIndex] = useState(0);
  const [dictationInput, setDictationInput] = useState('');
  const [isDictationCorrect, setIsDictationCorrect] = useState<boolean | null>(null);
  const [linkScores, setLinkScores] = useState<number[]>([]);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Specific state for Standard Phonetics (Minimal Pairs Game)
  const [minimalPairIndex, setMinimalPairIndex] = useState(0);
  const [pairTargetType, setPairTargetType] = useState<'A' | 'B'>('A');
  const [pairSelectedType, setPairSelectedType] = useState<'A' | 'B' | null>(null);
  const [minimalPairScores, setMinimalPairScores] = useState<number[]>([]);

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [showingRecorder, setShowingRecorder] = useState(true);

  const isEndingSoundDrill = sound.type === 'ENDING_PATTERN';
  const isLinkingSoundDrill = sound.type === 'LINKING_PATTERN';
  const totalSteps = isEndingSoundDrill ? 5 : (isLinkingSoundDrill ? 4 : 5);

  // Helper to normalize sound values (strip slashes that AI sometimes includes)
  const normalizeSound = (s: string | undefined) => s?.replace(/\//g, '') || '';

  useEffect(() => {
    const fetchPack = async () => {
      setIsLoading(true);
      try {
        let content;
        if (isEndingSoundDrill) {
          content = await generateEndingSoundPack(sound.patternGroup!, preferences);
        } else if (isLinkingSoundDrill) {
          content = await generateLinkingSoundPack(preferences);
        } else {
          content = await generateDailyPack(sound.symbol, day, preferences);
        }
        setPack(content);
        
        // Initialize standard phonetic pair game
        if (content && Array.isArray(content.minimalPairs) && content.minimalPairs.length > 0) {
          setPairTargetType(Math.random() > 0.5 ? 'A' : 'B');
        }
      } catch (err) { console.error("SpeakFun: Failed to fetch exercise pack", err); }
      finally { setIsLoading(false); }
    };
    fetchPack();
  }, [sound.symbol, day, preferences, isEndingSoundDrill, isLinkingSoundDrill]);

  useEffect(() => {
    if (step === 2 && isEndingSoundDrill && pack?.step2Game && !gameIsOver) {
      // Initialize words with staggered start positions (one by one entry)
      // Speed calculation: 1.2x base speed, with spacing that prevents overlap
      const baseSpeed = 0.15; // 1.2x speed - words move faster
      const wordHeight = 8; // Approximate height of a word element in % units
      const minGap = 12; // Minimum gap between words in % units
      const verticalSpacing = wordHeight + minGap; // ~20% spacing between words

      const initial = pack.step2Game.map((g: any, i: number) => ({
        id: `gw-${i}`,
        text: g.word,
        targetSound: g.endingLetters || normalizeSound(g.sound),
        x: Math.random() * 70 + 15, // Random horizontal position (15-85%)
        y: -15 - (i * verticalSpacing), // Stagger start: first at -15, next at -35, etc.
        speed: baseSpeed + (Math.random() * 0.03), // Speed variation (0.15-0.18)
        isActive: true
      }));
      setGameWords(initial);

      const loop = () => {
        setGameWords(prev => {
          const next = prev.map(w => {
            if (!w.isActive) return w;
            const nextY = w.y + w.speed;
            if (nextY > 85) { // Word falls off screen
              setGameResults(res => ({ ...res, wrong: [...res.wrong, w.text] }));
              return { ...w, isActive: false };
            }
            return { ...w, y: nextY };
          });
          if (next.length > 0 && next.every(w => !w.isActive)) setGameIsOver(true);
          return next;
        });
        gameLoopRef.current = requestAnimationFrame(loop);
      };
      gameLoopRef.current = requestAnimationFrame(loop);
    }
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [step, isEndingSoundDrill, pack?.step2Game, gameIsOver]);

  useEffect(() => {
    if (autoAdvanceAfterAssessment && attempts.length > 0 && !isProcessing) {
      setAutoAdvanceAfterAssessment(false);
      handleContinue();
    }
  }, [attempts, isProcessing, autoAdvanceAfterAssessment]);

  const handleSpeechAssessment = async (base64: string, audioUrl: string) => {
    setIsProcessing(true);
    try {
      let targetText = "";
      const currentStep = stepRef.current;

      if (isEndingSoundDrill) {
        if (currentStep === 4) targetText = pack?.step4Phrases?.[step4PhraseIndex]?.phrase || "";
        else if (currentStep === 5) targetText = pack?.shortStory || "";
      } else if (isLinkingSoundDrill) {
        if (currentStep === 1) targetText = pack?.step1Examples?.[linkStepIndex]?.phrase || "";
        else if (currentStep === 3) {
          targetText = linkStepIndex < 3 ? (pack?.step3Build?.components?.[linkStepIndex] || "") : (pack?.step3Build?.fullSentence || "");
        }
        else if (currentStep === 4) targetText = pack?.step4Mastery?.sentence || "";
      } else {
        if (currentStep === 1) targetText = sound.symbol;
        else if (currentStep === 2) targetText = pairTargetType === 'A' ? (pack?.minimalPairs?.[minimalPairIndex]?.wordA || "") : (pack?.minimalPairs?.[minimalPairIndex]?.wordB || "");
        else if (currentStep === 3) targetText = pack?.targetWord?.word || "";
        else if (currentStep === 4) targetText = pack?.tongueTwister || "";
        else if (currentStep === 5) targetText = pack?.shortStory || "";
      }

      if (!targetText) throw new Error("Could not determine target text for assessment.");

      // Use specialized scoring for ending sound exercises (step 4 & 5)
      let result;
      if (isEndingSoundDrill && (currentStep === 4 || currentStep === 5)) {
        const targetSounds = sound.patternGroup === 'PLURALS' ? ['s', 'z', 'ɪz'] : ['t', 'd', 'ɪd'];
        result = await scoreEndingSoundPronunciation(targetText, base64, targetSounds);
      } else {
        result = await scorePronunciation(targetText, base64, false, false);
      }
      // Cap AI score at 100 to prevent scores > 100%
      const cappedResult = { ...result, score: Math.min(100, Math.max(0, result.score || 0)) };
      const newAttempt = { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), audioUrl, result: cappedResult };

      setAttempts([newAttempt]);
      setShowingRecorder(false);
    } catch (err) { console.error(err); }
    finally { setIsProcessing(false); }
  };

  const handleMinimalPairSelection = (selected: 'A' | 'B') => {
    if (pairSelectedType !== null) return;
    setPairSelectedType(selected);
    const isCorrect = selected === pairTargetType;
    setMinimalPairScores([...minimalPairScores, isCorrect ? 100 : 0]);
  };

  const handleDictationCheck = () => {
    if (!pack?.step2Dictation?.[linkStepIndex]) return;
    const target = pack.step2Dictation[linkStepIndex].phrase.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    const input = dictationInput.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
    setIsDictationCorrect(target === input);
  };

  const handleContinue = () => {
    if (isChildRecording) {
      setAutoAdvanceAfterAssessment(true);
      recorderRef.current?.stop();
      return;
    }

    const latestScore = attempts[0]?.result.score ?? (pairSelectedType !== null ? (pairSelectedType === pairTargetType ? 100 : 0) : (isDictationCorrect ? 100 : 0));

    if (isEndingSoundDrill) {
      // Step 1: Pattern Recognition with phases
      if (step === 1) {
        if (step1Phase === 'examples') {
          setStep1Phase('summary');
          return;
        } else if (step1Phase === 'summary') {
          setStep1Phase('quiz');
          return;
        } else if (step1Phase === 'quiz' && quizIndex < (pack?.step1?.quiz?.length || 6) - 1) {
          setQuizIndex(prev => prev + 1);
          setQuizSelection(null);
          return;
        }
      }
      // Step 3: Odd one out rounds
      else if (step === 3 && oddRound < 2) {
        setOddRound(prev => prev + 1);
        setOddSelection(null);
        return;
      }
      // Step 4: Industry phrases (2 phrases)
      else if (step === 4 && step4PhraseIndex < 1) {
        setStep4PhraseIndex(1);
        setStep4Scores([...step4Scores, latestScore]);
        setAttempts([]);
        setShowingRecorder(true);
        return;
      }
    } else if (isLinkingSoundDrill) {
      if (step === 1 && linkStepIndex < (pack?.step1Examples?.length || 1) - 1) { 
        setLinkStepIndex(prev => prev + 1); 
        setLinkScores([...linkScores, latestScore]); 
        setAttempts([]); setShowingRecorder(true); return; 
      }
      else if (step === 2 && linkStepIndex < (pack?.step2Dictation?.length || 1) - 1) { 
        setLinkStepIndex(prev => prev + 1); 
        setDictationInput(''); setIsDictationCorrect(null); setAudioError(null); return; 
      }
      else if (step === 3 && linkStepIndex < 3) { 
        setLinkStepIndex(prev => prev + 1); 
        setLinkScores([...linkScores, latestScore]); 
        setAttempts([]); setShowingRecorder(true); return; 
      }
    } else {
      // PHONETIC_DAY logic
      if (step === 2 && minimalPairIndex < (pack?.minimalPairs?.length || 1) - 1) {
        setMinimalPairIndex(prev => prev + 1);
        setPairTargetType(Math.random() > 0.5 ? 'A' : 'B');
        setPairSelectedType(null);
        setAttempts([]); setShowingRecorder(true); return;
      }
    }

    let finalStepScore = latestScore;

    if (isLinkingSoundDrill && step === 3) {
      finalStepScore = ([...linkScores, latestScore].reduce((a, b) => a + b, 0) / 4);
    } else if (step === 2 && !isEndingSoundDrill && !isLinkingSoundDrill) {
      finalStepScore = ([...minimalPairScores, (pairSelectedType === pairTargetType ? 100 : 0)].reduce((a, b) => a + b, 0) / (pack?.minimalPairs?.length || 1));
    } else if (isEndingSoundDrill && step === 1) {
      // Step 1 quiz score
      const correctCount = quizAnswers.filter(a => a).length;
      finalStepScore = Math.round((correctCount / (pack?.step1?.quiz?.length || 6)) * 100);
    } else if (isEndingSoundDrill && step === 2) {
      // Drag-and-drop game score
      finalStepScore = gameScore;
    } else if (isEndingSoundDrill && step === 3) {
      // Odd one out score (average of 3 rounds)
      const currentRoundScore = oddSelection === pack?.step3OddOneOut?.[oddRound]?.oddIndex ? 100 : 0;
      const allOddScores = [...oddRoundScores, currentRoundScore];
      finalStepScore = Math.round(allOddScores.reduce((a, b) => a + b, 0) / 3);
    } else if (isEndingSoundDrill && step === 4) {
      // Industry phrases score (average of 2 phrases)
      const allPhraseScores = [...step4Scores, latestScore];
      finalStepScore = allPhraseScores.reduce((a, b) => a + b, 0) / 2;
    }

    // Cap final step score to 0-100 range
    finalStepScore = Math.min(100, Math.max(0, finalStepScore));

    const nextScores = { ...stepScores, [step]: finalStepScore };
    setStepScores(nextScores);

    // Reset states for next step
    setAttempts([]); setShowingRecorder(true); setLinkStepIndex(0); setDictationInput(''); setIsDictationCorrect(null); setLinkScores([]); setAudioError(null); setMinimalPairIndex(0); setPairSelectedType(null); setMinimalPairScores([]);

    // Reset game states for ending sound drills
    if (isEndingSoundDrill) {
      setGameWords([]); setGameScore(0); setGameIsOver(false); setGameResults({ correct: [], wrong: [] });
      setOddRound(0); setOddRoundScores([]); setOddSelection(null);
      setStep1Phase('examples'); setQuizIndex(0); setQuizAnswers([]); setQuizSelection(null);
      setStep4PhraseIndex(0); setStep4Scores([]);
    }
    
    if (step < totalSteps) setStep(step + 1);
    else {
      const scoreValues = Object.values(nextScores) as number[];
      onComplete(scoreValues.reduce((a, b) => a + b, 0) / totalSteps, nextScores);
    }
  };

  const playWordAudio = async (text: string) => {
    if (!text) return;
    setAudioError(null);
    setIsAudioLoading(true);

    // Use browser's built-in Speech Synthesis API directly
    if (!('speechSynthesis' in window)) {
      setAudioError('Trình duyệt không hỗ trợ phát âm thanh');
      setIsAudioLoading(false);
      return;
    }

    try {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;

      // Get voices (may need to wait for them to load)
      let voices = speechSynthesis.getVoices();
      if (voices.length === 0) {
        await new Promise<void>(resolve => {
          const handler = () => {
            voices = speechSynthesis.getVoices();
            resolve();
          };
          speechSynthesis.onvoiceschanged = handler;
          setTimeout(resolve, 500);
        });
      }

      // Find a good English voice
      const englishVoice = voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes('google'))
        || voices.find(v => v.lang === 'en-US')
        || voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;

      utterance.onend = () => setIsAudioLoading(false);
      utterance.onerror = () => setIsAudioLoading(false);

      speechSynthesis.speak(utterance);
    } catch (e: any) {
      console.error('Speech synthesis error:', e);
      setAudioError(e.message || 'Lỗi phát âm thanh');
      setIsAudioLoading(false);
    }
  };

  if (isLoading) return <div className="flex flex-col items-center justify-center py-32 space-y-4"><Loader2 className="w-12 h-12 text-indigo-600 animate-spin" /><p className="text-slate-500 font-bold">Chuẩn bị bài tập...</p></div>;
  if (!pack) return <div className="p-8 text-center text-rose-500 font-bold">Lỗi tải dữ liệu.</div>;

  return (
    <div className="max-w-6xl mx-auto pb-12 px-4">
      <div className="mb-8">
        <div className="flex justify-between items-end mb-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{sound.symbol} MASTERCLASS</span>
            <h2 className="text-3xl font-black text-slate-900 leading-none">Bước {step}: {
              isEndingSoundDrill ? ['Nhận diện mẫu', 'Trò chơi kéo thả', 'Tìm từ lạ', 'Cụm từ chuyên ngành', 'Đọc văn'][step-1] : 
              isLinkingSoundDrill ? ['Quy tắc nối âm', 'Nghe & Viết', 'Xây dựng câu', 'Làm chủ nối âm'][step-1] :
              ['Phát âm', 'Phân biệt', 'Từ chuyên ngành', 'Lắt léo', 'Đọc văn'][step-1]
            }</h2>
          </div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">{step}/{totalSteps} HOÀN THÀNH</span>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex gap-1 p-0.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`flex-1 h-full rounded-full transition-all duration-700 ${step > i ? 'bg-indigo-600' : 'bg-slate-300'}`} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-stretch">
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Headphones className="w-3.5 h-3.5" /> NỘI DUNG LỚP HỌC</span>
          </div>
          <div className="p-8 md:p-10 flex-1 flex flex-col justify-center">
            {isLinkingSoundDrill && step === 1 && pack.step1Examples?.[linkStepIndex] && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-8 bg-indigo-50 rounded-3xl border-2 border-indigo-100">
                  <div className="flex items-center gap-3 mb-4"><Info className="w-6 h-6 text-indigo-600" /><h3 className="font-black text-slate-900">Quy tắc Nối âm (Consonant-Vowel)</h3></div>
                  <p className="text-sm font-bold text-indigo-900 leading-relaxed mb-8">{pack.linkingRules}</p>
                  
                  <div className="space-y-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Luyện tập (Ví dụ {linkStepIndex + 1}/3):</span>
                    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] border-2 border-indigo-100 shadow-sm">
                      <span className="text-4xl font-black text-indigo-600 mb-2">{pack.step1Examples[linkStepIndex].phrase}</span>
                      <p className="text-xs font-bold text-slate-400 mb-6 italic">{pack.step1Examples[linkStepIndex].explanation}</p>
                      <button onClick={() => playWordAudio(pack.step1Examples[linkStepIndex].phrase)} className="p-4 bg-indigo-50 hover:bg-indigo-100 rounded-2xl text-indigo-600 transition-colors flex items-center gap-2">
                        {isAudioLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Volume2 className="w-6 h-6" />}
                        <span className="text-xs font-black uppercase tracking-widest">Nghe mẫu</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {isLinkingSoundDrill && step === 2 && pack.step2Dictation?.[linkStepIndex] && (
              <div className="space-y-8 animate-in fade-in text-center">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Keyboard className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Nghe và viết lại cụm từ</h3>
                <p className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest">Ví dụ {linkStepIndex + 1}/3</p>
                
                {audioError && (
                  <div className="p-4 bg-rose-50 border-2 border-rose-100 rounded-2xl text-rose-600 text-xs font-bold flex items-center gap-3 mb-4 animate-in shake">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1">{audioError}</span>
                    <button onClick={() => playWordAudio(pack.step2Dictation[linkStepIndex]?.phrase)} className="p-2 bg-white rounded-lg hover:bg-rose-100 transition-colors border border-rose-200">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="p-10 bg-slate-50 rounded-[3rem] border-2 border-slate-100 shadow-inner space-y-8">
                  <button 
                    onClick={() => playWordAudio(pack.step2Dictation[linkStepIndex]?.phrase)} 
                    disabled={isAudioLoading}
                    className="w-24 h-24 bg-white rounded-full border-4 border-indigo-100 text-indigo-600 shadow-sm flex items-center justify-center mx-auto hover:scale-110 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isAudioLoading ? <Loader2 className="w-10 h-10 animate-spin" /> : <Volume2 className="w-10 h-10" />}
                  </button>
                  <input 
                    type="text" 
                    value={dictationInput}
                    onChange={(e) => setDictationInput(e.target.value)}
                    placeholder="Nhập cụm từ bạn nghe được..."
                    className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-center font-black text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                  {isDictationCorrect === null ? (
                    <button onClick={handleDictationCheck} disabled={!dictationInput.trim()} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all">Kiểm tra</button>
                  ) : (
                    <div className={`p-4 rounded-2xl border-2 flex items-center justify-center gap-3 animate-in zoom-in ${isDictationCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                      {isDictationCorrect ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      <span className="font-black uppercase tracking-widest">{isDictationCorrect ? 'Chính xác!' : `Sai rồi! Đáp án: ${pack.step2Dictation[linkStepIndex]?.phrase}`}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isLinkingSoundDrill && step === 3 && pack.step3Build && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-8 bg-indigo-50 rounded-3xl border-2 border-indigo-100">
                  <div className="flex items-center gap-3 mb-6"><ListChecks className="w-6 h-6 text-indigo-600" /><h3 className="font-black text-slate-900">Xây dựng câu hoàn chỉnh</h3></div>
                  
                  <div className="grid grid-cols-1 gap-3 mb-8">
                    {(pack.step3Build.components || []).map((comp: string, i: number) => (
                      <div key={i} className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${linkStepIndex === i ? 'bg-white border-indigo-600 shadow-md scale-105' : i < linkStepIndex ? 'bg-emerald-50 border-emerald-200 opacity-60' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                        <span className="text-sm font-black text-slate-700">{comp}</span>
                        {i < linkStepIndex && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </div>
                    ))}
                    <div className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${linkStepIndex === 3 ? 'bg-white border-indigo-600 shadow-md scale-105' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                      <span className="text-sm font-black text-slate-700 italic">Ghi âm toàn bộ câu</span>
                      {linkStepIndex > 3 && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </div>
                  </div>

                  <div className="p-10 bg-white rounded-[2.5rem] border-2 border-indigo-100 shadow-sm text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Đang luyện tập:</span>
                    <span className="text-2xl font-black text-indigo-600 leading-tight">
                      {linkStepIndex < 3 ? pack.step3Build.components?.[linkStepIndex] : pack.step3Build.fullSentence}
                    </span>
                    <div className="mt-8">
                      <AudioPlayer key={linkStepIndex} text={linkStepIndex < 3 ? pack.step3Build.components?.[linkStepIndex] : pack.step3Build.fullSentence} label="Mẫu Audio" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isLinkingSoundDrill && step === 4 && pack.step4Mastery && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-10 bg-indigo-600 text-white rounded-[3rem] shadow-xl text-center space-y-6">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto"><Trophy className="w-8 h-8 text-amber-300" /></div>
                  <h3 className="text-2xl font-black leading-tight">"{pack.step4Mastery.sentence}"</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(pack.step4Mastery.linkingPoints || []).map((pt: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase border border-white/10">{pt}</span>
                    ))}
                  </div>
                </div>
                <AudioPlayer text={pack.step4Mastery.sentence} label="Mastery Reference Audio" />
              </div>
            )}

            {/* ENDING SOUND DRILL - Step 1: Pattern Recognition (3 phases) */}
            {isEndingSoundDrill && step === 1 && pack.step1 && (
              <div className="space-y-6 animate-in fade-in">
                {/* Phase: Examples */}
                {step1Phase === 'examples' && (
                  <div className="space-y-6">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Nhận diện mẫu phát âm</h3>
                      <p className="text-sm text-slate-500 mt-1">Học cách nhận biết âm cuối qua các ví dụ</p>
                    </div>

                    {pack.step1.groups?.map((group: any, gIdx: number) => (
                      <div key={gIdx} className="p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl font-black text-indigo-600">/{normalizeSound(group.sound)}/</span>
                          <span className="text-xs font-bold text-slate-500">{group.rule}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {group.words?.map((w: any, wIdx: number) => (
                            <button
                              key={wIdx}
                              onClick={() => playWordAudio(w.word)}
                              className="p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all text-center group"
                            >
                              <span className="text-lg font-bold text-slate-800 block text-center">
                                {w.word.slice(0, -2)}
                                <span className="underline decoration-2 decoration-indigo-500">{w.word.slice(-2)}</span>
                              </span>
                              <span className="text-[10px] text-slate-400">{w.ipa}</span>
                              <Volume2 className="w-3 h-3 text-slate-300 mx-auto mt-1 group-hover:text-indigo-500" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => setStep1Phase('summary')}
                      className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      Tiếp tục <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Phase: Summary */}
                {step1Phase === 'summary' && (
                  <div className="space-y-6">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Info className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Tóm tắt quy tắc</h3>
                    </div>

                    <div className="p-6 bg-indigo-50 rounded-2xl border-2 border-indigo-100">
                      <p className="text-sm font-bold text-indigo-900 leading-relaxed whitespace-pre-line">{pack.step1.summary}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {pack.step1.groups?.map((group: any, gIdx: number) => (
                        <div key={gIdx} className="p-4 bg-white rounded-xl border-2 border-slate-100 text-center">
                          <span className="text-2xl font-black text-indigo-600 block mb-1">/{normalizeSound(group.sound)}/</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{group.words?.length || 0} từ</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => setStep1Phase('quiz')}
                      className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      Bắt đầu Quiz <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Phase: Quiz (one-by-one) */}
                {step1Phase === 'quiz' && pack.step1.quiz?.[quizIndex] && (
                  <div className="space-y-6">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Target className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Quiz: Chọn âm cuối đúng</h3>
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-2">
                        Câu {quizIndex + 1} / {pack.step1.quiz.length}
                      </p>
                    </div>

                    <div className="p-8 bg-slate-50 rounded-[2rem] border-2 border-slate-100 text-center">
                      <button
                        onClick={() => playWordAudio(pack.step1.quiz[quizIndex].word)}
                        className="mb-6 p-4 bg-white rounded-full border-2 border-indigo-100 hover:scale-110 transition-transform"
                      >
                        {isAudioLoading ? <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /> : <Volume2 className="w-8 h-8 text-indigo-600" />}
                      </button>
                      <span className="text-4xl font-black text-slate-800 block text-center">
                        {pack.step1.quiz[quizIndex].word.slice(0, -pack.step1.quiz[quizIndex].endingLetters.length)}
                        <span className="underline decoration-4 decoration-indigo-500">{pack.step1.quiz[quizIndex].endingLetters}</span>
                      </span>
                      <p className="text-xs text-slate-400 mt-3">Nhấn để nghe, sau đó chọn âm cuối đúng</p>
                    </div>

                    {(() => {
                      const isPastTense = sound.patternGroup === 'PAST_TENSE';
                      const sounds = isPastTense ? ['t', 'd', 'ɪd'] : ['s', 'z', 'ɪz'];
                      const context = isPastTense ? 'quá khứ' : 'số nhiều';

                      return (
                        <div className="grid grid-cols-3 gap-3">
                          {sounds.map(s => {
                            const isSelected = quizSelection === s;
                            const isCorrect = normalizeSound(pack.step1.quiz[quizIndex].correctSound) === s;
                            const showResult = quizSelection !== null;

                            return (
                              <button
                                key={s}
                                onClick={() => {
                                  if (quizSelection === null) {
                                    setQuizSelection(s);
                                    const correct = s === normalizeSound(pack.step1.quiz[quizIndex].correctSound);
                                    setQuizAnswers([...quizAnswers, correct]);
                                  }
                                }}
                                disabled={quizSelection !== null}
                                className={`p-5 rounded-2xl border-3 transition-all text-center ${
                                  !showResult
                                    ? 'bg-white border-slate-200 hover:border-indigo-400'
                                    : isCorrect
                                      ? 'bg-emerald-50 border-emerald-500'
                                      : isSelected
                                        ? 'bg-rose-50 border-rose-500'
                                        : 'bg-white border-slate-100 opacity-50'
                                }`}
                              >
                                <span className="text-3xl font-black text-indigo-600">/{s}/</span>
                                {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mt-2" />}
                                {showResult && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-500 mx-auto mt-2" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {quizSelection !== null && (
                      <div className={`p-4 rounded-2xl text-center ${
                        quizSelection === normalizeSound(pack.step1.quiz[quizIndex].correctSound)
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}>
                        <p className="font-black">
                          {quizSelection === normalizeSound(pack.step1.quiz[quizIndex].correctSound)
                            ? 'Chính xác!'
                            : `Chưa đúng! Đáp án là /${normalizeSound(pack.step1.quiz[quizIndex].correctSound)}/`}
                        </p>
                      </div>
                    )}

                    {/* Progress dots */}
                    <div className="flex justify-center gap-2">
                      {pack.step1.quiz.map((_: any, i: number) => (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${
                            i < quizIndex ? (quizAnswers[i] ? 'bg-emerald-500' : 'bg-rose-500') :
                            i === quizIndex ? 'bg-indigo-600 scale-125' :
                            'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ENDING SOUND DRILL - Step 2: Drag-and-Drop Game */}
            {isEndingSoundDrill && step === 2 && pack?.step2Game && (
              <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                <div className="text-center mb-2">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Gamepad2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Kéo và thả từ vào đúng nhóm</h3>
                  <p className="text-sm text-slate-500 mt-1">Kéo từ để nghe phát âm, sau đó thả vào nhóm âm đúng</p>
                </div>

                {/* Game Area */}
                <div
                  className="relative flex-1 min-h-[300px] bg-gradient-to-b from-slate-50 to-slate-100 rounded-3xl border-2 border-slate-200 overflow-hidden"
                >
                  {/* Falling Words - only show words that have entered the visible area */}
                  {gameWords.filter(w => w.isActive && w.y > -15).map(word => (
                    <div
                      key={word.id}
                      draggable
                      onDragStart={() => {
                        setDraggedWordId(word.id);
                        playWordAudio(word.text); // Play audio when drag starts
                      }}
                      onDragEnd={() => setDraggedWordId(null)}
                      className={`absolute px-4 py-2 bg-white rounded-xl border-2 border-indigo-200 shadow-md cursor-grab active:cursor-grabbing transition-transform hover:scale-105 select-none ${
                        draggedWordId === word.id ? 'opacity-50 scale-95' : ''
                      }`}
                      style={{
                        left: `${word.x}%`,
                        top: `${Math.max(0, word.y)}%`,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <span className="font-bold text-slate-800">
                        {word.text.slice(0, -word.targetSound.length)}
                        <span className="underline decoration-2 decoration-indigo-500">{word.targetSound}</span>
                      </span>
                    </div>
                  ))}

                  {/* Game Over Overlay */}
                  {gameIsOver && (
                    <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                      <div className="text-center">
                        <Trophy className={`w-16 h-16 mx-auto mb-4 ${gameScore >= 80 ? 'text-amber-500' : 'text-slate-400'}`} />
                        <p className="text-4xl font-black text-indigo-600">{gameScore}%</p>
                        <p className="text-sm text-slate-500 mt-2">
                          {gameResults.correct.length} đúng / {gameResults.wrong.length} sai
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Drop Zone Categories */}
                <div className="grid grid-cols-3 gap-3">
                  {(sound.patternGroup === 'PLURALS' ? ['s', 'z', 'ɪz'] : ['t', 'd', 'ɪd']).map(category => (
                    <div
                      key={category}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedWordId || gameIsOver) return;
                        const word = gameWords.find(w => w.id === draggedWordId);
                        if (!word) return;

                        // Find the word data to get the correct sound
                        const wordData = pack.step2Game.find((g: any) => g.word === word.text);
                        const correctSound = normalizeSound(wordData?.sound) || '';
                        const isCorrect = category === correctSound;

                        if (isCorrect) {
                          setGameResults(res => ({ ...res, correct: [...res.correct, word.text] }));
                          setGameScore(prev => {
                            const total = pack.step2Game.length;
                            const newCorrect = gameResults.correct.length + 1;
                            return Math.round((newCorrect / total) * 100);
                          });
                        } else {
                          setGameResults(res => ({ ...res, wrong: [...res.wrong, word.text] }));
                        }

                        setGameWords(prev => prev.map(w =>
                          w.id === draggedWordId ? { ...w, isActive: false } : w
                        ));
                        setDraggedWordId(null);

                        // Check if game is over
                        const remaining = gameWords.filter(w => w.isActive && w.id !== draggedWordId);
                        if (remaining.length === 0) {
                          setGameIsOver(true);
                        }
                      }}
                      className={`p-6 rounded-2xl border-3 border-dashed text-center transition-all ${
                        draggedWordId ? 'border-indigo-400 bg-indigo-50 scale-[1.02]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      <span className="text-3xl font-black text-indigo-600">/{category}/</span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Thả vào đây</p>
                    </div>
                  ))}
                </div>

                {/* Score Display */}
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-bold text-emerald-600">{gameResults.correct.length} đúng</span>
                  </div>
                  <div className="text-2xl font-black text-indigo-600">{gameScore}%</div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-rose-500">{gameResults.wrong.length} sai</span>
                    <XCircle className="w-5 h-5 text-rose-500" />
                  </div>
                </div>
              </div>
            )}

            {/* ENDING SOUND DRILL - Step 3: Odd One Out Game */}
            {isEndingSoundDrill && step === 3 && pack?.step3OddOneOut?.[oddRound] && (
              <div className="space-y-8 animate-in fade-in">
                <div className="text-center">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Target className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Tìm từ lạ</h3>
                  <p className="text-sm text-slate-500 mt-1">Chọn từ có âm cuối khác với các từ còn lại</p>
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-2">
                    Vòng {oddRound + 1} / 3
                  </p>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2rem] border-2 border-slate-100">
                  <div className="grid grid-cols-2 gap-4">
                    {pack.step3OddOneOut[oddRound].words.map((word: string, idx: number) => {
                      const isSelected = oddSelection === idx;
                      const isCorrect = oddSelection !== null && idx === pack.step3OddOneOut[oddRound].oddIndex;
                      const isWrongSelection = oddSelection !== null && oddSelection === idx && idx !== pack.step3OddOneOut[oddRound].oddIndex;

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (oddSelection === null) {
                              setOddSelection(idx);
                              const isCorrectAnswer = idx === pack.step3OddOneOut[oddRound].oddIndex;
                              setOddRoundScores([...oddRoundScores, isCorrectAnswer ? 100 : 0]);
                            }
                          }}
                          disabled={oddSelection !== null}
                          className={`p-6 rounded-2xl border-3 transition-all text-center min-w-0 ${
                            oddSelection === null
                              ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-lg cursor-pointer'
                              : isCorrect
                                ? 'bg-emerald-50 border-emerald-500'
                                : isWrongSelection
                                  ? 'bg-rose-50 border-rose-500'
                                  : 'bg-white border-slate-100 opacity-50'
                          }`}
                        >
                          <span
                            className="font-black text-slate-800 block mb-1 whitespace-nowrap text-center"
                            style={{ fontSize: word.length > 12 ? '1rem' : word.length > 8 ? '1.25rem' : '1.5rem' }}
                          >
                            {word.slice(0, -2)}
                            <span className="underline decoration-2 decoration-indigo-500">{word.slice(-2)}</span>
                          </span>
                          <button
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (oddSelection === null) {
                                playWordAudio(word);
                              }
                            }}
                            disabled={oddSelection !== null}
                            className="flex items-center justify-center gap-2 mt-2 px-3 py-1 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
                          >
                            <Volume2 className="w-4 h-4 text-indigo-500" />
                            <span className="text-[10px] text-indigo-500 font-bold">Nghe</span>
                          </button>
                          {oddSelection !== null && (
                            <div className="mt-3">
                              {isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />}
                              {isWrongSelection && <XCircle className="w-6 h-6 text-rose-500 mx-auto" />}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {oddSelection === null && (
                    <p className="text-center text-sm text-slate-400 mt-6 italic">
                      Nhấn 🔊 để nghe phát âm, nhấn vào từ để chọn đáp án
                    </p>
                  )}

                  {oddSelection !== null && (
                    <div className={`mt-6 p-4 rounded-2xl text-center ${
                      oddSelection === pack.step3OddOneOut[oddRound].oddIndex
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      <p className="font-black">
                        {oddSelection === pack.step3OddOneOut[oddRound].oddIndex
                          ? 'Chính xác! ' + pack.step3OddOneOut[oddRound].explanation
                          : 'Chưa đúng! Đáp án là: ' + pack.step3OddOneOut[oddRound].words[pack.step3OddOneOut[oddRound].oddIndex]}
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress Indicator */}
                <div className="flex justify-center gap-2">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all ${
                        i < oddRound ? 'bg-emerald-500' :
                        i === oddRound ? 'bg-indigo-600 scale-125' :
                        'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ENDING SOUND DRILL - Step 4: Industry Phrases */}
            {isEndingSoundDrill && step === 4 && pack?.step4Phrases?.[step4PhraseIndex] && (
              <div className="space-y-6 animate-in fade-in">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Quote className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Cụm từ chuyên ngành</h3>
                  <p className="text-sm text-slate-500 mt-1">Luyện tập âm cuối trong ngữ cảnh nghề nghiệp</p>
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-2">
                    Cụm từ {step4PhraseIndex + 1} / 2
                  </p>
                </div>

                <div className="p-8 bg-indigo-50 rounded-[2rem] border-2 border-indigo-100">
                  <p className="text-xl font-black text-indigo-900 leading-relaxed text-center">
                    "{pack.step4Phrases[step4PhraseIndex].phrase}"
                  </p>
                  {pack.step4Phrases[step4PhraseIndex].highlightIndices && (
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-4 text-center">
                      Chú ý các từ có âm cuối cần luyện tập
                    </p>
                  )}
                </div>

                <AudioPlayer text={pack.step4Phrases[step4PhraseIndex].phrase} label="Mẫu phát âm" />

                {/* Progress dots */}
                <div className="flex justify-center gap-2">
                  {[0, 1].map(i => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all ${
                        i < step4PhraseIndex ? 'bg-emerald-500' :
                        i === step4PhraseIndex ? 'bg-indigo-600 scale-125' :
                        'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ENDING SOUND DRILL - Step 5: Short Story */}
            {isEndingSoundDrill && step === 5 && pack?.shortStory && (
              <div className="space-y-8 animate-in fade-in">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Đọc văn</h3>
                  <p className="text-sm text-slate-500 mt-1">Áp dụng kỹ năng vào đoạn văn hoàn chỉnh</p>
                </div>

                <div className="p-10 bg-white rounded-[3rem] border-4 border-slate-100 shadow-inner">
                  <p className="text-xl font-bold text-slate-800 leading-relaxed text-center italic">"{pack.shortStory}"</p>
                </div>
                <AudioPlayer text={pack.shortStory} label="Mẫu phát âm" />
              </div>
            )}

            {/* Standard PHONETIC_DAY Steps */}
            {!isEndingSoundDrill && !isLinkingSoundDrill && step === 1 && (
              <div className="space-y-8 animate-in fade-in text-center">
                <div className="py-12 bg-indigo-50 rounded-[3rem] border-4 border-white shadow-inner mb-6 flex flex-col items-center">
                  <span className="text-9xl font-black text-indigo-600 leading-none">/{sound.symbol}/</span>
                  <p className="mt-6 px-8 text-sm font-bold text-indigo-900 leading-relaxed">{pack.targetSound}</p>
                </div>
                <AudioPlayer text={sound.symbol} label="Mẫu phát âm" autoPlay />
              </div>
            )}
            {!isEndingSoundDrill && !isLinkingSoundDrill && step === 2 && pack.minimalPairs?.[minimalPairIndex] && (
              <div className="space-y-8 animate-in fade-in text-center">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Ear className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Listen and Select</h3>
                <p className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest">Ví dụ {minimalPairIndex + 1}/{pack.minimalPairs.length}</p>

                <div className="p-10 bg-slate-50 rounded-[3rem] border-2 border-slate-100 shadow-inner space-y-10">
                  <button 
                    onClick={() => playWordAudio(pairTargetType === 'A' ? pack.minimalPairs[minimalPairIndex].wordA : pack.minimalPairs[minimalPairIndex].wordB)} 
                    disabled={isAudioLoading}
                    className="w-28 h-28 bg-white rounded-full border-4 border-indigo-100 text-indigo-600 shadow-md flex items-center justify-center mx-auto hover:scale-110 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isAudioLoading ? <Loader2 className="w-12 h-12 animate-spin" /> : <Volume2 className="w-12 h-12" />}
                  </button>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleMinimalPairSelection('A')}
                      className={`p-6 rounded-2xl border-4 transition-all text-center group ${
                        pairSelectedType === 'A' 
                          ? (pairTargetType === 'A' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700')
                          : (pairSelectedType !== null && pairTargetType === 'A' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 scale-105' : 'bg-white border-slate-100 hover:border-indigo-200')
                      }`}
                    >
                      <span className="text-3xl font-black block mb-1">{pack.minimalPairs[minimalPairIndex].wordA}</span>
                      <span className="text-[10px] font-black opacity-50 uppercase tracking-widest">{pack.minimalPairs[minimalPairIndex].ipaA}</span>
                    </button>

                    <button
                      onClick={() => handleMinimalPairSelection('B')}
                      className={`p-6 rounded-2xl border-4 transition-all text-center group ${
                        pairSelectedType === 'B' 
                          ? (pairTargetType === 'B' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700')
                          : (pairSelectedType !== null && pairTargetType === 'B' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 scale-105' : 'bg-white border-slate-100 hover:border-indigo-200')
                      }`}
                    >
                      <span className="text-3xl font-black block mb-1">{pack.minimalPairs[minimalPairIndex].wordB}</span>
                      <span className="text-[10px] font-black opacity-50 uppercase tracking-widest">{pack.minimalPairs[minimalPairIndex].ipaB}</span>
                    </button>
                  </div>

                  {pairSelectedType !== null && (
                    <div className={`p-4 rounded-2xl border-2 flex items-center justify-center gap-3 animate-in zoom-in ${pairSelectedType === pairTargetType ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                      {pairSelectedType === pairTargetType ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      <span className="font-black uppercase tracking-widest">{pairSelectedType === pairTargetType ? 'Chính xác!' : `Chưa đúng rồi!`}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!isEndingSoundDrill && !isLinkingSoundDrill && step === 3 && pack.targetWord && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-10 bg-indigo-600 text-white rounded-[3rem] shadow-xl text-center space-y-6">
                  <div className="flex flex-col items-center">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase border border-white/10 mb-4">{pack.targetWord.partOfSpeech}</span>
                    <h3 className="text-5xl font-black leading-tight mb-1">{pack.targetWord.word}</h3>
                    <span className="text-sm font-black text-indigo-200 tracking-widest">{pack.targetWord.ipa}</span>
                  </div>
                  <div className="h-px w-20 bg-white/20 mx-auto"></div>
                  <p className="text-lg font-medium italic">"{pack.targetWord.meaning}"</p>
                </div>
                <AudioPlayer text={pack.targetWord.word} label="Target Word Audio" />
              </div>
            )}
            {!isEndingSoundDrill && !isLinkingSoundDrill && step === 4 && (
              <div className="space-y-8 animate-in fade-in">
                <div className="relative p-10 bg-indigo-50 rounded-[3rem] border-2 border-indigo-100 text-center">
                  <Quote className="absolute -top-4 -left-4 w-12 h-12 text-indigo-200 opacity-50" />
                  <h3 className="text-2xl font-black text-indigo-900 leading-tight italic">"{pack.tongueTwister}"</h3>
                </div>
                <AudioPlayer text={pack.tongueTwister} label="Tongue Twister Reference" />
              </div>
            )}
            {!isEndingSoundDrill && !isLinkingSoundDrill && step === 5 && (
              <div className="space-y-8 animate-in fade-in">
                <div className="p-10 bg-white rounded-[3rem] border-4 border-slate-100 shadow-inner">
                  <p className="text-xl font-bold text-slate-800 leading-relaxed text-center italic">"{pack.shortStory}"</p>
                </div>
                <AudioPlayer text={pack.shortStory} label="Full Story Reference" />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden min-h-[500px] flex flex-col">
            <div className="bg-indigo-600 px-6 py-3 border-b border-indigo-700 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Tương tác và Phản hồi</h3>
              {isProcessing && <Loader2 className="w-4 h-4 text-white animate-spin" />}
            </div>
            <div className="p-8 flex-1 flex flex-col">
              <div className="mb-8">
                {showingRecorder && (
                   (isLinkingSoundDrill && (step === 1 || step === 3 || step === 4)) ||
                   (isEndingSoundDrill && (step === 4 || step === 5)) ||
                   (!isLinkingSoundDrill && !isEndingSoundDrill && step !== 2)
                ) && (
                  <AudioRecorder ref={recorderRef} onRecordingComplete={handleSpeechAssessment} isProcessing={isProcessing} onRecordingStateChange={setIsChildRecording} />
                )}
              </div>
              <div className="flex-1">
                {/* Step 1 Quiz Results Panel */}
                {isEndingSoundDrill && step === 1 && step1Phase === 'quiz' && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8 px-6">
                    {quizSelection === null ? (
                      <>
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center border-2 border-indigo-200">
                          <Target className="w-8 h-8 text-indigo-600" />
                        </div>
                        <p className="text-slate-600 font-bold text-sm max-w-[220px]">
                          Nghe từ và chọn âm cuối đúng để kiểm tra khả năng nhận diện.
                        </p>
                        <div className="text-sm text-slate-400">Câu {quizIndex + 1} / {pack?.step1?.quiz?.length || 6}</div>
                      </>
                    ) : (
                      <div className="space-y-6 w-full">
                        <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                          <div className="flex items-center gap-5 mb-5">
                            <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${quizSelection === normalizeSound(pack?.step1?.quiz?.[quizIndex]?.correctSound) ? 'border-emerald-500 text-emerald-500' : 'border-rose-500 text-rose-500'}`}>
                              {quizSelection === normalizeSound(pack?.step1?.quiz?.[quizIndex]?.correctSound) ? (
                                <CheckCircle2 className="w-8 h-8" />
                              ) : (
                                <XCircle className="w-8 h-8" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Câu {quizIndex + 1}</span>
                              <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                                "{quizSelection === normalizeSound(pack?.step1?.quiz?.[quizIndex]?.correctSound)
                                  ? 'Chính xác! Bạn đã nhận diện đúng âm cuối.'
                                  : 'Chưa đúng. Hãy chú ý quy tắc phát âm âm cuối.'}"
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            <button
                              onClick={handleContinue}
                              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                              {quizIndex < (pack?.step1?.quiz?.length || 6) - 1 ? 'Câu tiếp theo' : 'Hoàn thành'} <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2 Game Results Panel */}
                {isEndingSoundDrill && step === 2 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8 px-6">
                    {!gameIsOver ? (
                      <>
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center border-2 border-indigo-200">
                          <Gamepad2 className="w-8 h-8 text-indigo-600" />
                        </div>
                        <p className="text-slate-600 font-bold text-sm max-w-[220px]">
                          Kéo các từ vào đúng nhóm âm cuối trước khi chúng rơi xuống!
                        </p>
                        <div className="text-4xl font-black text-indigo-600">{gameScore}%</div>
                      </>
                    ) : (
                      <div className="space-y-6 w-full">
                        <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                          <div className="flex items-center gap-5 mb-5">
                            <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${gameScore >= 85 ? 'border-emerald-500 text-emerald-500' : 'border-rose-500 text-rose-500'}`}>
                              <span className="text-xl font-black">{gameScore}%</span>
                              <span className="text-[7px] font-black text-slate-400 uppercase">Score</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Kết quả</span>
                              <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                                "{gameScore >= 85 ? 'Xuất sắc! Bạn đã phân biệt rõ các âm cuối.' : 'Hãy luyện tập thêm để phân biệt các âm cuối tốt hơn.'}"
                              </p>
                            </div>
                          </div>

                          {/* Word results list */}
                          <div className="mb-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Correct words */}
                              <div className="p-3 bg-white rounded-2xl border border-emerald-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Đúng ({gameResults.correct.length})</span>
                                </div>
                                <div className="space-y-1 max-h-28 overflow-auto">
                                  {gameResults.correct.length > 0 ? gameResults.correct.map((word, idx) => (
                                    <div key={idx} className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
                                      {word}
                                    </div>
                                  )) : (
                                    <p className="text-[10px] text-slate-400 italic">Không có</p>
                                  )}
                                </div>
                              </div>

                              {/* Wrong words */}
                              <div className="p-3 bg-white rounded-2xl border border-rose-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <XCircle className="w-4 h-4 text-rose-500" />
                                  <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest">Sai ({gameResults.wrong.length})</span>
                                </div>
                                <div className="space-y-1 max-h-28 overflow-auto">
                                  {gameResults.wrong.length > 0 ? gameResults.wrong.map((word, idx) => (
                                    <div key={idx} className="text-xs font-bold text-rose-700 bg-rose-50 rounded-lg px-2 py-1">
                                      {word}
                                    </div>
                                  )) : (
                                    <p className="text-[10px] text-slate-400 italic">Không có</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2.5">
                            <button
                              onClick={handleContinue}
                              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                              Tiếp tục <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3 Odd One Out Results Panel */}
                {isEndingSoundDrill && step === 3 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8 px-6">
                    {oddSelection === null ? (
                      <>
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center border-2 border-indigo-200">
                          <Target className="w-8 h-8 text-indigo-600" />
                        </div>
                        <p className="text-slate-600 font-bold text-sm max-w-[220px]">
                          Nhấn vào từ để nghe phát âm, nhấn đúp để chọn từ có âm cuối khác biệt.
                        </p>
                        <div className="text-sm text-slate-400">Vòng {oddRound + 1} / 3</div>
                      </>
                    ) : (
                      <div className="space-y-6 w-full">
                        <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                          <div className="flex items-center gap-5 mb-5">
                            <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${oddSelection === pack?.step3OddOneOut?.[oddRound]?.oddIndex ? 'border-emerald-500 text-emerald-500' : 'border-rose-500 text-rose-500'}`}>
                              {oddSelection === pack?.step3OddOneOut?.[oddRound]?.oddIndex ? (
                                <CheckCircle2 className="w-8 h-8" />
                              ) : (
                                <XCircle className="w-8 h-8" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Vòng {oddRound + 1}</span>
                              <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                                "{oddSelection === pack?.step3OddOneOut?.[oddRound]?.oddIndex
                                  ? 'Chính xác! Bạn đã nhận ra từ có âm cuối khác biệt.'
                                  : 'Chưa đúng. Hãy chú ý lắng nghe sự khác biệt của âm cuối.'}"
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            <button
                              onClick={handleContinue}
                              className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                              {oddRound < 2 ? 'Vòng tiếp theo' : 'Tiếp tục'} <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Default panels for other steps */}
                {!(isEndingSoundDrill && (step === 1 || step === 2 || step === 3)) && attempts.length === 0 && (isDictationCorrect === null) && (pairSelectedType === null) ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12 px-6">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                      {isLinkingSoundDrill && step === 2 ? <Keyboard className="w-6 h-6 text-slate-300" /> : <MessageSquare className="w-6 h-6 text-slate-300" />}
                    </div>
                    <p className="text-slate-400 font-bold text-sm max-w-[200px]">
                      {isLinkingSoundDrill && step === 2 ? "Hãy nghe âm thanh và gõ lại cụm từ để kiểm tra khả năng nhận diện nối âm." :
                       !isEndingSoundDrill && !isLinkingSoundDrill && step === 2 ? "Lắng nghe kỹ và chọn từ bạn nghe được để phân biệt các âm tương đồng." :
                       "Hoàn thành nhiệm vụ ghi âm để AI đánh giá phát âm của bạn."}
                    </p>
                  </div>
                ) : !(isEndingSoundDrill && (step === 1 || step === 2 || step === 3)) && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                      <div className="flex items-center gap-5 mb-5">
                        <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${(attempts[0]?.result?.score ?? (pairSelectedType !== null ? (pairSelectedType === pairTargetType ? 100 : 0) : (isDictationCorrect ? 100 : 0))) >= 85 ? 'border-emerald-500 text-emerald-500' : 'border-rose-500 text-rose-500'}`}>
                          <span className="text-xl font-black">{Math.round(attempts[0]?.result?.score ?? (pairSelectedType !== null ? (pairSelectedType === pairTargetType ? 100 : 0) : (isDictationCorrect ? 100 : 0)))}%</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase">Score</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">AI Nhận xét</span>
                          <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                            "{attempts[0]?.result?.feedback || (pairSelectedType !== null ? (pairSelectedType === pairTargetType ? 'Tuyệt vời! Bạn có đôi tai rất thính.' : 'Chưa đúng, hãy nghe lại sự khác biệt nhỏ giữa hai từ này.') : (isDictationCorrect ? 'Chính xác! Bạn nghe nối âm rất tốt.' : 'Chưa đúng, hãy chú ý cách âm cuối liên kết với âm đầu của từ tiếp theo.'))}"
                          </p>
                        </div>
                      </div>
                      
                      {/* Highlighted text and transcription for ending sound exercises */}
                      {isEndingSoundDrill && (step === 4 || step === 5) && attempts[0]?.result?.highlights && (
                        <div className="mb-4 space-y-3">
                          {/* Original text with highlights */}
                          <div className="p-3 bg-white rounded-2xl border border-indigo-100">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Văn bản gốc</span>
                            <p className="text-sm leading-relaxed">
                              {(step === 4 ? pack?.step4Phrases?.[step4PhraseIndex]?.phrase : pack?.shortStory)?.split(' ').map((word: string, idx: number) => {
                                const cleanWord = word.toLowerCase().replace(/[.,!?;:'"]/g, '');
                                const highlights = attempts[0]?.result?.highlights || [];
                                const highlight = highlights.find(
                                  (h: { word: string; isCorrect: boolean }) => h.word.toLowerCase().replace(/[.,!?;:'"]/g, '') === cleanWord
                                );
                                // Use index-based matching as fallback (highlights are in order)
                                const highlightByIndex = highlights[idx];
                                const isCorrect = highlight?.isCorrect ?? highlightByIndex?.isCorrect ?? true;

                                return (
                                  <span key={idx} className={`font-bold ${isCorrect ? 'text-emerald-600 bg-emerald-50 px-1 rounded' : 'text-rose-600 bg-rose-50 px-1 rounded'}`}>
                                    {word}{' '}
                                  </span>
                                );
                              })}
                            </p>
                          </div>

                          {/* Transcription - what AI heard */}
                          {attempts[0]?.result?.transcription && (
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Bạn đã nói</span>
                              <p className="text-sm italic text-slate-600">"{attempts[0].result.transcription}"</p>
                            </div>
                          )}
                        </div>
                      )}

                      {attempts[0]?.audioUrl && (
                        <div className="mb-4 p-3 bg-white rounded-2xl border border-indigo-100">
                           <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Bản ghi gần nhất</span>
                           <audio src={attempts[0].audioUrl} controls className="w-full h-8" />
                        </div>
                      )}

                      <div className="flex flex-col gap-2.5">
                        <button 
                          onClick={handleContinue} 
                          disabled={(isLinkingSoundDrill && step === 2 && isDictationCorrect === null) || (!isEndingSoundDrill && !isLinkingSoundDrill && step === 2 && pairSelectedType === null)}
                          className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                        >
                          {isChildRecording ? 'Evaluating...' : 'Tiếp tục'} <ArrowRight className="w-4 h-4" />
                        </button>
                        {(showingRecorder === false || isDictationCorrect !== null || pairSelectedType !== null) && (
                          <button onClick={() => { setShowingRecorder(true); setAttempts([]); setIsDictationCorrect(null); setDictationInput(''); setAudioError(null); setPairSelectedType(null); }} className="w-full py-4 rounded-xl bg-white border-2 text-slate-500 font-black flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                            <RotateCcw className="w-4 h-4" /> Thử lại
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExerciseView;