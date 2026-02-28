"use client";

import { useState, useCallback } from 'react';
import { BookOpen, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { ReadingExerciseItem, ReadingScoringResult } from '@/lib/types';
import { scoreReadingPassage } from '@/lib/services/geminiService';
import AudioRecorder from '@/components/AudioRecorder';

interface Exercise3ReadingProps {
  item: ReadingExerciseItem;
  onComplete: (score: number) => void;
}

/**
 * Tokenize a passage into {raw, base, isVocab} tokens.
 * Handles multi-word vocab phrases and single-word morphological variants (+s / +es).
 *
 * `raw`     = the actual passage slice (original casing/spacing)
 * `base`    = canonical vocab word (from vocabWords list); same as raw for non-vocab
 * `isVocab` = true when the token matches a vocab word or its variant
 */
function tokenizePassage(
  passage: string,
  vocabWords: string[]
): Array<{ raw: string; base: string; isVocab: boolean }> {
  if (vocabWords.length === 0) {
    return passage.split(/(\s+)/).filter(Boolean).map(t => ({ raw: t, base: t, isVocab: false }));
  }

  // Build search forms for each vocab word, including morphological variants for single words
  type Candidate = { searchFor: string; vocabWord: string };
  const candidates: Candidate[] = [];

  for (const word of vocabWords) {
    const wLow = word.toLowerCase();
    candidates.push({ searchFor: wLow, vocabWord: word });

    // Apply inflection variants to the last word (works for both single and multi-word vocab)
    // e.g. "time zone" → "time zones"; "stakeholder" → "stakeholders"
    const parts = wLow.split(/\s+/);
    const prefix = parts.length > 1 ? parts.slice(0, -1).join(' ') + ' ' : '';
    const last = parts[parts.length - 1];
    candidates.push({ searchFor: prefix + last + 's', vocabWord: word });
    candidates.push({ searchFor: prefix + last + 'es', vocabWord: word });
    if (last.endsWith('s')) candidates.push({ searchFor: prefix + last.slice(0, -1), vocabWord: word });
    if (last.endsWith('es')) candidates.push({ searchFor: prefix + last.slice(0, -2), vocabWord: word });
  }

  // Multi-word phrases first, then longer forms (avoids partial matches)
  candidates.sort((a, b) => {
    const aw = a.searchFor.split(/\s+/).length;
    const bw = b.searchFor.split(/\s+/).length;
    if (bw !== aw) return bw - aw;
    return b.searchFor.length - a.searchFor.length;
  });

  const pLow = passage.toLowerCase();
  type Span = { start: number; end: number; vocabWord: string };
  const spans: Span[] = [];

  for (const { searchFor, vocabWord } of candidates) {
    let pos = 0;
    while (pos < pLow.length) {
      const idx = pLow.indexOf(searchFor, pos);
      if (idx === -1) break;
      const end = idx + searchFor.length;
      // Word-boundary check: character before and after must not be a word character
      const before = idx > 0 ? passage[idx - 1] : ' ';
      const after = end < passage.length ? passage[end] : ' ';
      if (/[^a-zA-Z']/.test(before) && /[^a-zA-Z']/.test(after)) {
        const overlaps = spans.some(s => s.start < end && s.end > idx);
        if (!overlaps) spans.push({ start: idx, end, vocabWord });
      }
      pos = idx + 1;
    }
  }

  spans.sort((a, b) => a.start - b.start);

  const tokens: Array<{ raw: string; base: string; isVocab: boolean }> = [];
  let cur = 0;

  const pushNonVocab = (text: string) =>
    text.split(/(\s+)/).filter(Boolean).forEach(t =>
      tokens.push({ raw: t, base: t, isVocab: false })
    );

  for (const span of spans) {
    if (cur < span.start) pushNonVocab(passage.slice(cur, span.start));
    tokens.push({ raw: passage.slice(span.start, span.end), base: span.vocabWord, isVocab: true });
    cur = span.end;
  }
  if (cur < passage.length) pushNonVocab(passage.slice(cur));

  return tokens;
}

/** Hint string: first letter of each word + ___ (e.g. "workspace tools" → "W___ T___") */
function buildHint(raw: string): string {
  return raw.trim().split(/\s+/).map(w => {
    const letter = w.match(/[a-zA-Z]/)?.[0] ?? w[0];
    return letter.toUpperCase() + '___';
  }).join(' ');
}

export default function Exercise3Reading({ item, onComplete }: Exercise3ReadingProps) {
  const [step, setStep] = useState<'READING' | 'RESULT'>('READING');
  const [hintsRevealed, setHintsRevealed] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [result, setResult] = useState<ReadingScoringResult | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const tokens = tokenizePassage(item.readingPassage, item.vocabWords.map(v => v.word));

  // Only vocab words that actually appear in the passage — skip any that don't
  const passageVocabSet = new Set(
    tokens.filter(t => t.isVocab).map(t => t.base.toLowerCase())
  );

  const handleRecording = useCallback(async (base64: string) => {
    setRecordingUrl(`data:audio/webm;base64,${base64}`);
    setIsScoring(true);
    try {
      // Re-derive passage vocab inside callback to avoid stale closure
      const toks = tokenizePassage(item.readingPassage, item.vocabWords.map(v => v.word));
      const vocabInPassage = item.vocabWords
        .filter(v => toks.some(t => t.isVocab && t.base.toLowerCase() === v.word.toLowerCase()))
        .map(v => v.word);

      const res = await scoreReadingPassage(item.readingPassage, vocabInPassage, base64);
      setResult(res);
      setStep('RESULT');
    } finally {
      setIsScoring(false);
    }
  }, [item]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="bg-emerald-100 p-1.5 rounded-lg">
          <BookOpen className="w-4 h-4 text-emerald-600" />
        </div>
        <span className="text-sm font-semibold text-slate-700">Reading Practice</span>
      </div>

      {/* Passage card */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100">
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Read the passage aloud</p>
        <div className="text-sm text-slate-800 leading-relaxed">
          {tokens.map((token, i) => {
            if (!token.isVocab) return <span key={i}>{token.raw}</span>;

            if (step === 'RESULT') {
              // In result view: color by correctness
              const vocabResult = result?.vocabResults.find(
                v => v.word.toLowerCase() === token.base.toLowerCase()
              );
              const isCorrect = vocabResult?.correct ?? true;
              return (
                <strong key={i} className={isCorrect ? 'text-emerald-700' : 'text-red-500'}>
                  {token.raw}
                </strong>
              );
            }

            // READING step: hide as blank (with optional hint)
            return (
              <span key={i} className="text-violet-600 font-bold underline decoration-dashed decoration-violet-400">
                {hintsRevealed ? buildHint(token.raw) : '___'}
              </span>
            );
          })}
        </div>
      </div>

      {/* Hints toggle (only before result, only if there are passage vocab words) */}
      {step === 'READING' && passageVocabSet.size > 0 && (
        <button
          onClick={() => setHintsRevealed(h => !h)}
          className="flex items-center gap-2 mx-auto text-xs text-slate-500 hover:text-violet-600 transition px-3 py-1.5 rounded-lg hover:bg-violet-50"
        >
          {hintsRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {hintsRevealed ? 'Hide Hints' : 'Show Hints'}
        </button>
      )}

      {/* Recording (only in READING step) */}
      {step === 'READING' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400">Record yourself reading the full passage</p>
          <AudioRecorder
            onRecordingComplete={handleRecording}
            isProcessing={isScoring}
          />
        </div>
      )}

      {/* Result */}
      {step === 'RESULT' && result && (
        <div className="space-y-3">
          {/* Reading accuracy */}
          <div className={`rounded-xl px-4 py-3 ${result.readingMatches ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              {result.readingMatches ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-semibold ${result.readingMatches ? 'text-green-700' : 'text-red-600'}`}>
                {result.readingMatches ? 'Đọc đúng toàn bộ đoạn văn! +20đ' : 'Chưa đọc đủ đoạn văn — 0đ'}
              </span>
            </div>
            {result.penaltiesApplied > 0 && (
              <p className="text-xs text-slate-500">
                −{(result.penaltiesApplied * 0.5).toFixed(1)}đ từ {result.penaltiesApplied} lỗi phát âm
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">{result.feedback}</p>
            {result.mispronunciations.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.mispronunciations.map((m, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="font-semibold text-slate-600 shrink-0">"{m.word}"</span>
                    <span className="text-slate-500">{m.issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vocab word results */}
          {result.vocabResults.length > 0 && (
            <div className="rounded-xl bg-white border border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-400 font-medium mb-2">Từ vựng (+1đ mỗi từ)</p>
              <div className="flex flex-wrap gap-2">
                {result.vocabResults.map((v, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      v.correct
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {v.correct ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {v.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Total score */}
          <div className="text-center py-2">
            <span className="text-3xl font-bold text-emerald-600">{result.pointsEarned.toFixed(1)}</span>
            <span className="text-slate-400 text-sm ml-1">điểm</span>
          </div>

          {/* Recording playback */}
          {recordingUrl && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Bản ghi âm của bạn:</p>
              <audio controls src={recordingUrl} className="w-full h-9 rounded-lg" />
            </div>
          )}

          <button
            onClick={() => onComplete(result.pointsEarned)}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Hoàn thành
          </button>
        </div>
      )}
    </div>
  );
}
