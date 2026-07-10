"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, FileVideo, X, Loader2, Mic2, Wand2, RefreshCw, AlertTriangle, ArrowRight, Sparkles, MessageSquareText } from 'lucide-react';
import type { RefinementResult, SpeechAnalysisResult, AnalysisCategory, AnalysisError } from '@/lib/services/geminiService';

const ACCEPTED_AUDIO_TYPES = new Set([
  'audio/wav', 'audio/x-wav',
  'audio/mpeg', 'audio/mp3',
  'audio/aac', 'audio/x-aac',
  'audio/mp4',
  'audio/x-m4a', 'audio/m4a',
]);

const ACCEPTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/3gpp',
  'video/3gpp2',
]);

const ACCEPTED_TYPES = [...ACCEPTED_AUDIO_TYPES, ...ACCEPTED_VIDEO_TYPES];

const ACCEPT_ATTR = '.wav,.mp3,.aac,.m4a,.mp4,.mov,.webm,.avi,.3gp';

const isVideoFile = (f: File) => ACCEPTED_VIDEO_TYPES.has(f.type);
const SESSION_KEY = 'feedback_tool_state';

const CATEGORY_META: Record<AnalysisCategory, { label: string; highlight: string; badge: string }> = {
  pronunciation: { label: 'Pronunciation', highlight: 'bg-red-100 text-red-800 border-b-2 border-red-400', badge: 'bg-red-100 text-red-700' },
  wordStress:    { label: 'Word stress',   highlight: 'bg-amber-100 text-amber-800 border-b-2 border-amber-400', badge: 'bg-amber-100 text-amber-700' },
  grammar:       { label: 'Grammar',       highlight: 'bg-blue-100 text-blue-800 border-b-2 border-blue-400', badge: 'bg-blue-100 text-blue-700' },
  wordChoice:    { label: 'Word choice',   highlight: 'bg-purple-100 text-purple-800 border-b-2 border-purple-400', badge: 'bg-purple-100 text-purple-700' },
};

const CATEGORY_ORDER: AnalysisCategory[] = ['pronunciation', 'wordStress', 'grammar', 'wordChoice'];

type HighlightSegment = { text: string; error?: AnalysisError };

/**
 * Split the transcription into segments, wrapping the first unmatched occurrence
 * of each error's text. Errors whose text can't be found are simply not highlighted
 * (they still appear in the error list below).
 */
function buildHighlightSegments(transcription: string, errors: AnalysisError[]): HighlightSegment[] {
  // Locate each error's span (first occurrence after already-claimed spans)
  const spans: { start: number; end: number; error: AnalysisError }[] = [];
  const lower = transcription.toLowerCase();
  for (const error of errors) {
    const needle = error.text.trim();
    if (!needle) continue;
    const needleLower = needle.toLowerCase();
    let from = 0;
    while (from <= lower.length - needleLower.length) {
      const idx = lower.indexOf(needleLower, from);
      if (idx === -1) break;
      const overlaps = spans.some(s => idx < s.end && idx + needle.length > s.start);
      if (!overlaps) {
        spans.push({ start: idx, end: idx + needle.length, error });
        break;
      }
      from = idx + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: transcription.slice(cursor, span.start) });
    segments.push({ text: transcription.slice(span.start, span.end), error: span.error });
    cursor = span.end;
  }
  if (cursor < transcription.length) segments.push({ text: transcription.slice(cursor) });
  return segments;
}

