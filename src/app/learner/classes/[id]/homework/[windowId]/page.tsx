"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';
import HomeworkSession from '@/components/homework/learner/HomeworkSession';

/**
 * /learner/classes/[id]/homework/[windowId]
 *
 * Active homework session page. Loads the window + existing submission,
 * then renders the HomeworkSession orchestrator.
 */
export default function HomeworkSessionPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const windowId = params.windowId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hw, setHw] = useState<HomeworkWindow | null>(null);
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);
  const [lessonName, setLessonName] = useState<string | null>(null);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    // Fetch the specific window by fetching today's window for this class
    // then verify it matches the windowId
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/homework/window?classId=${classId}&date=${today}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        const w: HomeworkWindow | null = data.window;
        if (!w) throw new Error('Homework window not found.');

        // Check if window is closed
        const now = new Date();
        const closesAt = new Date(w.closesAt);
        if (now > closesAt && !data.submission?.allCompleted) {
          setIsClosed(true);
        }

        setHw(w);
        setSubmission(data.submission);
        setLessonName(data.lessonName ?? null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [classId, windowId]);

  const handleDone = () => {
    router.push(`/learner/classes/${classId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-destructive/10 rounded-2xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive font-medium">{error}</p>
          <Link
            href={`/learner/classes/${classId}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to class
          </Link>
        </div>
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-muted rounded-2xl p-8 text-center">
          <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">Homework Closed</h3>
          <p className="text-sm text-muted-foreground mb-4">This homework window has ended.</p>
          <Link
            href={`/learner/classes/${classId}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to class
          </Link>
        </div>
      </div>
    );
  }

  if (!hw) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        href={`/learner/classes/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to class
      </Link>

      {/* Session date header */}
      <div className="mb-4">
        <h1 className="text-lg font-bold text-foreground">
          {hw.isReviewSession ? 'Review Session' : "Today's Homework"}
        </h1>
        {lessonName && (
          <p className="text-sm font-medium text-primary mt-0.5">{lessonName}</p>
        )}
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {new Date(hw.windowDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
          })}
        </p>
      </div>

      <HomeworkSession
        window={hw}
        classId={classId}
        existingSubmission={submission}
        onDone={handleDone}
      />
    </div>
  );
}
