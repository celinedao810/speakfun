import { SupabaseClient } from '@supabase/supabase-js';
import { Class, ClassEnrollment, ClassCourse, ScheduleConfig } from '@/lib/types';

// ============================================================================
// Classes CRUD
// ============================================================================

export async function fetchClasses(
  supabase: SupabaseClient,
  teacherId: string
): Promise<Class[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching classes:', error);
    return [];
  }
  return data as Class[];
}

export async function fetchClass(
  supabase: SupabaseClient,
  classId: string
): Promise<Class | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('id', classId)
    .single();

  if (error) {
    console.error('Error fetching class:', error);
    return null;
  }
  return data as Class;
}

export async function insertClass(
  supabase: SupabaseClient,
  teacherId: string,
  name: string,
  description: string
): Promise<{ data: Class | null; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .insert({ teacher_id: teacherId, name, description })
    .select()
    .single();

  if (error) {
    console.error('Error inserting class:', error);
    return { data: null, error: error.message };
  }
  return { data: data as Class, error: null };
}

export async function updateClass(
  supabase: SupabaseClient,
  classId: string,
  updates: { name?: string; description?: string; schedule_config?: ScheduleConfig | null; google_meet_url?: string }
): Promise<boolean> {
  const { error } = await supabase
    .from('classes')
    .update(updates)
    .eq('id', classId);

  if (error) {
    console.error('Error updating class:', error);
    return false;
  }
  return true;
}

export async function deleteClass(
  supabase: SupabaseClient,
  classId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', classId);

  if (error) {
    console.error('Error deleting class:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Enrollments
// ============================================================================

export async function fetchEnrollments(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassEnrollment[]> {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('*, profiles:learner_id(full_name)')
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true });

  if (error) {
    console.error('Error fetching enrollments:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    class_id: row.class_id as string,
    learner_id: row.learner_id as string,
    enrolled_at: row.enrolled_at as string,
    learner_name: (row.profiles as Record<string, unknown>)?.full_name as string || 'Unknown',
  }));
}

export async function removeEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('class_enrollments')
    .delete()
    .eq('id', enrollmentId);

  if (error) {
    console.error('Error removing enrollment:', error);
    return false;
  }
  return true;
}

// Learner joins class via class code (uses RPC to bypass RLS)
export async function joinClassByCode(
  supabase: SupabaseClient,
  classCode: string,
  _learnerId: string
): Promise<{ data: ClassEnrollment | null; error: string | null }> {
  const { data, error } = await supabase.rpc('join_class_by_code', {
    p_class_code: classCode.toUpperCase(),
  });

  if (error) {
    console.error('Error joining class:', error);
    return { data: null, error: error.message };
  }

  const result = data as { error?: string; data?: { enrollment_id: string; class_id: string; class_name: string } };

  if (result.error) {
    return { data: null, error: result.error };
  }

  if (result.data) {
    return {
      data: {
        id: result.data.enrollment_id,
        class_id: result.data.class_id,
        learner_id: _learnerId,
        enrolled_at: new Date().toISOString(),
      },
      error: null,
    };
  }

  return { data: null, error: 'Unknown error' };
}

// ============================================================================
// Class courses (assign courses to a class)
// ============================================================================

export async function fetchClassCourses(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassCourse[]> {
  const { data, error } = await supabase
    .from('class_courses')
    .select('*, courses:course_id(name, lesson_count)')
    .eq('class_id', classId)
    .order('position', { ascending: true });

  if (error) {
    console.error('Error fetching class courses:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    class_id: row.class_id as string,
    course_id: row.course_id as string,
    position: row.position as number,
    added_at: row.added_at as string,
    course_name: (row.courses as Record<string, unknown>)?.name as string || 'Unknown',
    lesson_count: (row.courses as Record<string, unknown>)?.lesson_count as number || 0,
  }));
}

export async function assignCourseToClass(
  supabase: SupabaseClient,
  classId: string,
  courseId: string,
  position: number
): Promise<{ data: ClassCourse | null; error: string | null }> {
  const { data, error } = await supabase
    .from('class_courses')
    .insert({ class_id: classId, course_id: courseId, position })
    .select('*, courses:course_id(name, lesson_count)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'This course is already assigned to the class' };
    }
    console.error('Error assigning course:', error);
    return { data: null, error: error.message };
  }

  const row = data as Record<string, unknown>;
  return {
    data: {
      id: row.id as string,
      class_id: row.class_id as string,
      course_id: row.course_id as string,
      position: row.position as number,
      added_at: row.added_at as string,
      course_name: (row.courses as Record<string, unknown>)?.name as string || 'Unknown',
      lesson_count: (row.courses as Record<string, unknown>)?.lesson_count as number || 0,
    },
    error: null,
  };
}

// ============================================================================
// Learner-facing queries
// ============================================================================

export interface LearnerClassInfo {
  enrollment_id: string;
  class_id: string;
  class_name: string;
  class_description: string;
  teacher_name: string;
  enrolled_at: string;
  course_count: number;
}

export async function fetchLearnerClasses(
  supabase: SupabaseClient,
  learnerId: string
): Promise<LearnerClassInfo[]> {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('id, class_id, enrolled_at, classes(name, description, profiles:teacher_id(full_name))')
    .eq('learner_id', learnerId)
    .order('enrolled_at', { ascending: false });

  if (error) {
    console.error('Error fetching learner classes:', error);
    return [];
  }

  // For each class, get course count
  const results: LearnerClassInfo[] = [];
  for (const row of data || []) {
    const r = row as Record<string, unknown>;
    const cls = r.classes as Record<string, unknown>;
    const teacher = cls?.profiles as Record<string, unknown>;

    // Count courses assigned to this class
    const { count } = await supabase
      .from('class_courses')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', r.class_id as string);

    results.push({
      enrollment_id: r.id as string,
      class_id: r.class_id as string,
      class_name: (cls?.name as string) || 'Unknown',
      class_description: (cls?.description as string) || '',
      teacher_name: (teacher?.full_name as string) || 'Unknown',
      enrolled_at: r.enrolled_at as string,
      course_count: count || 0,
    });
  }
  return results;
}

export async function removeCourseFromClass(
  supabase: SupabaseClient,
  classCourseId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('class_courses')
    .delete()
    .eq('id', classCourseId);

  if (error) {
    console.error('Error removing course from class:', error);
    return false;
  }
  return true;
}
