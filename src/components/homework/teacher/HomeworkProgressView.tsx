"use client";

import { useState, useEffect } from 'react';
import { ClipboardList, CheckCircle, Clock, XCircle, ChevronDown } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';
import { fetchWindowsByClass, fetchSubmissionsForTeacher } from '@/lib/supabase/queries/homework';
import { fetchEnrollments } from '@/lib/supabase/queries/classes';
import { supabase } from '@/lib/supabase/client';

interface HomeworkProgressViewProps {
  classId: string;
}

interface WindowWithSubmissions {
  window: HomeworkWindow;
  submissions: HomeworkSubmission[];
  totalEnrolled: number;
}

export default function HomeworkProgressView({ classId }: HomeworkProgressViewProps) {
  const [data, setData] = useState<WindowWithSubmissions[]>([]);
  const [learnerNames, setLearnerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expandedWindowId, setExpandedWindowId] = useState<string | null>(null);

  async function load() {
    const [windows, enrollments] = await Promise.all([
      fetchWindowsByClass(supabase, classId),
      fetchEnrollments(supabase, classId),
    ]);
    const totalEnrolled = enrollments.length;

    const nameMap: Record<string, string> = {};
    enrollments.forEach(e => { nameMap[e.learner_id] = e.learner_name || 'Unknown'; });
    setLearnerNames(nameMap);

    // For each window, fetch submissions
    const windowData = await Promise.all(
      windows.slice(0, 20).map(async (w) => {
        const submissions = await fetchSubmissionsForTeacher(supabase, classId, w.id);
        return { window: w, submissions, totalEnrolled };
      })
    );
    setData(windowData);
    setLoading(false);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No homework windows yet.</p>
        <p className="text-xs text-slate-400 mt-1">Generate exercises on a lesson to create homework.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map(({ window, submissions, totalEnrolled }) => {
        const completedCount = submissions.filter(s => s.allCompleted).length;
        const isExpanded = expandedWindowId === window.id;
        const now = new Date();
        const closes = new Date(window.closesAt);
        const isOpen = now < closes;

        return (
          <div key={window.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Window header */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
              onClick={() => setExpandedWindowId(isExpanded ? null : window.id)}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${isOpen ? 'bg-green-400' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {new Date(window.windowDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </span>
                  {window.isReviewSession && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      Review
                    </span>
                  )}
                  {!isOpen && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">Closed</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500">
                    {completedCount}/{totalEnrolled} completed
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-24">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${totalEnrolled > 0 ? (completedCount / totalEnrolled) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600">
                    Max: {window.maxPossiblePoints.toFixed(0)}pts
                  </span>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded: submission list */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {submissions.length === 0 ? (
                  <p className="text-sm text-slate-400 px-5 py-4">No submissions yet.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {submissions.map(sub => (
                      <div key={sub.id} className="flex items-center gap-3 px-5 py-3">
                        {sub.allCompleted ? (
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        ) : sub.submittedAt ? (
                          <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">
                            {learnerNames[sub.learnerId] || sub.learnerId.slice(0, 8) + '...'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {sub.submittedAt
                              ? `Submitted ${new Date(sub.submittedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                              : 'In progress'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-indigo-600">{sub.totalScore.toFixed(1)}pt</p>
                          <div className="flex gap-1 text-xs text-slate-400 mt-0.5">
                            <span title="Vocab">{sub.ex1Score.toFixed(1)}</span>
                            <span>+</span>
                            <span title="Sentences">{sub.ex2Score.toFixed(1)}</span>
                            <span>+</span>
                            <span title="Conversation">{(sub.ex3aScore + sub.ex3bScore).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
