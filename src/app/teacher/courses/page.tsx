"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchCourses, insertCourse, deleteCourse } from '@/lib/supabase/queries/courses';
import { Course } from '@/lib/types';
import CourseForm from '@/components/teacher/CourseForm';
import { Plus, BookOpen, Trash2, FileText } from 'lucide-react';
import Link from 'next/link';

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    if (!user) return;
    const data = await fetchCourses(supabase, user.id);
    setCourses(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleCreate = async (name: string, description: string) => {
    if (!user) return;
    setError(null);
    const result = await insertCourse(supabase, user.id, name, description);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setCourses(prev => [result.data!, ...prev]);
      setShowForm(false);
    }
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm('Delete this course and all its lessons? This cannot be undone.')) return;
    setDeleting(courseId);
    const ok = await deleteCourse(supabase, courseId);
    if (ok) {
      setCourses(prev => prev.filter(c => c.id !== courseId));
    }
    setDeleting(null);
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">My Courses</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Course
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6">
          <CourseForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {courses.length === 0 && !showForm ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No courses yet. Create your first course to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition group"
            >
              <Link href={`/teacher/courses/${course.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <div className="bg-primary/15 p-2 rounded-lg">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{course.lesson_count} lessons</span>
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition">
                  {course.name}
                </h3>
                {course.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                )}
              </Link>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground/60">
                  {new Date(course.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(course.id);
                  }}
                  disabled={deleting === course.id}
                  className="text-muted-foreground/60 hover:text-destructive transition p-1"
                  title="Delete course"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
