"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchLearnerClasses, joinClassByCode, LearnerClassInfo } from '@/lib/supabase/queries/classes';
import { BookOpen, Users, LogIn, FileText } from 'lucide-react';
import Link from 'next/link';

export default function LearnerClassesPage() {
  const { user, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<LearnerClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [classCode, setClassCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchLearnerClasses(supabase, user.id);
      setClasses(data);
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadClasses();
  }, [loadClasses, authLoading, user]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !classCode.trim()) return;
    setError(null);
    setSuccess(null);
    setJoining(true);

    const result = await joinClassByCode(supabase, classCode.trim(), user.id);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Successfully joined the class!');
      setClassCode('');
      loadClasses();
    }
    setJoining(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-6">My Classes</h2>

      {/* Join class form */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Join a Class</h3>
        <form onSubmit={handleJoin} className="flex gap-3">
          <input
            type="text"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value.toUpperCase())}
            placeholder="Enter class code (e.g., A3F2B1)"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-input font-mono uppercase outline-none focus:ring-2 focus:ring-ring focus:border-ring tracking-wider"
            maxLength={6}
          />
          <button
            type="submit"
            disabled={joining || classCode.trim().length < 6}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {joining ? 'Joining...' : 'Join'}
          </button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        {success && (
          <p className="mt-2 text-sm text-emerald-600">{success}</p>
        )}
      </div>

      {/* Enrolled classes */}
      {classes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">You haven&apos;t joined any classes yet.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Ask your teacher for a class code to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <Link
              key={cls.enrollment_id}
              href={`/learner/classes/${cls.class_id}`}
              className="block bg-card rounded-xl border border-border p-5 hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{cls.course_count} courses</span>
                </div>
              </div>
              <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition">
                {cls.class_name}
              </h3>
              {cls.class_description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{cls.class_description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pt-2 border-t border-border">
                <FileText className="w-3 h-3" />
                <span>Teacher: {cls.teacher_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
