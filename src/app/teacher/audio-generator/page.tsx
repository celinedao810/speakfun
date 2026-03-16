"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AudioLines, Download, RefreshCw, Music2 } from 'lucide-react';

const VOICES = [
  { name: 'en-US-Neural2-J', label: 'Male 1 — Deep & authoritative', gender: 'male' },
  { name: 'en-US-Neural2-I', label: 'Male 2 — Friendly & warm', gender: 'male' },
  { name: 'en-US-Neural2-D', label: 'Male 3 — Casual & younger', gender: 'male' },
  { name: 'en-US-Studio-Q', label: 'Male 4 — Most natural (premium)', gender: 'male' },
  { name: 'en-US-Neural2-A', label: 'Female 1 — Clear & professional', gender: 'female' },
  { name: 'en-US-Neural2-C', label: 'Female 2 — Warm & approachable', gender: 'female' },
  { name: 'en-US-Neural2-F', label: 'Female 3 — Expressive & energetic', gender: 'female' },
  { name: 'en-US-Neural2-G', label: 'Female 4 — Natural & conversational', gender: 'female' },
  { name: 'en-US-Neural2-H', label: 'Female 5 — Bright & articulate', gender: 'female' },
  { name: 'en-US-Studio-O', label: 'Female 6 — Most natural (premium)', gender: 'female' },
];

// Alternates male/female for maximum distinction across speakers
const DEFAULT_VOICE_SEQUENCE = [
  'en-US-Neural2-J',
  'en-US-Neural2-A',
  'en-US-Neural2-I',
  'en-US-Neural2-C',
  'en-US-Neural2-D',
  'en-US-Neural2-F',
  'en-US-Studio-Q',
  'en-US-Neural2-G',
  'en-US-Studio-O',
  'en-US-Neural2-H',
];

function detectSpeakers(text: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const regex = /^([A-Za-z][^:\n]{0,29}):\s*\S/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      order.push(name);
    }
  }
  return order;
}

interface GeneratedTurn {
  speaker: string;
  text: string;
  voice: string;
}

const PLACEHOLDER = `Alice: Good morning! Thanks for coming in today.
Bob: Good morning! I'm really excited about this opportunity.
Alice: Great. Could you start by telling me a bit about yourself?
Bob: Of course. I've been working in software development for about five years now...
Carol: Sorry to interrupt — should I bring in the evaluation forms now?
Alice: Yes, please. Thanks, Carol.`;

export default function AudioGeneratorPage() {
  const [conversation, setConversation] = useState('');
  const [instructions, setInstructions] = useState('');
  const [comment, setComment] = useState('');
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});
  const [detectedSpeakers, setDetectedSpeakers] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatedTurns, setGeneratedTurns] = useState<GeneratedTurn[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Detect speakers as conversation changes
  useEffect(() => {
    const speakers = detectSpeakers(conversation);
    setDetectedSpeakers(speakers);
    setVoiceMap((prev) => {
      const next: Record<string, string> = {};
      speakers.forEach((name, i) => {
        next[name] = prev[name] ?? DEFAULT_VOICE_SEQUENCE[i % DEFAULT_VOICE_SEQUENCE.length];
      });
      return next;
    });
  }, [conversation]);

  // Create/revoke blob URL when audio changes
  useEffect(() => {
    if (!audioBase64) return;
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBase64]);

  const generate = async (withComment: boolean) => {
    if (!conversation.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/tts-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation,
          instructions,
          voiceMap,
          comment: withComment ? comment : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setAudioBase64(data.audio);
      setGeneratedTurns(data.turns ?? []);
      if (withComment) setComment('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportMp3 = () => {
    if (!audioBase64) return;
    const a = document.createElement('a');
    a.href = `data:audio/mpeg;base64,${audioBase64}`;
    a.download = 'conversation-audio.mp3';
    a.click();
  };

  const hasOutput = audioUrl !== null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Music2 className="w-6 h-6 text-primary" />
          Audio Generator
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Turn a written conversation into realistic multi-speaker audio. Up to 10 distinct voices supported.
        </p>
      </div>

      {/* ── Input Section ────────────────────────────────── */}
      <div className="space-y-5">
        {/* Conversation */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Conversation</label>
          <p className="text-xs text-muted-foreground mb-2">
            One turn per line — format: <code className="bg-muted px-1 rounded">SpeakerName: text</code>
          </p>
          <textarea
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className="w-full p-3 border border-border rounded-lg bg-background resize-y font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Instructions{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g. This is a job interview. Alice is the interviewer — professional and calm. Bob is nervous but enthusiastic. Carol is an assistant — brief and efficient."
            rows={3}
            className="w-full p-3 border border-border rounded-lg bg-background resize-y text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Speaker Voice Assignment */}
        {detectedSpeakers.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Speaker Voices
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                — auto-assigned, override as needed
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {detectedSpeakers.map((speaker) => (
                <div
                  key={speaker}
                  className="flex flex-col gap-1 p-3 border border-border rounded-lg bg-muted/20"
                >
                  <span className="text-xs font-semibold text-primary truncate">{speaker}</span>
                  <select
                    value={voiceMap[speaker] ?? ''}
                    onChange={(e) =>
                      setVoiceMap((prev) => ({ ...prev, [speaker]: e.target.value }))
                    }
                    className="px-2 py-1.5 border border-border rounded bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <optgroup label="Male">
                      {VOICES.filter((v) => v.gender === 'male').map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Female">
                      {VOICES.filter((v) => v.gender === 'female').map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={() => generate(false)}
          disabled={isGenerating || !conversation.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 hover:bg-primary/90 transition"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating audio…
            </>
          ) : (
            <>
              <AudioLines className="w-4 h-4" />
              Generate Audio
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Output Section ───────────────────────────────── */}
      {hasOutput && (
        <div className="space-y-5 pt-4 border-t border-border">
          <h2 className="text-base font-semibold">Generated Audio</h2>

          {/* Player */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} controls src={audioUrl ?? undefined} className="w-full" />

          {/* Transcript */}
          {generatedTurns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Transcript</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto p-3 bg-muted/30 rounded-lg border border-border text-sm">
                {generatedTurns.map((turn, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="font-semibold text-primary shrink-0 min-w-[90px]">
                      {turn.speaker}
                    </span>
                    <span className="text-muted-foreground">{turn.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comment / Regenerate */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Feedback for re-generation{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="E.g. Alice sounds too formal. Make Bob more hesitant and add longer pauses before his answers."
              rows={3}
              className="w-full p-3 border border-border rounded-lg bg-background resize-y text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => generate(true)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate
            </button>

            <button
              onClick={exportMp3}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
            >
              <Download className="w-4 h-4" />
              Export MP3
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
