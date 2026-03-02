"use client";

import React, { useState, useEffect, useRef } from 'react';
import { PhonicSound, LearnerPreferences, SoundDrillPack, TargetSoundResult, MinimalPairItem, MinimalPairAnswer, SoundDrillStep, SoundDrillExerciseResult } from '@/lib/types';
import { generateSoundDrillPack, scoreTargetSoundPronunciation, generateAudio, decodePCM, createAudioBuffer } from '@/lib/ai/aiClient';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';
import {
  Loader2, RotateCcw, ArrowRight, Volume2, CheckCircle2,
  XCircle, Trophy, BookOpen, Quote, Ear, Target
} from 'lucide-react';

interface SoundDrillViewProps {
  sound: PhonicSound;
  preferences?: LearnerPreferences;
  onComplete: (score: number, results: SoundDrillExerciseResult[]) => void;
}

const TOTAL_STEPS = 4;

const SoundDrillView: React.FC<SoundDrillViewProps> = ({ sound, preferences, onComplete }) => {
  // Core state
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1); // 1-4 exercises, 5 = summary
  const [pack, setPack] = useState<SoundDrillPack | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Results tracking
  const [exerciseResults, setExerciseResults] = useState<SoundDrillExerciseResult[]>([]);
  const [currentAttemptCount, setCurrentAttemptCount] = useState(0);

  // Recording state
  const [lastResult, setLastResult] = useState<TargetSoundResult | null>(null);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [showingRecorder, setShowingRecorder] = useState(true);

  // Minimal pairs state (Exercise 2) - New design: show target word, 2 audio options
  const [minimalPairAnswers, setMinimalPairAnswers] = useState<MinimalPairAnswer[]>([]);
  const [showMinimalPairResults, setShowMinimalPairResults] = useState(false);
  const [playingOption, setPlayingOption] = useState<{pairId: string, option: 1 | 2} | null>(null);
  // Randomized mapping: which option plays which word (generated once when pack loads)
  const [pairMappings, setPairMappings] = useState<Map<string, {option1Word: string, option2Word: string, correctOption: 1 | 2}>>(new Map());

  // Audio context for playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const recorderRef = useRef<AudioRecorderHandle>(null);

  // Track if we've already fetched to prevent duplicate fetches
  const hasFetchedRef = useRef(false);

  // Extract primitive values from preferences to use as stable dependencies
  const industryPref = preferences?.industry;
  const rolePref = preferences?.role;

  // Fetch exercise pack on mount - only once per sound
  useEffect(() => {
    // Prevent duplicate fetches (React StrictMode or parent re-renders)
    if (hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;

    const fetchPack = async () => {
      setIsLoading(true);
      try {
        const content = await generateSoundDrillPack(
          sound.symbol,
          sound.description,
          industryPref,
          rolePref
        );
        // Debug: log minimal pairs data
        console.log('[SoundDrill] Pack loaded. Minimal pairs:', content.minimalPairsExercise?.pairs?.map(p => ({
          id: p.id,
          targetWord: p.targetWord,
          distractorWord: p.distractorWord
        })));

        // Generate randomized option mappings for minimal pairs
        const mappings = new Map<string, {option1Word: string, option2Word: string, correctOption: 1 | 2}>();
        content.minimalPairsExercise?.pairs?.forEach(pair => {
          // Randomly decide if target word is option 1 or option 2
          const targetIsOption1 = Math.random() < 0.5;
          mappings.set(pair.id, {
            option1Word: targetIsOption1 ? pair.targetWord : pair.distractorWord,
            option2Word: targetIsOption1 ? pair.distractorWord : pair.targetWord,
            correctOption: targetIsOption1 ? 1 : 2
          });
        });
        setPairMappings(mappings);
        setPack(content);
      } catch (err) {
        console.error("Failed to fetch sound drill pack", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPack();
  }, [sound.symbol, sound.description, industryPref, rolePref]);

  // Get current step info
  const getStepInfo = (stepNum: number) => {
    const steps = [
      { title: 'Đọc từ', subtitle: 'Word Reading', icon: BookOpen },
      { title: 'Phân biệt âm', subtitle: 'Minimal Pairs', icon: Ear },
      { title: 'Lắt léo', subtitle: 'Tongue Twister', icon: Quote },
      { title: 'Đọc văn', subtitle: 'Short Story', icon: BookOpen },
    ];
    return steps[stepNum - 1] || { title: 'Hoàn thành', subtitle: 'Complete', icon: Trophy };
  };

  // Play word audio
  const playWordAudio = async (text: string) => {
    if (!text) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      let buffer = audioCacheRef.current.get(text);
      if (!buffer) {
        const base64 = await generateAudio(text);
        if (base64) {
          buffer = await createAudioBuffer(decodePCM(base64), ctx);
          audioCacheRef.current.set(text, buffer);
        }
      }

      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  // Handle speech assessment for recording exercises
  const handleSpeechAssessment = async (base64: string, audioUrl: string) => {
    if (!pack) return;
    setIsProcessing(true);
    setCurrentAttemptCount(prev => prev + 1);

    try {
      let targetText = "";
      if (step === 1) {
        targetText = pack.wordExercise.word;
      } else if (step === 3) {
        targetText = pack.tongueTwisterExercise.text;
      } else if (step === 4) {
        targetText = pack.shortStoryExercise.fullText;
      }

      console.log('[SoundDrill] Scoring audio for step:', step);
      console.log('[SoundDrill] Target text:', targetText);
      console.log('[SoundDrill] Target sound:', pack.targetSoundSymbol, `(${pack.targetSound})`);
      console.log('[SoundDrill] Audio base64 length:', base64?.length);

      const result = await scoreTargetSoundPronunciation(
        targetText,
        pack.targetSound,
        pack.targetSoundSymbol,
        base64
      );

      console.log('[SoundDrill] Scoring result:', result);
      console.log('[SoundDrill] Score:', result.targetSoundScore, '%');

      setLastResult(result);
      setLastAudioUrl(audioUrl);
      setShowingRecorder(false);
    } catch (err) {
      console.error("[SoundDrill] Scoring error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle minimal pair answer - user selects which option matches target word
  const handleMinimalPairSelect = (pairId: string, selectedOption: 1 | 2) => {
    if (showMinimalPairResults) return;
    const mapping = pairMappings.get(pairId);
    if (!mapping) return;

    const isCorrect = selectedOption === mapping.correctOption;
    const newAnswer: MinimalPairAnswer = { pairId, selectedOption, isCorrect };

    setMinimalPairAnswers(prev => {
      const filtered = prev.filter(a => a.pairId !== pairId);
      return [...filtered, newAnswer];
    });
  };

  // Play minimal pair audio for a specific option
  const playMinimalPairOption = async (pairId: string, option: 1 | 2) => {
    if (playingOption) return; // Prevent double-play

    const mapping = pairMappings.get(pairId);
    if (!mapping) return;

    const wordToPlay = option === 1 ? mapping.option1Word : mapping.option2Word;
    setPlayingOption({ pairId, option });

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      let buffer = audioCacheRef.current.get(wordToPlay);
      if (!buffer) {
        console.log('[MinimalPairs] Generating audio for:', wordToPlay);
        const base64 = await generateAudio(wordToPlay);
        if (base64) {
          buffer = await createAudioBuffer(decodePCM(base64), ctx);
          audioCacheRef.current.set(wordToPlay, buffer);
        }
      }

      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setPlayingOption(null);
        source.start(0);
      } else {
        setPlayingOption(null);
      }
    } catch (e) {
      console.error("Minimal pair audio error:", e);
      setPlayingOption(null);
    }
  };

  // Submit minimal pairs
  const handleMinimalPairsSubmit = () => {
    setShowMinimalPairResults(true);
  };

  // Handle retry
  const handleRetry = () => {
    setShowingRecorder(true);
    setLastResult(null);
    setLastAudioUrl(null);
  };

  // Handle continue to next exercise
  const handleContinue = () => {
    if (!pack) return;

    // Calculate score for current step
    let stepScore = 0;
    let stepType: SoundDrillStep = 'WORD_READING';

    if (step === 1) {
      stepScore = lastResult?.targetSoundScore ?? 0;
      stepType = 'WORD_READING';
    } else if (step === 2) {
      const correctCount = minimalPairAnswers.filter(a => a.isCorrect).length;
      stepScore = (correctCount / pack.minimalPairsExercise.pairs.length) * 100;
      stepType = 'MINIMAL_PAIRS';
    } else if (step === 3) {
      stepScore = lastResult?.targetSoundScore ?? 0;
      stepType = 'TONGUE_TWISTER';
    } else if (step === 4) {
      stepScore = lastResult?.targetSoundScore ?? 0;
      stepType = 'SHORT_STORY';
    }

    // Save result
    const result: SoundDrillExerciseResult = {
      step: stepType,
      score: stepScore,
      attempts: currentAttemptCount,
      feedback: lastResult?.feedback,
      minimalPairAnswers: step === 2 ? minimalPairAnswers : undefined
    };

    const newResults = [...exerciseResults, result];
    setExerciseResults(newResults);

    // Reset state for next step
    setLastResult(null);
    setLastAudioUrl(null);
    setShowingRecorder(true);
    setCurrentAttemptCount(0);
    setMinimalPairAnswers([]);
    setShowMinimalPairResults(false);

    // Move to next step or summary
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as 1 | 2 | 3 | 4 | 5);
    } else {
      setStep(5); // Summary
    }
  };

  // Handle complete from summary
  const handleComplete = () => {
    const avgScore = exerciseResults.reduce((sum, r) => sum + r.score, 0) / exerciseResults.length;
    onComplete(avgScore, exerciseResults);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-bold">Chuẩn bị bài tập...</p>
      </div>
    );
  }

  if (!pack) {
    return <div className="p-8 text-center text-rose-500 font-bold">Lỗi tải dữ liệu.</div>;
  }

  // Summary view
  if (step === 5) {
    const avgScore = exerciseResults.reduce((sum, r) => sum + r.score, 0) / exerciseResults.length;
    const passed = avgScore >= 85;

    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white rounded-[3rem] shadow-2xl p-10 text-center">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
            passed ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}>
            {passed ? <Trophy className="w-12 h-12" /> : <Target className="w-12 h-12" />}
          </div>

          <h2 className="text-3xl font-black mb-2">
            {passed ? 'Xuất sắc!' : 'Tiếp tục luyện tập!'}
          </h2>

          <div className="text-6xl font-black text-indigo-600 my-6">
            {Math.round(avgScore)}%
          </div>

          <p className="text-slate-500 mb-8">
            {passed
              ? `Bạn đã làm chủ âm /${pack.targetSoundSymbol}/. Tiếp tục phát huy!`
              : `Cần đạt 85% để vượt qua. Bài tập sẽ mở lại sau 24 giờ.`
            }
          </p>

          {/* Per-exercise breakdown */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {exerciseResults.map((result, i) => (
              <div key={i} className={`p-4 rounded-xl ${
                result.score >= 85 ? 'bg-emerald-50' : 'bg-amber-50'
              }`}>
                <span className="text-xs font-bold text-slate-400 block">Bài {i + 1}</span>
                <span className="text-xl font-black">{Math.round(result.score)}%</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleComplete}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all"
          >
            {passed ? 'Nhận huy hiệu!' : 'Quay lại'}
          </button>
        </div>
      </div>
    );
  }

  const stepInfo = getStepInfo(step);
  const StepIcon = stepInfo.icon;

  return (
    <div className="max-w-6xl mx-auto pb-12 px-4">
      {/* Progress header */}
      <div className="mb-8">
        <div className="flex justify-between items-end mb-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">
              /{pack.targetSoundSymbol}/ PRACTICE
            </span>
            <h2 className="text-3xl font-black text-slate-900 leading-none">
              Bước {step}: {stepInfo.title}
            </h2>
          </div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">
            {step}/{TOTAL_STEPS} HOÀN THÀNH
          </span>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex gap-1 p-0.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-full rounded-full transition-all duration-700 ${
                step > i ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-stretch">
        {/* Left Panel - Content */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
            <StepIcon className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {stepInfo.subtitle}
            </span>
          </div>
          <div className="p-8 md:p-10 flex-1 flex flex-col justify-center">
            {/* Exercise 1: Word Reading */}
            {step === 1 && (
              <div className="space-y-8 text-center">
                <div className="py-8 bg-indigo-50 rounded-3xl">
                  <span className="text-6xl font-black text-indigo-600">
                    {pack.wordExercise.word}
                  </span>
                  <p className="text-sm text-slate-500 mt-2">{pack.wordExercise.ipa}</p>
                </div>

                <div className="text-left space-y-2 bg-slate-50 p-6 rounded-2xl">
                  <p className="text-sm">
                    <span className="font-bold text-slate-600">Loại từ:</span>{' '}
                    <span className="text-slate-500">{pack.wordExercise.partOfSpeech}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-bold text-slate-600">Nghĩa:</span>{' '}
                    <span className="text-slate-500">{pack.wordExercise.meaning}</span>
                  </p>
                  <p className="text-sm italic text-slate-400">
                    "{pack.wordExercise.exampleSentence}"
                  </p>
                </div>

                <AudioPlayer text={pack.wordExercise.word} label="Mẫu phát âm" />
              </div>
            )}

            {/* Exercise 2: Minimal Pairs Listening - New Design */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-black text-slate-900">Nghe và chọn âm đúng</h3>
                  <p className="text-sm text-slate-500">Nghe 2 âm thanh, chọn âm nào phát âm đúng từ hiển thị</p>
                </div>

                <div className="space-y-6">
                  {pack.minimalPairsExercise.pairs.map((pair, index) => {
                    const answer = minimalPairAnswers.find(a => a.pairId === pair.id);
                    const mapping = pairMappings.get(pair.id);
                    const isPlaying1 = playingOption?.pairId === pair.id && playingOption.option === 1;
                    const isPlaying2 = playingOption?.pairId === pair.id && playingOption.option === 2;

                    return (
                      <div key={pair.id} className="p-6 bg-slate-50 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-slate-400">Cặp {index + 1}</span>
                        </div>

                        {/* Target word display */}
                        <div className="text-center mb-6 py-4 bg-indigo-50 rounded-xl border-2 border-indigo-100">
                          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-1">Từ mục tiêu</span>
                          <span className="text-3xl font-black text-indigo-600">{pair.targetWord}</span>
                          <span className="text-sm text-slate-500 block mt-1">{pair.targetWordIpa}</span>
                        </div>

                        {/* Two audio options */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Option 1 */}
                          <div className={`p-4 rounded-xl border-2 transition-all ${
                            showMinimalPairResults
                              ? mapping?.correctOption === 1
                                ? 'bg-emerald-50 border-emerald-500'
                                : answer?.selectedOption === 1
                                  ? 'bg-rose-50 border-rose-500'
                                  : 'border-slate-200 bg-white'
                              : answer?.selectedOption === 1
                                ? 'bg-indigo-50 border-indigo-500'
                                : 'border-slate-200 bg-white'
                          }`}>
                            <div className="text-center space-y-3">
                              <span className="text-sm font-bold text-slate-500">Âm 1</span>
                              <button
                                onClick={() => playMinimalPairOption(pair.id, 1)}
                                disabled={playingOption !== null}
                                className="w-full p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isPlaying1 ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Volume2 className="w-5 h-5" />
                                )}
                                <span className="font-bold">Phát</span>
                              </button>
                              <button
                                onClick={() => handleMinimalPairSelect(pair.id, 1)}
                                disabled={showMinimalPairResults}
                                className={`w-full py-3 rounded-xl font-bold transition-all ${
                                  answer?.selectedOption === 1
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                } disabled:opacity-70`}
                              >
                                {answer?.selectedOption === 1 ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : null}
                                Chọn
                              </button>
                            </div>
                          </div>

                          {/* Option 2 */}
                          <div className={`p-4 rounded-xl border-2 transition-all ${
                            showMinimalPairResults
                              ? mapping?.correctOption === 2
                                ? 'bg-emerald-50 border-emerald-500'
                                : answer?.selectedOption === 2
                                  ? 'bg-rose-50 border-rose-500'
                                  : 'border-slate-200 bg-white'
                              : answer?.selectedOption === 2
                                ? 'bg-indigo-50 border-indigo-500'
                                : 'border-slate-200 bg-white'
                          }`}>
                            <div className="text-center space-y-3">
                              <span className="text-sm font-bold text-slate-500">Âm 2</span>
                              <button
                                onClick={() => playMinimalPairOption(pair.id, 2)}
                                disabled={playingOption !== null}
                                className="w-full p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isPlaying2 ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Volume2 className="w-5 h-5" />
                                )}
                                <span className="font-bold">Phát</span>
                              </button>
                              <button
                                onClick={() => handleMinimalPairSelect(pair.id, 2)}
                                disabled={showMinimalPairResults}
                                className={`w-full py-3 rounded-xl font-bold transition-all ${
                                  answer?.selectedOption === 2
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                } disabled:opacity-70`}
                              >
                                {answer?.selectedOption === 2 ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : null}
                                Chọn
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Show result feedback for this pair */}
                        {showMinimalPairResults && (
                          <div className={`mt-4 p-3 rounded-xl text-center text-sm font-bold ${
                            answer?.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {answer?.isCorrect ? (
                              <><CheckCircle2 className="w-4 h-4 inline mr-1" /> Đúng!</>
                            ) : (
                              <><XCircle className="w-4 h-4 inline mr-1" /> Sai - Đáp án đúng là Âm {mapping?.correctOption}</>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!showMinimalPairResults && (
                  <button
                    onClick={handleMinimalPairsSubmit}
                    disabled={minimalPairAnswers.length !== pack.minimalPairsExercise.pairs.length}
                    className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl disabled:opacity-50 transition-all"
                  >
                    Nộp bài
                  </button>
                )}

                {showMinimalPairResults && (
                  <div className="space-y-4">
                    <div className={`p-6 rounded-2xl text-center ${
                      minimalPairAnswers.filter(a => a.isCorrect).length >= 2
                        ? 'bg-emerald-50'
                        : 'bg-rose-50'
                    }`}>
                      <span className="text-4xl font-black">
                        {Math.round((minimalPairAnswers.filter(a => a.isCorrect).length / pack.minimalPairsExercise.pairs.length) * 100)}%
                      </span>
                      <p className="text-sm mt-2">
                        {minimalPairAnswers.filter(a => a.isCorrect).length} / {pack.minimalPairsExercise.pairs.length} đúng
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Exercise 3: Tongue Twister */}
            {step === 3 && (
              <div className="space-y-8">
                <div className="relative p-10 bg-indigo-50 rounded-[3rem] border-2 border-indigo-100 text-center">
                  <Quote className="absolute -top-4 -left-4 w-12 h-12 text-indigo-200 opacity-50" />
                  <h3 className="text-2xl font-black text-indigo-900 leading-tight italic">
                    "{pack.tongueTwisterExercise.text}"
                  </h3>
                  <p className="text-xs text-slate-500 mt-4">
                    Chứa âm /{pack.targetSoundSymbol}/ {pack.tongueTwisterExercise.targetSoundOccurrences} lần
                  </p>
                </div>
                <AudioPlayer text={pack.tongueTwisterExercise.text} label="Mẫu phát âm" />
              </div>
            )}

            {/* Exercise 4: Short Story */}
            {step === 4 && (
              <div className="space-y-8">
                <div className="space-y-4">
                  {pack.shortStoryExercise.sentences.map((sentence, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl">
                      <span className="text-xs font-bold text-slate-400 block mb-1">Câu {i + 1}</span>
                      <p className="text-lg font-bold text-slate-800">{sentence}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center text-slate-500">
                  Ghi âm cả 3 câu liền mạch • Chứa âm /{pack.targetSoundSymbol}/ {pack.shortStoryExercise.targetSoundOccurrences} lần
                </p>
                <AudioPlayer text={pack.shortStoryExercise.fullText} label="Mẫu phát âm" />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Recording & Feedback */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="bg-indigo-600 px-6 py-3 flex items-center justify-between">
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
              Ghi âm & Phản hồi
            </h3>
            {isProcessing && <Loader2 className="w-4 h-4 text-white animate-spin" />}
          </div>
          <div className="p-8 flex-1 flex flex-col">
            {/* Recording exercises (1, 3, 4) */}
            {(step === 1 || step === 3 || step === 4) && (
              <>
                {showingRecorder && (
                  <div className="mb-8">
                    <AudioRecorder
                      ref={recorderRef}
                      onRecordingComplete={handleSpeechAssessment}
                      isProcessing={isProcessing}
                    />
                  </div>
                )}

                {!showingRecorder && lastResult && (
                  <div className="space-y-6">
                    <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                      <div className="flex items-center gap-5 mb-5">
                        <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${
                          lastResult.targetSoundScore >= 85
                            ? 'border-emerald-500 text-emerald-500'
                            : 'border-rose-500 text-rose-500'
                        }`}>
                          <span className="text-xl font-black">{Math.round(lastResult.targetSoundScore)}%</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase">Điểm</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">
                            Nhận xét AI
                          </span>
                          <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                            "{lastResult.feedback}"
                          </p>
                        </div>
                      </div>

                      {/* Word-by-word breakdown */}
                      {lastResult.targetSoundInstances.length > 0 && (
                        <div className="mb-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                            Chi tiết từng từ
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {lastResult.targetSoundInstances.map((instance, i) => (
                              <span
                                key={i}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  instance.isCorrect
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {instance.isCorrect ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                                {instance.word}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {lastAudioUrl && (
                        <div className="mb-4 p-3 bg-white rounded-2xl border border-indigo-100">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                            Bản ghi của bạn
                          </span>
                          <audio src={lastAudioUrl} controls className="w-full h-8" />
                        </div>
                      )}

                      <div className="flex flex-col gap-2.5">
                        <button
                          onClick={handleContinue}
                          className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                        >
                          Tiếp tục <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleRetry}
                          className="w-full py-4 rounded-xl bg-white border-2 text-slate-500 font-black flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                        >
                          <RotateCcw className="w-4 h-4" /> Thử lại
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showingRecorder && !isProcessing && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12 px-6">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                      <Volume2 className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold text-sm max-w-[200px]">
                      Nghe mẫu phát âm, sau đó ghi âm giọng của bạn để AI đánh giá.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Minimal pairs (step 2) - just show continue button after results */}
            {step === 2 && (
              <div className="flex-1 flex flex-col">
                {!showMinimalPairResults ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12 px-6">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                      <Ear className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold text-sm max-w-[200px]">
                      Nhấn nút phát để nghe từ, sau đó chọn từ bạn nghe được cho mỗi cặp.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-5 rounded-3xl bg-indigo-50 border-2 border-indigo-100">
                      <div className="flex items-center gap-5 mb-5">
                        <div className={`w-20 h-20 rounded-full border-4 bg-white shadow-md flex flex-col items-center justify-center ${
                          minimalPairAnswers.filter(a => a.isCorrect).length >= 2
                            ? 'border-emerald-500 text-emerald-500'
                            : 'border-rose-500 text-rose-500'
                        }`}>
                          <span className="text-xl font-black">
                            {Math.round((minimalPairAnswers.filter(a => a.isCorrect).length / pack.minimalPairsExercise.pairs.length) * 100)}%
                          </span>
                          <span className="text-[7px] font-black text-slate-400 uppercase">Điểm</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">
                            Kết quả
                          </span>
                          <p className="bg-white p-3 rounded-xl border border-indigo-100 text-xs font-bold text-slate-600 italic">
                            {minimalPairAnswers.filter(a => a.isCorrect).length >= 2
                              ? 'Tuyệt vời! Bạn phân biệt âm rất tốt.'
                              : 'Hãy luyện nghe thêm để phân biệt các âm tương tự nhau.'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleContinue}
                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                      >
                        Tiếp tục <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoundDrillView;
