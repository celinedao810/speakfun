"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchCourses } from '@/lib/supabase/queries/courses';
import { Course, ClassCourse } from '@/lib/types';
import { Plus, BookOpen, Trash2, FileText } from 'lucide-react';

interface CourseAssignerProps {
  teacherId: string;
  classCourses: ClassCourse[];
  onAssign: (courseId: string) => void;
  onRemove: (classCourseId: string) => void;
}

export default function CourseAssigner({ teacherId, classCourses, onAssign, onRemove }: CourseAssignerProps) {
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const assignedCourseIds = new Set(classCourses.map(cc => cc.course_id));

  const loadAllCourses = async () => {
    setLoadingCourses(true);
    const courses = await fetchCourses(supabase, teacherId);
    setAllCourses(courses);
    setLoadingCourses(false);
  };

  useEffect(() => {
    if (showPicker) {
      loadAllCourses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker]);

  const availableCourses = allCourses.filter(c => !assignedCourseIds.has(c.id));

  return (
    <div>
      {/* Assigned courses list */}
      {classCourses.length === 0 ? (
        <div className="text-center py-8 bg-muted/50 rounded-lg border border-dashed border-border mb-4">
          <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No courses assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {classCourses.map((cc) => (
            <div
              key={cc.id}
              className="flex items-center justify-between bg-card rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/15 p-1.5 rounded-lg">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{cc.course_name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                    <FileText className="w-3 h-3" />
                    <span>{cc.lesson_count} lessons</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onRemove(cc.id)}
                className="text-muted-foreground/60 hover:text-destructive transition p-1"
                title="Remove course"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add course button / picker */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition font-medium"
        >
          <Plus className="w-4 h-4" />
          Assign Course
        </button>
      ) : (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Select a course to assign</p>
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-muted-foreground/60 hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {loadingCourses ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : availableCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 py-2">
              {allCourses.length === 0
                ? 'No courses created yet. Create a course first.'
                : 'All courses are already assigned to this class.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {availableCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => {
                    onAssign(course.id);
                    setShowPicker(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 transition text-left"
                >
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{course.name}</p>
                    <p className="text-xs text-muted-foreground/60">{course.lesson_count} lessons</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
