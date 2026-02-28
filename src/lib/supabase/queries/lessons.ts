import { SupabaseClient } from '@supabase/supabase-js';
import { Lesson } from '@/lib/types';

export async function fetchLessons(
  supabase: SupabaseClient,
  courseId: string
): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching lessons:', error);
    return [];
  }
  return data as Lesson[];
}

export async function insertLesson(
  supabase: SupabaseClient,
  courseId: string,
  title: string,
  sortOrder: number,
  pdfPath?: string,
  pdfFileName?: string
): Promise<Lesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      course_id: courseId,
      title,
      sort_order: sortOrder,
      pdf_path: pdfPath || null,
      pdf_file_name: pdfFileName || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting lesson:', error);
    return null;
  }
  return data as Lesson;
}

export async function updateLesson(
  supabase: SupabaseClient,
  lessonId: string,
  updates: { title?: string; sort_order?: number; pdf_path?: string; pdf_file_name?: string }
): Promise<boolean> {
  const { error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId);

  if (error) {
    console.error('Error updating lesson:', error);
    return false;
  }
  return true;
}

export async function deleteLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId);

  if (error) {
    console.error('Error deleting lesson:', error);
    return false;
  }
  return true;
}

export async function reorderLessons(
  supabase: SupabaseClient,
  lessonOrders: { id: string; sort_order: number }[]
): Promise<boolean> {
  // Update each lesson's sort_order
  const updates = lessonOrders.map(({ id, sort_order }) =>
    supabase.from('lessons').update({ sort_order }).eq('id', id)
  );

  const results = await Promise.all(updates);
  const hasError = results.some(r => r.error);

  if (hasError) {
    console.error('Error reordering lessons');
    return false;
  }
  return true;
}