export default function HomeworkFeedbackTool() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [analysisResult, setAnalysisResult] = useState<SpeechAnalysisResult | null>(null);
  const [analysisInstruction, setAnalysisInstruction] = useState('');
  const [refinementResult, setRefinementResult] = useState<RefinementResult | null>(null);
  const [teacherComment, setTeacherComment] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackInstruction, setFeedbackInstruction] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [restoredFromSession, setRestoredFromSession] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore persisted state on mount (survives SW-triggered page reloads)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { transcription: t, analysisResult: a, refinementResult: r, feedbackText: f } = JSON.parse(saved);
        if (t) setTranscription(t);
        if (a) setAnalysisResult(a);
        if (r) setRefinementResult(r);
        if (f) setFeedbackText(f);
        if (t || a) setRestoredFromSession(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist state whenever it changes
  useEffect(() => {
    try {
      if (transcription || analysisResult || refinementResult || feedbackText) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ transcription, analysisResult, refinementResult, feedbackText }));
      }
    } catch { /* ignore */ }
  }, [transcription, analysisResult, refinementResult, feedbackText]);

  const readAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleFileSelect = (f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(`Unsupported file type "${f.type}". Please upload a WAV, MP3, AAC, M4A, MP4, MOV, WebM, or AVI file.`);
      return;
    }
    setError('');
    setFile(f);
    setAudioUrl(URL.createObjectURL(f));
    setTranscription('');
    setAnalysisResult(null);
    setAnalysisInstruction('');
    setRefinementResult(null);
    setTeacherComment('');
    setFeedbackText('');
    setFeedbackInstruction('');
    setRestoredFromSession(false);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  // Encode a mono AudioBuffer as a WAV Blob
  const encodeWav = (buf: AudioBuffer): Blob => {
    const ch = buf.getChannelData(0);
    const dataLen = ch.length * 2;
    const ab = new ArrayBuffer(44 + dataLen);
    const v = new DataView(ab);
    const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true);
    str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, dataLen, true);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return new Blob([ab], { type: 'audio/wav' });
  };

  // Extract audio from a video file client-side → 16 kHz mono WAV (~1.9 MB/min of speech)
  const extractAudioFromVideo = async (f: File): Promise<File> => {
    const ctx = new AudioContext();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await f.arrayBuffer());
    } finally {
      await ctx.close();
    }
    const TARGET_RATE = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_RATE), TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return new File([encodeWav(rendered)], f.name.replace(/\.[^.]+$/, '.wav'), { type: 'audio/wav' });
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsConverting(true);
    setError('');
    setTranscription('');
    setRefinementResult(null);
    try {
      let audioFile = file;
      if (isVideoFile(file)) {
        audioFile = await extractAudioFromVideo(file);
      }
      const audioBase64 = await readAsBase64(audioFile);
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'transcribe', audioBase64, mimeType: audioFile.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      setTranscription(data.transcription || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsConverting(false);
    }
  };

  const handleAnalyze = async (instruction?: string) => {
    if (!file) return;
    setIsAnalyzing(true);
    setError('');
    try {
      let audioFile = file;
      if (isVideoFile(file)) {
        audioFile = await extractAudioFromVideo(file);
      }
      const audioBase64 = await readAsBase64(audioFile);
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'analyze', audioBase64, mimeType: audioFile.type, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysisResult(data);
      setAnalysisInstruction('');
      // Downstream results are based on the previous analysis — clear them
      setRefinementResult(null);
      setFeedbackText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRefine = async (comment?: string) => {
    const sourceText = analysisResult?.transcription ?? '';
    if (!sourceText.trim()) return;
    setIsRefining(true);
    setError('');
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'refine',
          transcription: sourceText,
          teacherComment: comment ?? teacherComment,
          errors: analysisResult?.errors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refinement failed');
      setRefinementResult(data);
      setTeacherComment('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Refinement failed');
    } finally {
      setIsRefining(false);
    }
  };

  const handleGenerateFeedback = async (instruction?: string) => {
    if (!analysisResult) return;
    setIsGeneratingFeedback(true);
    setError('');
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'generate-feedback', analysis: analysisResult, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Feedback generation failed');
      setFeedbackText(data.feedback || '');
      setFeedbackInstruction('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Feedback generation failed');
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleReset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl(null);
    setTranscription('');
    setAnalysisResult(null);
    setAnalysisInstruction('');
    setRefinementResult(null);
    setTeacherComment('');
    setFeedbackText('');
    setFeedbackInstruction('');
    setError('');
    setRestoredFromSession(false);
    sessionStorage.removeItem(SESSION_KEY);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Restored-from-session notice */}
      {restoredFromSession && !file && (
        <div className="flex items-start gap-3 text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-yellow-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>The page was reloaded and your previous results were restored. Re-upload the recording to start fresh.</span>
        </div>
      )}

      {/* Upload area */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground mb-1">Drop a recording here or click to upload</p>
          <p className="text-xs text-muted-foreground">Audio: WAV, MP3, AAC, M4A · Video: MP4, MOV, WebM, AVI (audio extracted automatically)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
        </div>
      ) : (
        <div className="border border-border rounded-xl p-4 flex items-center gap-3 bg-muted/20">
          {isVideoFile(file)
            ? <FileVideo className="w-8 h-8 text-primary shrink-0" />
            : <FileAudio className="w-8 h-8 text-primary shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
              {isVideoFile(file) && <span className="ml-2 text-primary/70">· audio will be extracted</span>}
            </p>
          </div>
          <button type="button" onClick={handleReset} className="p-1.5 hover:bg-muted rounded-lg transition" title="Remove file">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Media player */}
      {audioUrl && file && (
        isVideoFile(file)
          ? <video controls src={audioUrl} className="w-full rounded-lg" />
          : <audio controls src={audioUrl} className="w-full rounded-lg" />
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Convert + Analyze buttons */}
      {file && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleConvert}
            disabled={isConverting || isAnalyzing}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {isConverting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {file && isVideoFile(file) ? 'Extracting audio…' : 'Converting…'}</>
              : <><Mic2 className="w-4 h-4" /> {file && isVideoFile(file) ? 'Extract & Convert to Text' : 'Convert to Text'}</>}
          </button>
          <button
            type="button"
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing || isConverting}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {isAnalyzing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
              : <><Sparkles className="w-4 h-4" /> Analyze</>}
          </button>
        </div>
      )}

      {/* Transcription (from Convert) */}
      {transcription !== '' && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">Transcription</label>
          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Transcription will appear here."
          />
        </div>
      )}

      {/* Analysis results */}
      {analysisResult && (
        <div className="space-y-4">
          {/* Analysis summary */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Analysis Summary</p>
            <p className="text-sm text-foreground">{analysisResult.summary}</p>
          </div>

          {/* Converted text with highlighted errors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold text-foreground">Converted text</p>
              <div className="flex items-center gap-2 flex-wrap">
                {CATEGORY_ORDER.map((cat) => (
                  <span key={cat} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_META[cat].badge}`}>
                    {CATEGORY_META[cat].label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {buildHighlightSegments(analysisResult.transcription, analysisResult.errors).map((seg, i) =>
                seg.error ? (
                  <span
                    key={i}
                    className={`rounded px-0.5 cursor-help ${CATEGORY_META[seg.error.category]?.highlight ?? ''}`}
                    title={`${CATEGORY_META[seg.error.category]?.label ?? seg.error.category}: ${seg.error.description}`}
                  >
                    {seg.text}
                  </span>
                ) : (
                  <React.Fragment key={i}>{seg.text}</React.Fragment>
                )
              )}
            </div>
          </div>

          {/* Errors grouped by category */}
          {analysisResult.errors.length > 0 ? (
            <div className="space-y-3">
              {CATEGORY_ORDER.map((cat) => {
                const items = analysisResult.errors.filter((e) => e.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">{CATEGORY_META[cat].label} ({items.length})</p>
                    <div className="space-y-2">
                      {items.map((e, i) => (
                        <div key={i} className="text-sm border border-border rounded-lg px-4 py-3 space-y-1.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className={`font-medium rounded px-1 ${CATEGORY_META[cat].highlight}`}>{e.text}</span>
                            {e.heard && (
                              <>
                                <span className="text-xs text-muted-foreground mt-0.5">recognized as</span>
                                <span className="text-red-500">&ldquo;{e.heard}&rdquo;</span>
                              </>
                            )}
                            {e.suggestion && (
                              <>
                                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-green-600 font-medium">{e.suggestion}</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{e.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No errors detected across pronunciation, word stress, grammar, or word choice. 🎉</p>
          )}

          {/* Re-run analysis with instructions */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-semibold text-foreground">Not happy with the analysis?</label>
            <p className="text-xs text-muted-foreground">Add comments or instructions and run the analysis again.</p>
            <textarea
              value={analysisInstruction}
              onChange={(e) => setAnalysisInstruction(e.target.value)}
              rows={2}
              placeholder='e.g. "Listen again for ending sounds" or "The word in the 2nd sentence is «criteria», re-check it"'
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => handleAnalyze(analysisInstruction.trim() || undefined)}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-60 transition"
            >
              {isAnalyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Re-analyzing…</>
                : <><RefreshCw className="w-4 h-4" /> Run analysis again</>}
            </button>
          </div>

          {/* Next actions: Refine + Give feedback */}
          <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => handleRefine()}
              disabled={isRefining || isGeneratingFeedback || isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {isRefining
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Refining…</>
                : <><Wand2 className="w-4 h-4" /> Refine</>}
            </button>
            <button
              type="button"
              onClick={() => handleGenerateFeedback()}
              disabled={isGeneratingFeedback || isRefining || isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {isGeneratingFeedback
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing feedback…</>
                : <><MessageSquareText className="w-4 h-4" /> Give feedback</>}
            </button>
          </div>
        </div>
      )}

      {/* Feedback result */}
      {feedbackText && (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Feedback for the student</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{feedbackText}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Adjust the feedback</label>
            <textarea
              value={feedbackInstruction}
              onChange={(e) => setFeedbackInstruction(e.target.value)}
              rows={2}
              placeholder='e.g. "Make it shorter" or "Be more encouraging about the structure"'
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => handleGenerateFeedback(feedbackInstruction.trim() || undefined)}
              disabled={isGeneratingFeedback || !feedbackInstruction.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-60 transition"
            >
              {isGeneratingFeedback
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating…</>
                : <><RefreshCw className="w-4 h-4" /> Regenerate feedback</>}
            </button>
          </div>
        </div>
      )}

      {/* Refinement result */}
      {refinementResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-foreground">{refinementResult.summary}</p>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Original</p>
              <p className="text-sm text-foreground leading-relaxed">{analysisResult?.transcription ?? transcription}</p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-1">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Refined</p>
              <p className="text-sm text-foreground leading-relaxed">{refinementResult.refinedText}</p>
            </div>
          </div>

          {/* Changes list */}
          {refinementResult.changes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">What was changed</p>
              <div className="space-y-2">
                {refinementResult.changes.map((c, i) => (
                  <div key={i} className="text-sm border border-border rounded-lg px-4 py-3 space-y-1.5">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-red-500 line-through">{c.original}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-green-600 font-medium">{c.corrected}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear */}
          <div className="flex justify-end">
            <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground underline">
              Clear and start over
            </button>
          </div>

          {/* Teacher comment to regenerate */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-semibold text-foreground">Add a comment to regenerate</label>
            <p className="text-xs text-muted-foreground">Tell the AI how to adjust the refined version.</p>
            <textarea
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              rows={3}
              placeholder='e.g. "Make it more formal" or "Keep the phrasing closer to the original"'
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => handleRefine(teacherComment)}
              disabled={isRefining || !teacherComment.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-60 transition"
            >
              {isRefining
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating…</>
                : <><RefreshCw className="w-4 h-4" /> Regenerate</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
