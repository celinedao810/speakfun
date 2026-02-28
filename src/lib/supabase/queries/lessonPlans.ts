import { SupabaseClient } from '@supabase/supabase-js';
import { GeneratedLessonPlan, LessonPlanSection, LessonPlanMetadata } from '@/lib/types';

export async function fetchLessonPlans(
  supabase: SupabaseClient,
  teacherId: string
): Promise<GeneratedLessonPlan[]> {
  const { data, error } = await supabase
    .from('generated_lesson_plans')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching lesson plans:', error);
    return [];
  }
  return data as GeneratedLessonPlan[];
}

export async function insertLessonPlan(
  supabase: SupabaseClient,
  teacherId: string,
  title: string,
  content: LessonPlanSection[],
  metadata: LessonPlanMetadata
): Promise<GeneratedLessonPlan | null> {
  const { data, error } = await supabase
    .from('generated_lesson_plans')
    .insert({ teacher_id: teacherId, title, content, metadata })
    .select()
    .single();

  if (error) {
    console.error('Error inserting lesson plan:', error);
    return null;
  }
  return data as GeneratedLessonPlan;
}

export async function updateLessonPlan(
  supabase: SupabaseClient,
  planId: string,
  title: string,
  content: LessonPlanSection[],
  metadata: LessonPlanMetadata
): Promise<boolean> {
  const { error } = await supabase
    .from('generated_lesson_plans')
    .update({ title, content, metadata })
    .eq('id', planId);

  if (error) {
    console.error('Error updating lesson plan:', error);
    return false;
  }
  return true;
}

export async function deleteLessonPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('generated_lesson_plans')
    .delete()
    .eq('id', planId);

  if (error) {
    console.error('Error deleting lesson plan:', error);
    return false;
  }
  return true;
}
