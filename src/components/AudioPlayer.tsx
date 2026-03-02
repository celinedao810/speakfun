"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { generateAudio, decodePCM, createAudioBuffer } from '@/lib/ai/aiClient';

interface AudioPlayerProps {
  text: string;
  label: string;
  autoPlay?: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ text, label, autoPlay = false }) => {
  // Independent loading states per button
  const [isNormalLoading, setIsNormalLoading] = useState(false);
  const [isSlowLoading, setIsSlowLoading] = useState(false);

  const [currentPlayingPace, setCurrentPlayingPace] = useState<'normal' | 'slow' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const masterBufferRef = useRef<AudioBuffer | null>(null);
  const fetchPromiseRef = useRef<Promise<AudioBuffer> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getOrFetchBuffer = async (pace: 'normal' | 'slow'): Promise<AudioBuffer> => {
    if (masterBufferRef.current) return masterBufferRef.current;

    // If a fetch is already in progress, wait for it
    if (fetchPromiseRef.current) return fetchPromiseRef.current;

    if (pace === 'normal') setIsNormalLoading(true);
    else setIsSlowLoading(true);

    fetchPromiseRef.current = (async () => {
      try {
        console.log('[AudioPlayer] Generating audio for:', text);
        const base64 = await generateAudio(text);
        console.log('[AudioPlayer] Audio received, length:', base64?.length || 0);

        if (!base64) {
          throw new Error('Server returned empty audio data.');
        }

        if (!audioContextRef.current) {
          // Gemini TTS returns PCM at 24000Hz
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        // Decode PCM audio from Gemini TTS
        const bytes = decodePCM(base64);
        console.log('[AudioPlayer] Decoded PCM bytes:', bytes.length);
        const buffer = await createAudioBuffer(bytes, audioContextRef.current);
        console.log('[AudioPlayer] Audio buffer created, duration:', buffer.duration, 'seconds');

        masterBufferRef.current = buffer;
        return buffer;
      } catch (err) {
        console.error('[AudioPlayer] Error generating audio:', err);
        fetchPromiseRef.current = null;
        throw err;
      } finally {
        setIsNormalLoading(false);
        setIsSlowLoading(false);
      }
    })();

    return fetchPromiseRef.current;
  };

  const playSound = async (speed: 'normal' | 'slow') => {
    // If already playing this exact speed, stop it (toggle)
    if (currentPlayingPace === speed) {
      sourceRef.current?.stop();
      setCurrentPlayingPace(null);
      return;
    }

    // Stop existing playback if switching speed
    if (currentPlayingPace) {
      try { sourceRef.current?.stop(); } catch(e) {}
    }

    setError(null);
    try {
      const buffer = await getOrFetchBuffer(speed);
      
      const ctx = audioContextRef.current!;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      // Fixed rates: Normal 1.0, Slow 0.7
      source.playbackRate.value = speed === 'normal' ? 1.0 : 0.7;
      
      source.connect(ctx.destination);
      source.onended = () => {
        // Only clear state if this specific source finished
        if (sourceRef.current === source) {
          setCurrentPlayingPace(null);
        }
      };
      
      sourceRef.current = source;
      source.start(0);
      setCurrentPlayingPace(speed);
    } catch (err: any) {
      console.error("Audio playback error:", err);
      setError(err.message || 'Failed to generate audio sample.');
      setIsNormalLoading(false);
      setIsSlowLoading(false);
    }
  };

  // Autoplay effect and prop change reset
  useEffect(() => {
    // Crucial: Reset internal cache whenever text changes
    masterBufferRef.current = null;
    fetchPromiseRef.current = null;
    
    // Stop any existing audio immediately on text change
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
      sourceRef.current = null;
      setCurrentPlayingPace(null);
    }

    if (autoPlay && text) {
      // Small delay to ensure browser handles transition before playing
      const timer = setTimeout(() => {
        playSound('normal');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [text, autoPlay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm transition-all">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-slate-500 flex-1">{label}</span>
        <div className="flex gap-2">
          {/* Normal Button */}
          <button
            onClick={() => playSound('normal')}
            disabled={isSlowLoading} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-w-[100px] justify-center ${
              currentPlayingPace === 'normal' 
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale'
            }`}
          >
            {isNormalLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : currentPlayingPace === 'normal' ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            Normal
          </button>
          
          {/* Slow Button */}
          <button
            onClick={() => playSound('slow')}
            disabled={isNormalLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-w-[100px] justify-center ${
              currentPlayingPace === 'slow' 
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200' 
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:grayscale'
            }`}
          >
            {isSlowLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : currentPlayingPace === 'slow' ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            Slow
          </button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 mt-1 bg-rose-50 p-2 rounded-lg border border-rose-100 animate-pulse">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;