"use client";

import { useState, useEffect } from 'react';
import { BookMarked, Clock, CheckCircle, XCircle, PlayCircle, Trophy, ChevronRight } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';
import Link from 'next/link';

interface HomeworkHubProps {
  classId: string;
}

interface WindowData {
  window: HomeworkWindow | null;
  submission: HomeworkSubmission | null;
  courseComplete?: boolean;
}

function formatCountdown(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  const secs  = Math.floor((diff % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0)  return `${mins}m ${secs}s left`;
  return `${secs}s left`;
}

export default function HomeworkHub({ classId }: HomeworkHubProps) {
  const [data, setData] = useState<WindowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');

  async function load() {
    try {
      const res = await fetch(`/api/homework/window?classId=${classId}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      if (json.window) {
        setCountdown(formatCountdown(json.window.closesAt));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Update countdown every second (needed for short test windows)
  useEffect(() => {
    if (!data?.window) return;
    const interval = setInterval(() => {
      setCountdown(formatCountdown(data.window!.closesAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.window]);

  // When the current window expires, auto-reload to pick up the next session
  useEffect(() => {
    if (!data?.window) return;
    const msUntilClose = new Date(data.window.closesAt).getTime() - Date.now();
    if (msUntilClose <= 0) return;
    const timer = setTimeout(() => {
      setLoading(true);
      load();
    }, msUntilClose + 1500); // +1.5s buffer for scheduler to have created the next window
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.window]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookMarked className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Today&apos;s Homework</span>
        </div>
        <div className="animate-pulse h-8 bg-muted rounded-lg w-48" />
      </div>
    );
  }

  // Course complete — all sessions done
  if (!data?.window && data?.courseComplete) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <BookMarked className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Homework</span>
        </div>
        <p className="text-sm font-semibold text-foreground">Course Complete!</p>
        <p className="text-xs text-muted-foreground/70 mt-1">All homework sessions for this course are done. Great work!</p>
      </div>
    );
  }

  // No homework generated yet
  if (!data?.window) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <BookMarked className="w-4 h-4 text-muted-foreground/60" />
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Today&apos;s Homework</span>
        </div>
        <p className="text-sm text-muted-foreground/60">No homework assigned yet for this class.</p>
      </div>
    );
  }

  const { window: hw, submission } = data;
  const now = new Date();
  const closesAt = new Date(hw.closesAt);
  const isOpen = now < closesAt;
  const isSubmitted = !!submission?.submittedAt;
  const isAllComplete = !!submission?.allCompleted;

  // Submitted and completed
  if (isSubmitted && isAllComplete) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg shrink-0">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800">Homework Complete!</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Score: <span className="font-bold">{submission.totalScore.toFixed(1)} pts</span>
              {' '}· Vocab {submission.ex1Score.toFixed(1)} + Sentences {submission.ex2Score.toFixed(1)} + Free Talk {(submission.ex3aScore + submission.ex3bScore).toFixed(1)}
            </p>
          </div>
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
        </div>
      </div>
    );
  }

  // Closed and not submitted
  if (!isOpen && !isSubmitted) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="bg-destructive/15 p-2 rounded-lg shrink-0">
            <XCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Homework Missed</p>
            <p className="text-xs text-destructive mt-0.5">
              {new Date(hw.windowDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Open — can start or resume
  const isResuming = !!submission?.startedAt && !isSubmitted;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <BookMarked className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Today&apos;s Homework</span>
        <span className="text-xs text-muted-foreground/50 font-normal">Session {hw.sessionNumber}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          {/* Exercise completion status */}
          <div className="flex items-center gap-3 mb-3">
            {[
              { label: 'Vocab', done: submission?.ex1Completed },
              { label: 'Sentences', done: submission?.ex2Completed },
              { label: 'Free Talk', done: submission?.ex3Completed },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-1">
                {done ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-border" />
                )}
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Clock className="w-3.5 h-3.5" />
            <span>{countdown}</span>
          </div>
        </div>

        <Link
          href={`/learner/classes/${classId}/homework/${hw.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition shrink-0"
        >
          <PlayCircle className="w-4 h-4" />
          {isResuming ? 'Resume' : 'Start'}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
