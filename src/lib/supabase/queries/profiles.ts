import { SupabaseClient } from '@supabase/supabase-js';
import { LearnerPreferences } from '@/lib/types';

export async function updatePreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: LearnerPreferences
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ preferences })
    .eq('id', userId);

  if (error) throw error;
}

export async function setPlacementTestDone(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ placement_test_done: true })
    .eq('id', userId);

  if (error) throw error;
}
