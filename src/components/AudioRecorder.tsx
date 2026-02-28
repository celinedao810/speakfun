"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Mic, Square, Trash2, Loader2, Clock, XCircle } from 'lucide-react';

interface AudioRecorderProps {
  onRecordingComplete: (base64: string, blobUrl: string) => void;
  isProcessing: boolean;
  maxDuration?: number;
  onTimeout?: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

export interface AudioRecorderHandle {
  stop: () => void;
  reset: () => void;
}

const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(({ 
  onRecordingComplete, 
  isProcessing,
  maxDuration,
  onTimeout,
  onRecordingStateChange
}, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    stop: stopRecording,
    reset: cancelRecording
  }));

  useEffect(() => {
    if (onRecordingStateChange) onRecordingStateChange(isRecording);
  }, [isRecording, onRecordingStateChange]);

  useEffect(() => {
    if (isRecording && maxDuration) {
      setTimeLeft(maxDuration);
      timerRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev !== null && prev <= 1) {
            stopRecording();
            if (onTimeout) onTimeout();
            return 0;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, maxDuration]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          onRecordingComplete(base64, url);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) { console.error('Recording failed:', err); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setAudioUrl(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2 relative">
      {isRecording && maxDuration && timeLeft !== null && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-black animate-pulse">
          <Clock className="w-3.5 h-3.5" /> {timeLeft}s
        </div>
      )}
      {!isRecording && !audioUrl && (
        <button onClick={startRecording} disabled={isProcessing} className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all hover:scale-110 disabled:opacity-50">
          <Mic className="w-8 h-8" />
        </button>
      )}
      {isRecording && (
        <div className="flex items-center gap-4">
          <button onClick={stopRecording} className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center animate-pulse">
            <Square className="w-8 h-8" />
          </button>
          <button onClick={cancelRecording} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 text-slate-500 font-black rounded-xl">
            <XCircle className="w-4 h-4" /> Discard
          </button>
        </div>
      )}
      {audioUrl && (
        <div className="flex flex-col items-center gap-4 w-full px-8">
          <audio src={audioUrl} controls className="w-full h-10" />
          <button onClick={cancelRecording} className="flex items-center gap-2 px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg text-sm">
            <Trash2 className="w-4 h-4" /> Discard
          </button>
        </div>
      )}
      {isProcessing && <div className="flex items-center gap-2 text-indigo-600 font-bold animate-pulse"><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</div>}
    </div>
  );
});

export default AudioRecorder;