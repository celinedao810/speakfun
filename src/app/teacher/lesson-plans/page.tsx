"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchCourses } from '@/lib/supabase/queries/courses';
import { Course, GeneratedLessonPlan } from '@/lib/types';
import LessonPlanGenerator from '@/components/teacher/LessonPlanGenerator';
import LessonPlanHistory from '@/components/teacher/LessonPlanHistory';

export default function LessonPlansPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'generator' | 'history'>('generator');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadedPlan, setLoadedPlan] = useState<GeneratedLessonPlan | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCourses(supabase, user.id).then(setCourses);
  }, [user]);

  const handlePlanSaved = (_plan: GeneratedLessonPlan) => {
    // No-op: history is fetched fresh when the tab is opened
  };

  const handleLoadFromHistory = (plan: GeneratedLessonPlan) => {
    setLoadedPlan(plan);
    setActiveTab('generator');
  };

  if (!user) return null;

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('generator')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'generator'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          Generator
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'generator' ? (
        <LessonPlanGenerator
          teacherId={user.id}
          courses={courses}
          initialPlan={loadedPlan}
          onSaved={handlePlanSaved}
        />
      ) : (
        <LessonPlanHistory
          teacherId={user.id}
          onLoad={handleLoadFromHistory}
        />
      )}
    </div>
  );
}
