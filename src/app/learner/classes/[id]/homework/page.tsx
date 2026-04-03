"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';

/**
 * /learner/classes/[id]/homework
 *
 * Hub page: fetches today's window, redirects to session page if open.
 */
export default function HomeworkHubPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<HomeworkWindow | null>(null);
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/homework/window?classId=${classId}&date=${today}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setWindow(data.window);
        setSubmission(data.submission);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-2xl p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!window) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 text-sm">No homework available today.</p>
        <Link href={`/learner/classes/${classId}`} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
          <ArrowLeft className="w-4 h-4" />
          Back to class
        </Link>
      </div>
    );
  }

  // If already completed, redirect to session page (scorecard view)
  if (submission?.allCompleted) {
    router.replace(`/learner/classes/${classId}/homework/${window.id}`);
    return null;
  }

  // Redirect directly to session
  router.replace(`/learner/classes/${classId}/homework/${window.id}`);
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );
}
