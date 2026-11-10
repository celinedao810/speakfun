"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import {
  fetchClass,
  updateClass,
  fetchEnrollments,
  removeEnrollment,
  fetchClassCourses,
  assignCourseToClass,
  removeCourseFromClass,
} from '@/lib/supabase/queries/classes';
import { Class, ClassEnrollment, ClassCourse, Lesson, ExtractedLessonContent, LessonExercises, ClassHomeworkSettings } from '@/lib/types';
import EnrollmentList from '@/components/teacher/EnrollmentList';
import CourseAssigner from '@/components/teacher/CourseAssigner';
import ScheduleConfigurator from '@/components/teacher/ScheduleConfigurator';
import LessonList from '@/components/teacher/LessonList';
import { ArrowLeft, Pencil, Check, X, Copy, Video, BarChart2, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import HomeworkSettingsPanel from '@/components/homework/teacher/HomeworkSettingsPanel';
import HomeworkProgressView from '@/components/homework/teacher/HomeworkProgressView';
import ClassHomeworkProgress from '@/components/homework/teacher/ClassHomeworkProgress';
import { fetchClassHomeworkSettings, fetchExtractedContentsForLessons, fetchLessonExercisesForLessons } from '@/lib/supabase/queries/homework';
import { fetchLessons } from '@/lib/supabase/queries/lessons';
import { getSignedPDFUrl } from '@/lib/supabase/storage';

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const classId = params.id as string;

  const [cls, setCls] = useState<Class | null>(null);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [classCourses, setClassCourses] = useState<ClassCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'homework'>('overview');
  const [homeworkSettings, setHomeworkSettings] = useState<ClassHomeworkSettings | null>(null);
  const [homeworkLessons, setHomeworkLessons] = useState<Lesson[]>([]);
  const [homeworkPdfUrls, setHomeworkPdfUrls] = useState<Record<string, string>>({});
  const [hwExtractedContents, setHwExtractedContents] = useState<Record<string, ExtractedLessonContent>>({});
  const [hwExerciseData, setHwExerciseData] = useState<Record<string, LessonExercises>>({});

  const loadData = useCallback(async () => {
    const [classData, enrollmentData, courseData] = await Promise.all([
      fetchClass(supabase, classId),
      fetchEnrollments(supabase, classId),
      fetchClassCourses(supabase, classId),
    ]);
    if (!classData) {
      router.push('/teacher/classes');
      return;
    }
    setCls(classData);
    setEnrollments(enrollmentData);
    setClassCourses(courseData);
    setNameValue(classData.name);
    setDescValue(classData.description);
    const settings = await fetchClassHomeworkSettings(supabase, classId);
    setHomeworkSettings(settings);
    setLoading(false);
  }, [classId, router]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  useEffect(() => {
    if (activeTab !== 'homework' || classCourses.length === 0) return;
    const load = async () => {
      const allLessons = (await Promise.all(
        classCourses.map(cc => fetchLessons(supabase, cc.course_id))
      )).flat();
      setHomeworkLessons(allLessons);
      const urls: Record<string, string> = {};
      await Promise.all(allLessons.filter(l => l.pdf_path).map(async l => {
        const url = await getSignedPDFUrl(supabase, l.pdf_path!);
        if (url) urls[l.id] = url;
      }));
      setHomeworkPdfUrls(urls);

      // Load existing extraction + exercise status from DB so it persists across refresh
      const lessonIds = allLessons.map(l => l.id);
      const [extracted, exercises] = await Promise.all([
        fetchExtractedContentsForLessons(supabase, lessonIds),
        fetchLessonExercisesForLessons(supabase, lessonIds),
      ]);
      const extractedMap: Record<string, ExtractedLessonContent> = {};
      extracted.forEach(e => { extractedMap[e.lessonId] = e; });
      const exercisesMap: Record<string, LessonExercises> = {};
      exercises.forEach(e => { exercisesMap[e.lessonId] = e; });
      setHwExtractedContents(extractedMap);
      setHwExerciseData(exercisesMap);
    };
    load();
  }, [activeTab, classCourses]);

  const handleSaveName = async () => {
    if (!nameValue.trim() || !cls) return;
    await updateClass(supabase, classId, { name: nameValue.trim() });
    setCls({ ...cls, name: nameValue.trim() });
    setEditingName(false);
  };

  const handleSaveDesc = async () => {
    if (!cls) return;
    await updateClass(supabase, classId, { description: descValue.trim() });
    setCls({ ...cls, description: descValue.trim() });
    setEditingDesc(false);
  };

  const handleCopyCode = async () => {
    if (!cls) return;
    await navigator.clipboard.writeText(cls.class_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    if (!confirm('Remove this student from the class?')) return;
    const ok = await removeEnrollment(supabase, enrollmentId);
    if (ok) {
      setEnrollments(prev => prev.filter(e => e.id !== enrollmentId));
      if (cls) setCls({ ...cls, student_count: cls.student_count - 1 });
    }
  };

  const handleAssignCourse = async (courseId: string) => {
    setError(null);
    const position = classCourses.length;
    const result = await assignCourseToClass(supabase, classId, courseId, position);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setClassCourses(prev => [...prev, result.data!]);
    }
  };

  const handleRemoveCourse = async (classCourseId: string) => {
    const ok = await removeCourseFromClass(supabase, classCourseId);
    if (ok) {
      setClassCourses(prev => prev.filter(cc => cc.id !== classCourseId));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!cls) return null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/teacher/classes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to classes
      </Link>

      {/* Class header */}
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
              <button onClick={() => { setEditingName(false); setNameValue(cls.name); }} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-900">{cls.name}</h2>
              <button onClick={() => setEditingName(true)} className="text-slate-400 hover:text-slate-600 p-1">
                <Pencil className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Description */}
        <div className="flex items-start gap-2 mb-4">
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
              <button onClick={() => { setEditingDesc(false); setDescValue(cls.description); }} className="text-slate-400 hover:text-slate-600 p-1 mt-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {cls.description || 'No description'}
              </p>
              <button onClick={() => setEditingDesc(true)} className="text-slate-400 hover:text-slate-600 p-1 shrink-0">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Class code + stats */}
        <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            title="Copy class code"
          >
            <span className="text-xs text-slate-500">Class Code:</span>
            <span className="font-mono font-semibold text-sm text-indigo-600">{cls.class_code}</span>
            {codeCopied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
          <span className="text-xs text-slate-400">{cls.student_count} students</span>
          {cls.google_meet_url && (
            <a
              href={cls.google_meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition ml-auto"
            >
              <Video className="w-3.5 h-3.5" />
              Zoom
            </a>
          )}
        </div>
      </div>

      {/* Schedule configurator */}
      <ScheduleConfigurator
        classId={classId}
        meetUrl={cls.google_meet_url}
        onUrlSaved={loadData}
      />

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Tabs: Overview | Homework */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('homework')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            activeTab === 'homework'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Homework
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Students section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Students</h3>
            <EnrollmentList
              enrollments={enrollments}
              onRemove={handleRemoveEnrollment}
            />
          </div>

          {/* Courses section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Assigned Courses</h3>
            <CourseAssigner
              teacherId={user!.id}
              classCourses={classCourses}
              onAssign={handleAssignCourse}
              onRemove={handleRemoveCourse}
            />
          </div>
        </div>
      )}

      {activeTab === 'homework' && (
        <div className="space-y-6">
          {/* Lessons from assigned courses — Generate Exercises here */}
          {homeworkLessons.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Lessons</h3>
              <LessonList
                lessons={homeworkLessons}
                pdfUrls={homeworkPdfUrls}
                classId={classId}
                extractedContents={hwExtractedContents}
                exerciseData={hwExerciseData}
                onContentExtracted={(id, c) => setHwExtractedContents(p => ({ ...p, [id]: c }))}
                onExercisesGenerated={(id, e) => setHwExerciseData(p => ({ ...p, [id]: e }))}
                onReorder={() => {}}
                onRename={() => {}}
                onDelete={() => {}}
              />
            </div>
          )}
          {classCourses.length === 0 && (
            <p className="text-sm text-slate-400 italic">
              Assign courses to this class first to see lessons here.
            </p>
          )}

          {homeworkSettings && (
            <HomeworkSettingsPanel
              classId={classId}
              settings={homeworkSettings}
              onSaved={setHomeworkSettings}
            />
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Submissions</h3>
            <HomeworkProgressView classId={classId} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Score Trends</h3>
            <ClassHomeworkProgress classId={classId} />
          </div>
        </div>
      )}
    </div>
  );
}
