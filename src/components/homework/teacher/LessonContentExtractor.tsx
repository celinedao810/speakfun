"use client";

import React, { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { ExtractedLessonContent, LessonExercises } from '@/lib/types';

interface LessonContentExtractorProps {
  lessonId: string;
  lessonTitle: string;
  pdfPath: string;
  // classId + sessionId are only needed for "Generate Exercises" (creates homework window)
  // Extract Content works without them
  classId?: string;
  sessionId?: string;
  extractedContent: ExtractedLessonContent | null;
  exerciseData: LessonExercises | null;
  onExtracted: (content: ExtractedLessonContent) => void;
  onGenerated?: (exercises: LessonExercises) => void;
}

export default function LessonContentExtractor({
  lessonId,
  lessonTitle,
  pdfPath,
  classId,
  sessionId,
  extractedContent,
  exerciseData,
  onExtracted,
  onGenerated,
}: LessonContentExtractorProps) {
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch('/api/homework/extract-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, pdfPath, lessonTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      onExtracted({
        lessonId,
        vocabulary: data.vocabulary,
        structures: data.structures,
        readingPassage: data.readingPassage || '',
        extractionStatus: 'DONE',
        extractedAt: new Date().toISOString(),
      });
      setShowPreview(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to extract content');
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/homework/generate-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, classId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      onGenerated?.({
        lessonId,
        vocabItems: [],
        structureItems: [],
        readingPassage: '',
        generationStatus: 'DONE',
        generatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate exercises');
    } finally {
      setGenerating(false);
    }
  };

  const isExtracted = extractedContent?.extractionStatus === 'DONE';
  const isGenerated = exerciseData?.generationStatus === 'DONE';

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Status + Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Extract button */}
        {!isExtracted ? (
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {extracting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {extracting ? 'Extracting...' : 'Extract Content'}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-medium">
              <CheckCircle className="w-3.5 h-3.5" />
              Content extracted
              {extractedContent && (
                <span className="text-green-500 font-normal">
                  · {extractedContent.vocabulary.length} vocab
                  · {extractedContent.structures.length} structures
                  {extractedContent.readingPassage ? ' · Reading ✓' : ''}
                </span>
              )}
            </span>
            {!isGenerated && (
              <button
                onClick={handleExtract}
                disabled={extracting}
                className="text-xs text-slate-400 hover:text-violet-600 transition disabled:opacity-50"
                title="Re-extract"
              >
                Re-extract
              </button>
            )}
          </div>
        )}

        {/* Generate exercises button — only after extraction AND when class context is available */}
        {isExtracted && !isGenerated && classId && onGenerated && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {generating ? 'Generating...' : 'Generate Exercises'}
          </button>
        )}

        {isGenerated && (
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            Exercises ready
            {extractedContent && (
              <span className="text-indigo-400 font-normal">
                · {extractedContent.vocabulary.length} vocab · {extractedContent.structures.length} structures
              </span>
            )}
          </span>
        )}

        {/* Regenerate button: shown when exercises are stale (lesson has reading passage but exercises don't) */}
        {isGenerated && classId && onGenerated &&
          extractedContent?.readingPassage && !exerciseData?.readingPassage && (
          <button
            onClick={() => {
              if (confirm('Regenerate exercises to include the reading passage? Delete the current homework window first to avoid conflicts.')) {
                handleGenerate();
              }
            }}
            disabled={generating}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {generating ? 'Regenerating...' : 'Regenerate (add reading)'}
          </button>
        )}

        {/* Preview toggle */}
        {isExtracted && (
          <button
            onClick={() => setShowPreview(p => !p)}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-auto"
          >
            {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showPreview ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Content preview */}
      {showPreview && extractedContent && isExtracted && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {/* Vocabulary */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-700">
                Vocabulary ({extractedContent.vocabulary.length})
              </span>
            </div>
            <ul className="space-y-1">
              {extractedContent.vocabulary.slice(0, 5).map(v => (
                <li key={v.id} className="text-xs text-slate-600">
                  <span className="font-medium">{v.word}</span>
                  <span className="text-slate-400 ml-1">/{v.ipa}/</span>
                </li>
              ))}
              {extractedContent.vocabulary.length > 5 && (
                <li className="text-xs text-slate-400">+{extractedContent.vocabulary.length - 5} more</li>
              )}
            </ul>
          </div>

          {/* Structures */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs font-semibold text-slate-700">
                Structures ({extractedContent.structures.length})
              </span>
            </div>
            <ul className="space-y-1">
              {extractedContent.structures.slice(0, 5).map(s => (
                <li key={s.id} className="text-xs text-slate-600 truncate" title={s.pattern}>
                  {s.pattern}
                </li>
              ))}
              {extractedContent.structures.length > 5 && (
                <li className="text-xs text-slate-400">+{extractedContent.structures.length - 5} more</li>
              )}
            </ul>
          </div>

          {/* Reading passage */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-700">
                Reading Passage ({extractedContent.readingPassage ? extractedContent.readingPassage.length : 0} chars)
              </span>
            </div>
            {extractedContent.readingPassage ? (
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                {extractedContent.readingPassage}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No reading passage found in this lesson.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
