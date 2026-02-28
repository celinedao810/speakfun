"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchCourse, updateCourse } from '@/lib/supabase/queries/courses';
import { fetchLessons, insertLesson, deleteLesson, updateLesson, reorderLessons } from '@/lib/supabase/queries/lessons';
import { uploadLessonPDF, deleteLessonPDF, getSignedPDFUrl } from '@/lib/supabase/storage';
import { Course, Lesson, ExtractedLessonContent } from '@/lib/types';
import LessonList from '@/components/teacher/LessonList';
import LessonUploader from '@/components/teacher/LessonUploader';
import { ArrowLeft, Pencil, Check, X } from 'lucide-react';
import Link from 'next/link';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingHomeworkCount, setEditingHomeworkCount] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [homeworkCountValue, setHomeworkCountValue] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [extractedContents, setExtractedContents] = useState<Record<string, ExtractedLessonContent>>({});

  const fetchPdfUrls = useCallback(async (lessonsList: Lesson[]) => {
    const withPdf = lessonsList.filter((l) => l.pdf_path);
    if (withPdf.length === 0) return;
    const entries = await Promise.all(
      withPdf.map(async (lesson) => {
        const url = await getSignedPDFUrl(supabase, lesson.pdf_path!);
        return [lesson.id, url] as const;
      })
    );
    const urls: Record<string, string> = {};
    for (const [id, url] of entries) {
      if (url) urls[id] = url;
    }
    setPdfUrls(urls);
  }, []);

  const loadData = useCallback(async () => {
    const [courseData, lessonsData] = await Promise.all([
      fetchCourse(supabase, courseId),
      fetchLessons(supabase, courseId),
    ]);
    if (!courseData) {
      router.push('/teacher/courses');
      return;
    }
    setCourse(courseData);
    setLessons(lessonsData);
    setNameValue(courseData.name);
    setDescValue(courseData.description);
    setHomeworkCountValue(courseData.homework_lesson_count?.toString() ?? '');
    setLoading(false);
    fetchPdfUrls(lessonsData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleSaveName = async () => {
    if (!nameValue.trim() || !course) return;
    await updateCourse(supabase, courseId, { name: nameValue.trim() });
    setCourse({ ...course, name: nameValue.trim() });
    setEditingName(false);
  };

  const handleSaveDesc = async () => {
    if (!course) return;
    await updateCourse(supabase, courseId, { description: descValue.trim() });
    setCourse({ ...course, description: descValue.trim() });
    setEditingDesc(false);
  };

  const handleSaveHomeworkCount = async () => {
    if (!course) return;
    const parsed = parseInt(homeworkCountValue, 10);
    const value = (!homeworkCountValue.trim() || isNaN(parsed) || parsed < 1) ? null : parsed;
    await updateCourse(supabase, courseId, { homework_lesson_count: value });
    setCourse({ ...course, homework_lesson_count: value });
    setEditingHomeworkCount(false);
  };

  const handleUpload = async (files: File[]) => {
    if (!user) return;
    setUploading(true);
    setUploadError(null);

    try {
      for (const file of files) {
        const title = file.name.replace(/\.pdf$/i, '');
        const sortOrder = lessons.length;
        const lesson = await insertLesson(supabase, courseId, title, sortOrder);
        if (!lesson) {
          setUploadError('Failed to create lesson record. Check Supabase RLS policies.');
          continue;
        }

        const pdfPath = await uploadLessonPDF(supabase, courseId, lesson.id, file);
        if (!pdfPath) {
          setUploadError('Upload failed. Make sure the "lesson-pdfs" storage bucket exists and policies are applied (migrations 004 & 005).');
          // Clean up the lesson row since PDF failed
          await deleteLesson(supabase, lesson.id);
          continue;
        }

        await updateLesson(supabase, lesson.id, {
          pdf_path: pdfPath,
          pdf_file_name: file.name,
        });
        const newLesson = { ...lesson, pdf_path: pdfPath, pdf_file_name: file.name };
        setLessons(prev => [...prev, newLesson]);

        const url = await getSignedPDFUrl(supabase, pdfPath);
        if (url) {
          setPdfUrls(prev => ({ ...prev, [lesson.id]: url }));
        }
      }

      // Refresh course to get updated lesson_count
      const updated = await fetchCourse(supabase, courseId);
      if (updated) setCourse(updated);
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (lessonId: string, newTitle: string) => {
    await updateLesson(supabase, lessonId, { title: newTitle });
    setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, title: newTitle } : l));
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    if (lesson.pdf_path) {
      await deleteLessonPDF(supabase, lesson.pdf_path);
    }
    await deleteLesson(supabase, lessonId);
    const remaining = lessons.filter(l => l.id !== lessonId);

    // Re-order remaining lessons
    const reordered = remaining.map((l, i) => ({ ...l, sort_order: i }));
    if (reordered.length > 0) {
      await reorderLessons(supabase, reordered.map(l => ({ id: l.id, sort_order: l.sort_order })));
    }
    setLessons(reordered);

    const updated = await fetchCourse(supabase, courseId);
    if (updated) setCourse(updated);
  };

  const handleReorder = async (reorderedLessons: Lesson[]) => {
    const withOrder = reorderedLessons.map((l, i) => ({ ...l, sort_order: i }));
    setLessons(withOrder);
    await reorderLessons(supabase, withOrder.map(l => ({ id: l.id, sort_order: l.sort_order })));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!course) return null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/teacher/courses"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to courses
      </Link>

      {/* Course header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        {/* Name */}
        <div className="flex items-center gap-2 mb-2">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="text-xl font-bold text-slate-900 border border-slate-300 rounded-lg px-3 py-1 flex-1 outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button onClick={handleSaveName} className="text-green-600 hover:text-green-700 p-1">
                <Check className="w-5 h-5" />
              </button>
              <button onClick={() => { setEditingName(false); setNameValue(course.name); }} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-900">{course.name}</h2>
              <button onClick={() => setEditingName(true)} className="text-slate-400 hover:text-slate-600 p-1">
                <Pencil className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Description */}
        <div className="flex items-start gap-2">
          {editingDesc ? (
            <div className="flex items-start gap-2 flex-1">
              <textarea
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                className="text-sm text-slate-600 border border-slate-300 rounded-lg px-3 py-2 flex-1 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={2}
                autoFocus
              />
              <button onClick={handleSaveDesc} className="text-green-600 hover:text-green-700 p-1 mt-1">
                <Check className="w-5 h-5" />
              </button>
              <button onClick={() => { setEditingDesc(false); setDescValue(course.description); }} className="text-slate-400 hover:text-slate-600 p-1 mt-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {course.description || 'No description'}
              </p>
              <button onClick={() => setEditingDesc(true)} className="text-slate-400 hover:text-slate-600 p-1 shrink-0">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span>{course.lesson_count} lesson{course.lesson_count !== 1 ? 's' : ''} uploaded</span>

          {/* Homework lesson count */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Lessons for homework:</span>
            {editingHomeworkCount ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={homeworkCountValue}
                  onChange={(e) => setHomeworkCountValue(e.target.value)}
                  className="w-16 text-xs border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveHomeworkCount()}
                  placeholder="e.g. 6"
                />
                <button onClick={handleSaveHomeworkCount} className="text-green-600 hover:text-green-700">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditingHomeworkCount(false);
                    setHomeworkCountValue(course.homework_lesson_count?.toString() ?? '');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {course.homework_lesson_count != null ? (
                  <span className="font-semibold text-indigo-600">{course.homework_lesson_count}</span>
                ) : (
                  <span className="text-amber-500 font-medium">Not set — homework blocked</span>
                )}
                <button
                  onClick={() => setEditingHomeworkCount(true)}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lesson uploader */}
      <div className="mb-6">
        <LessonUploader onUpload={handleUpload} uploading={uploading} />
        {uploadError && (
          <div className="mt-3 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">
            <strong>Upload error:</strong> {uploadError}
          </div>
        )}
      </div>

      {/* Lesson list */}
      <LessonList
        lessons={lessons}
        onReorder={handleReorder}
        onRename={handleRename}
        onDelete={handleDeleteLesson}
        pdfUrls={pdfUrls}
        extractedContents={extractedContents}
        onContentExtracted={(lessonId, content) =>
          setExtractedContents(prev => ({ ...prev, [lessonId]: content }))
        }
      />
    </div>
  );
}
