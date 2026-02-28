import { SupabaseClient } from '@supabase/supabase-js';
import { Course } from '@/lib/types';

export async function fetchCourses(
  supabase: SupabaseClient,
  teacherId: string
): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching courses:', error);
    return [];
  }
  return data as Course[];
}

export async function fetchCourse(
  supabase: SupabaseClient,
  courseId: string
): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (error) {
    console.error('Error fetching course:', error);
    return null;
  }
  return data as Course;
}

export async function insertCourse(
  supabase: SupabaseClient,
  teacherId: string,
  name: string,
  description: string
): Promise<{ data: Course | null; error: string | null }> {
  const { data, error } = await supabase
    .from('courses')
    .insert({ teacher_id: teacherId, name, description })
    .select()
    .single();

  if (error) {
    console.error('Error inserting course:', error);
    return { data: null, error: error.message };
  }
  return { data: data as Course, error: null };
}

export async function updateCourse(
  supabase: SupabaseClient,
  courseId: string,
  updates: { name?: string; description?: string; homework_lesson_count?: number | null }
): Promise<boolean> {
  const { error } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', courseId);

  if (error) {
    console.error('Error updating course:', error);
    return false;
  }
  return true;
}

export async function deleteCourse(
  supabase: SupabaseClient,
  courseId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId);

  if (error) {
    console.error('Error deleting course:', error);
    return false;
  }
  return true;
}
