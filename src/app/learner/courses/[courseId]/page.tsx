"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchCourse } from '@/lib/supabase/queries/courses';
import { fetchLessons } from '@/lib/supabase/queries/lessons';
import { getSignedPDFUrl } from '@/lib/supabase/storage';
import { Course, Lesson } from '@/lib/types';
import { ArrowLeft, BookOpen, FileText, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

export default function LearnerCourseViewPage() {
  const params = useParams();
  const { user } = useAuth();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const [courseData, lessonsData] = await Promise.all([
        fetchCourse(supabase, courseId),
        fetchLessons(supabase, courseId),
      ]);
      setCourse(courseData);
      setLessons(lessonsData);

      // Pre-fetch signed URLs for all lessons with PDFs
      const lessonsWithPdf = lessonsData.filter((l) => l.pdf_path);
      if (lessonsWithPdf.length > 0) {
        const urlEntries = await Promise.all(
          lessonsWithPdf.map(async (lesson) => {
            const url = await getSignedPDFUrl(supabase, lesson.pdf_path!);
            return [lesson.id, url] as const;
          })
        );
        const urls: Record<string, string> = {};
        for (const [id, url] of urlEntries) {
          if (url) urls[id] = url;
        }
        setPdfUrls(urls);
      }
    } catch (err) {
      console.error('Error loading course data:', err);
      setError('Failed to load course data.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleOpenLesson = (lesson: Lesson) => {
    if (openLessonId === lesson.id) {
      setOpenLessonId(null);
      return;
    }
    setOpenLessonId(lesson.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">{error || 'Course not found.'}</p>
        <Link href="/learner/classes" className="text-indigo-600 text-sm mt-2 inline-block">
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
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        My Classes
      </Link>

      {/* Course header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{course.name}</h2>
            {course.description && (
              <p className="text-sm text-slate-500">{course.description}</p>
            )}
          </div>
        </div>
        <div className="ml-12 text-xs text-slate-400">{lessons.length} lessons</div>
      </div>

      {/* Lessons list */}
      <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Lessons</h3>

      {lessons.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No lessons in this course yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson, index) => (
            <div key={lesson.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Lesson row */}
              <button
                onClick={() => handleOpenLesson(lesson)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
              >
                <span className="text-sm font-semibold text-indigo-600 w-8 text-center shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{lesson.title}</p>
                  {lesson.pdf_file_name && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <FileText className="w-3 h-3" />
                      {lesson.pdf_file_name}
                    </p>
                  )}
                </div>
                {lesson.pdf_path && (
                  openLessonId === lesson.id
                    ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* PDF viewer (expanded) */}
              {openLessonId === lesson.id && lesson.pdf_path && (
                <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
                  {pdfUrls[lesson.id] ? (
                    <div>
                      <div className="flex justify-end mb-2">
                        <a
                          href={pdfUrls[lesson.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in new tab
                        </a>
                      </div>
                      <iframe
                        src={pdfUrls[lesson.id]}
                        className="w-full rounded-lg border border-slate-200"
                        style={{ height: '70vh' }}
                        title={lesson.title}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">Unable to load PDF.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
