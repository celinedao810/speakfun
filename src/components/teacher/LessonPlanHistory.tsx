"use client";

import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Clock, BookOpen, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { fetchLessonPlans, deleteLessonPlan, duplicateLessonPlan } from '@/lib/supabase/queries/lessonPlans';
import { GeneratedLessonPlan } from '@/lib/types';

interface LessonPlanHistoryProps {
  teacherId: string;
  onLoad: (plan: GeneratedLessonPlan) => void;
}

export default function LessonPlanHistory({ teacherId, onLoad }: LessonPlanHistoryProps) {
  const [plans, setPlans] = useState<GeneratedLessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    fetchLessonPlans(supabase, teacherId).then(data => {
      setPlans(data);
      setLoading(false);
    });
  }, [teacherId]);

  const handleDuplicate = async (plan: GeneratedLessonPlan) => {
    setDuplicating(plan.id);
    const newPlan = await duplicateLessonPlan(supabase, teacherId, plan);
    if (newPlan) {
      setPlans(prev => [newPlan, ...prev]);
    }
    setDuplicating(null);
  };

  const handleDelete = async (planId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(planId);
    const success = await deleteLessonPlan(supabase, planId);
    if (success) {
      setPlans(prev => prev.filter(p => p.id !== planId));
    }
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading saved plans...
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <FileText className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">No saved lesson plans yet</p>
        <p className="text-xs mt-1">Generate a plan and click "Save to History" to save it here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold">Saved Lesson Plans</h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          {plans.length}
        </span>
      </div>

      <div className="space-y-3">
        {plans.map(plan => {
          const meta = plan.metadata;
          const date = new Date(plan.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          });

          return (
            <div
              key={plan.id}
              className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{plan.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {meta?.cefrLevel && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {meta.cefrLevel}
                    </span>
                  )}
                  {meta?.topic && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {meta.topic}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {plan.content?.length ?? 0} sections
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {date}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onLoad(plan)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDuplicate(plan)}
                  disabled={duplicating === plan.id}
                  title="Duplicate plan"
                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(plan.id, plan.title)}
                  disabled={deleting === plan.id}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
