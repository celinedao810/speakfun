"use client";

import React, { useState, useEffect } from 'react';
import { PlacementSentence, DiagnosticResult, PhonicSound } from '@/lib/types';
import { generatePlacementSentences, analyzePlacementDiagnostic } from '@/lib/ai/aiClient';
import AudioRecorder from '@/components/AudioRecorder';
import { Loader2, Sparkles, Mic, Activity, CheckCircle2, Trophy, Brain, ChevronRight, AlertCircle, Headphones } from 'lucide-react';

interface PlacementTestViewProps {
  industry: string;
  role: string;
  onComplete: (diagnostic: DiagnosticResult) => void;
}

const PlacementTestView: React.FC<PlacementTestViewProps> = ({ industry, role, onComplete }) => {
  const [step, setStep] = useState<'LOADING' | 'RECORDING' | 'DIAGNOSING' | 'SUMMARY'>('LOADING');
  const [sentences, setSentences] = useState<PlacementSentence[]>([]);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await generatePlacementSentences(industry, role);
        setSentences(data);
        setStep('RECORDING');
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, [industry, role]);

  const handleRecording = (base64: string) => {
    const nextRecordings = [...recordings, base64];
    setRecordings(nextRecordings);
    
    if (currentIndex < sentences.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      performDiagnostic(nextRecordings);
    }
  };

  const performDiagnostic = async (blobs: string[]) => {
    setStep('DIAGNOSING');
    try {
      const result = await analyzePlacementDiagnostic(sentences.map(s => s.text), blobs);
      setDiagnostic(result);
      setStep('SUMMARY');
    } catch (e) {
      console.error(e);
    }
  };

  if (step === 'LOADING') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative">
           <Loader2 className="w-16 h-16 text-indigo-600 animate-spin" />
           <Sparkles className="absolute -top-2 -right-2 text-amber-400 w-6 h-6 animate-pulse" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-black text-slate-900">Chuẩn bị bài kiểm tra đầu vào...</h3>
          <p className="text-slate-500 font-medium">Đang tạo các câu luyện tập riêng cho ngành {industry}.</p>
        </div>
      </div>
    );
  }

  if (step === 'DIAGNOSING') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
           <Brain className="w-12 h-12 text-indigo-600 animate-pulse" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-black text-slate-900">AI đang phân tích giọng nói của bạn...</h3>
          <p className="text-slate-500 font-medium">Kiểm tra nguyên âm, phụ âm, âm cuối và nối âm.</p>
        </div>
      </div>
    );
  }

  if (step === 'SUMMARY' && diagnostic) {
    const totalIssues = (diagnostic.needsLinking ? 1 : 0) + diagnostic.needsEndingSounds.length + diagnostic.needsPhonemes.length;
    
    return (
      <div className="max-w-3xl mx-auto py-12 animate-in zoom-in duration-500">
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden">
          <div className="bg-indigo-600 p-10 text-white text-center">
            <Trophy className="w-16 h-16 text-amber-300 mx-auto mb-4" />
            <h2 className="text-3xl font-black">Kết quả chẩn đoán</h2>
            <p className="text-indigo-100 opacity-90">AI đã xác định được lộ trình học tối ưu cho bạn.</p>
          </div>
          
          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Điểm cần cải thiện</span>
                <div className="space-y-4">
                  {diagnostic.needsLinking && (
                    <div className="flex items-center gap-3 text-indigo-600 font-bold">
                      <Activity className="w-4 h-4" /> Nối âm (Linking Sounds)
                    </div>
                  )}
                  {diagnostic.needsEndingSounds.length > 0 && (
                    <div className="space-y-2">
                       {diagnostic.needsEndingSounds.map(s => (
                        <div key={s} className="flex items-center gap-3 text-amber-600 font-bold">
                          <AlertCircle className="w-4 h-4" /> Âm cuối /{s}/
                        </div>
                      ))}
                    </div>
                  )}
                  {diagnostic.needsPhonemes.length > 0 && (
                    <div className="space-y-2">
                      {diagnostic.needsPhonemes.map(p => (
                        <div key={p} className="flex items-center gap-3 text-rose-600 font-bold">
                          <Headphones className="w-4 h-4" /> Phát âm âm /{p}/
                        </div>
                      ))}
                    </div>
                  )}
                  {totalIssues === 0 && <p className="text-emerald-600 font-black italic">Tuyệt vời! Bạn không gặp lỗi phát âm nghiêm trọng nào.</p>}
                </div>
              </div>

              <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex flex-col justify-center text-center">
                <p className="text-sm font-bold text-indigo-900 mb-2">Lộ trình học cá nhân hóa</p>
                <p className="text-4xl font-black text-indigo-600">{totalIssues || 0}</p>
                <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mt-1">Bài tập đã được giao</p>
              </div>
            </div>

            <button 
              onClick={() => onComplete(diagnostic)}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
            >
              Bắt đầu lộ trình cá nhân <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="mb-12 text-center">
        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 block">Placement Test ({currentIndex + 1}/3)</span>
        <h2 className="text-3xl font-black text-slate-900 mb-4">Đọc to câu dưới đây</h2>
        <p className="text-slate-500 font-medium">Hãy nói một cách tự nhiên như khi bạn giao tiếp trong công việc.</p>
      </div>

      <div className="bg-white p-12 rounded-[3rem] border-4 border-slate-100 shadow-xl text-center space-y-12">
        <div className="min-h-[120px] flex items-center justify-center">
          <p className="text-2xl md:text-3xl font-black text-slate-800 leading-tight italic">
            "{sentences[currentIndex].text}"
          </p>
        </div>

        <div className="flex flex-col items-center gap-6">
          <AudioRecorder 
            onRecordingComplete={handleRecording} 
            isProcessing={false} 
          />
          <div className="flex flex-wrap justify-center gap-2">
            {sentences[currentIndex].focusPhonemes.map(p => (
              <span key={p} className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest">Focus: {p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlacementTestView;