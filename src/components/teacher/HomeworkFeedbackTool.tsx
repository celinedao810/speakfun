"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, X, Loader2, Mic2, BarChart2, MessageSquarePlus, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface FeedbackResult {
  overallScore: number;
  transcription: string;
  feedback: {
    pronunciation: string;
    grammar: string;
    wordChoice: string;
    cohesionAndCoherence: string;
    summary: string;
  };
}

const ACCEPTED_TYPES = [
  'audio/wav', 'audio/x-wav',
  'audio/mpeg', 'audio/mp3',
  'audio/aac', 'audio/x-aac',
  'audio/mp4', 'video/mp4',
  'video/quicktime',
];

const ACCEPT_ATTR = '.wav,.mp3,.aac,.mp4,.mov';
const SESSION_KEY = 'feedback_tool_state';

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBg(score: number) {
  if (score >= 80) return 'bg-green-50 border-green-200';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

interface FeedbackCardProps {
  title: string;
  content: string;
}

function FeedbackCard({ title, content }: FeedbackCardProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition text-left"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 py-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

export default function HomeworkFeedbackTool() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);
  const [teacherComment, setTeacherComment] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [error, setError] = useState('');
  const [restoredFromSession, setRestoredFromSession] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore persisted state on mount (survives SW-triggered page reloads)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { transcription: t, feedbackResult: f } = JSON.parse(saved);
        if (t) { setTranscription(t); setRestoredFromSession(true); }
        if (f) setFeedbackResult(f);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist transcription + feedback whenever they change
  useEffect(() => {
    try {
      if (transcription || feedbackResult) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ transcription, feedbackResult }));
      }
    } catch { /* ignore */ }
  }, [transcription, feedbackResult]);

  const readAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
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
    setFeedbackResult(null);
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
    setFeedbackResult(null);
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

  const handleAssess = async (comment?: string) => {
    if (!transcription) return;
    if (!file && !restoredFromSession) return;
    setIsAssessing(true);
    setError('');
    try {
      let audioBase64 = '';
      let mimeType = '';
      if (file) {
        audioBase64 = await readAsBase64(file);
        mimeType = file.type;
      } else {
        // No file after reload — re-assess using transcription text only (no audio)
        const res = await fetch('/api/ai/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'assess-text-only',
            transcription,
            teacherComment: comment ?? teacherComment,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Assessment failed');
        setFeedbackResult(data);
        setTeacherComment('');
        setIsAssessing(false);
        return;
      }
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'assess',
          audioBase64,
          mimeType,
          transcription,
          teacherComment: comment ?? teacherComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assessment failed');
      setFeedbackResult(data);
      setTeacherComment('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Assessment failed');
    } finally {
      setIsAssessing(false);
    }
  };

  const handleReset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl(null);
    setTranscription('');
    setFeedbackResult(null);
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
          <span>The page was reloaded and your previous results were restored. Re-upload the recording to run a new assessment.</span>
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
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
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
      {audioUrl && (
        <audio controls src={audioUrl} className="w-full rounded-lg" />
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Convert button */}
      {file && (
        <button
          type="button"
          onClick={handleConvert}
          disabled={isConverting}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
        >
          {isConverting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Converting…</>
          ) : (
            <><Mic2 className="w-4 h-4" /> Convert to Text</>
          )}
        </button>
      )}

      {/* Transcription editor */}
      {transcription !== '' && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Transcription</label>
          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Transcription will appear here. You can edit it before assessing."
          />
          {file && (
            <button
              type="button"
              onClick={() => handleAssess()}
              disabled={isAssessing || !transcription.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {isAssessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Assessing…</>
              ) : (
                <><BarChart2 className="w-4 h-4" /> Assess</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Feedback result */}
      {feedbackResult && (
        <div className="space-y-4">
          {/* Score banner */}
          <div className={`border rounded-xl px-5 py-4 flex items-center gap-4 ${scoreBg(feedbackResult.overallScore)}`}>
            <span className={`text-4xl font-bold ${scoreColor(feedbackResult.overallScore)}`}>
              {feedbackResult.overallScore}
            </span>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Overall Score</p>
              <p className="text-sm text-foreground mt-0.5">{feedbackResult.feedback.summary}</p>
            </div>
          </div>

          {/* Dimension cards */}
          <div className="space-y-2">
            <FeedbackCard title="Pronunciation" content={feedbackResult.feedback.pronunciation} />
            <FeedbackCard title="Grammar" content={feedbackResult.feedback.grammar} />
            <FeedbackCard title="Word Choice" content={feedbackResult.feedback.wordChoice} />
            <FeedbackCard title="Cohesion & Coherence" content={feedbackResult.feedback.cohesionAndCoherence} />
          </div>

          {/* Transcription used */}
          <details className="border border-border rounded-lg">
            <summary className="px-4 py-3 text-sm font-semibold cursor-pointer text-muted-foreground hover:text-foreground">
              Transcription used
            </summary>
            <p className="px-4 pb-3 text-sm text-foreground leading-relaxed">{feedbackResult.transcription}</p>
          </details>

          {/* Clear results */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear and start over
            </button>
          </div>

          {/* Teacher comment to refine */}
          <div className="space-y-2 pt-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-primary" />
              Add a comment to refine the feedback
            </label>
            <textarea
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              rows={3}
              placeholder="e.g. Focus more on the student's use of past tense. Ignore minor pronunciation issues."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => handleAssess(teacherComment)}
              disabled={isAssessing || !teacherComment.trim() || (!file && !restoredFromSession)}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-60 transition"
            >
              {isAssessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Re-assessing…</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Re-assess with Comment</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
