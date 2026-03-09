"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, X, Loader2, Mic2, Wand2, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { RefinementResult } from '@/lib/services/geminiService';

const ACCEPTED_TYPES = [
  'audio/wav', 'audio/x-wav',
  'audio/mpeg', 'audio/mp3',
  'audio/aac', 'audio/x-aac',
  'audio/mp4', 'video/mp4',
  'video/quicktime',
];

const ACCEPT_ATTR = '.wav,.mp3,.aac,.mp4,.mov';
const SESSION_KEY = 'feedback_tool_state';

export default function HomeworkFeedbackTool() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [refinementResult, setRefinementResult] = useState<RefinementResult | null>(null);
  const [teacherComment, setTeacherComment] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState('');
  const [restoredFromSession, setRestoredFromSession] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore persisted state on mount (survives SW-triggered page reloads)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { transcription: t, refinementResult: r } = JSON.parse(saved);
        if (t) { setTranscription(t); setRestoredFromSession(true); }
        if (r) setRefinementResult(r);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist state whenever it changes
  useEffect(() => {
    try {
      if (transcription || refinementResult) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ transcription, refinementResult }));
      }
    } catch { /* ignore */ }
  }, [transcription, refinementResult]);

  const readAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleFileSelect = (f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(`Unsupported file type "${f.type}". Please upload a WAV, MP3, AAC, MP4, or MOV file.`);
      return;
    }
    setError('');
    setFile(f);
    setAudioUrl(URL.createObjectURL(f));
    setTranscription('');
    setRefinementResult(null);
    setTeacherComment('');
    setRestoredFromSession(false);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsConverting(true);
    setError('');
    setTranscription('');
    setRefinementResult(null);
    try {
      const audioBase64 = await readAsBase64(file);
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'transcribe', audioBase64, mimeType: file.type }),
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

  const handleRefine = async (comment?: string) => {
    if (!transcription.trim()) return;
    setIsRefining(true);
    setError('');
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'refine',
          transcription,
          teacherComment: comment ?? teacherComment,
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

  const handleReset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl(null);
    setTranscription('');
    setRefinementResult(null);
    setTeacherComment('');
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
          <p className="text-xs text-muted-foreground">WAV, MP3, AAC, MP4, MOV</p>
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
          <FileAudio className="w-8 h-8 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button type="button" onClick={handleReset} className="p-1.5 hover:bg-muted rounded-lg transition" title="Remove file">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Audio player */}
      {audioUrl && <audio controls src={audioUrl} className="w-full rounded-lg" />}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Convert button */}
      {file && (
        <button
          type="button"
          onClick={handleConvert}
          disabled={isConverting}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
        >
          {isConverting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting…</>
            : <><Mic2 className="w-4 h-4" /> Convert to Text</>}
        </button>
      )}

      {/* Transcription + Refine */}
      {transcription !== '' && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">Transcription</label>
          <textarea
            value={transcription}
            onChange={(e) => { setTranscription(e.target.value); setRefinementResult(null); }}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Transcription will appear here. You can edit it before refining."
          />
          <button
            type="button"
            onClick={() => handleRefine()}
            disabled={isRefining || !transcription.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {isRefining
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Refining…</>
              : <><Wand2 className="w-4 h-4" /> Refine</>}
          </button>
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
              <p className="text-sm text-foreground leading-relaxed">{transcription}</p>
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
