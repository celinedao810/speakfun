"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchClass, fetchClassCourses } from '@/lib/supabase/queries/classes';
import { Class, ClassCourse } from '@/lib/types';
import { ArrowLeft, BookOpen, FileText, Users, Video } from 'lucide-react';
import Link from 'next/link';
import HomeworkHub from '@/components/homework/learner/HomeworkHub';
import HomeworkProgress from '@/components/homework/learner/HomeworkProgress';
import HomeworkSessionMap from '@/components/homework/learner/HomeworkSessionMap';
import HomeworkNotebook from '@/components/homework/learner/HomeworkNotebook';
import HomeworkLeaderboard from '@/components/homework/shared/HomeworkLeaderboard';

export default function LearnerClassDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const classId = params.id as string;

  const [cls, setCls] = useState<Class | null>(null);
  const [courses, setCourses] = useState<ClassCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [classData, courseData] = await Promise.all([
      fetchClass(supabase, classId),
      fetchClassCourses(supabase, classId),
    ]);
    setCls(classData);
    setCourses(courseData);
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Class not found or you are not enrolled.</p>
        <Link href="/learner/classes" className="text-primary text-sm mt-2 inline-block">
          Back to My Classes
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/learner/classes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        My Classes
      </Link>

      {/* Class header */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{cls.name}</h2>
        </div>
        {cls.description && (
          <p className="text-sm text-muted-foreground ml-12">{cls.description}</p>
        )}
        {cls.google_meet_url && (
          <div className="ml-12 mt-2">
            <a
              href={cls.google_meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-lg transition"
            >
              <Video className="w-4 h-4" />
              Join Zoom
            </a>
          </div>
        )}
      </div>

      {/* Courses list */}
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Courses</h3>

      {courses.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No courses assigned to this class yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((cc) => (
            <Link
              key={cc.id}
              href={`/learner/courses/${cc.course_id}`}
              className="block bg-card rounded-xl border border-border p-5 hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-primary/15 p-2 rounded-lg">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{cc.lesson_count} lessons</span>
                </div>
              </div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition">
                {cc.course_name}
              </h3>
            </Link>
          ))}
        </div>
      )}
      {/* Homework Hub */}
      <div className="mt-6">
        <HomeworkHub classId={classId} />
      </div>

      {/* Session Map */}
      <div className="mt-6">
        <HomeworkSessionMap classId={classId} />
      </div>

      {/* Homework Progress */}
      <div className="mt-6">
        <HomeworkProgress classId={classId} />
      </div>

      {/* My Notebook (Vocab + Structures) */}
      <div className="mt-6">
        <HomeworkNotebook classId={classId} />
      </div>

      {/* Leaderboard */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Leaderboard</h3>
        <HomeworkLeaderboard classId={classId} currentLearnerId={user?.id} />
      </div>

    </div>
  );
}
