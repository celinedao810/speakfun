import { SupabaseClient } from '@supabase/supabase-js';
import { Achievement } from '@/lib/types';

export async function fetchAchievements(
  supabase: SupabaseClient,
  learnerId: string
): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('learner_id', learnerId)
    .order('date_earned', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    soundSymbol: row.sound_symbol,
    dateEarned: row.date_earned,
  }));
}

export async function insertAchievement(
  supabase: SupabaseClient,
  achievement: Achievement,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('achievements')
    .upsert(
      {
        id: achievement.id,
        learner_id: learnerId,
        sound_symbol: achievement.soundSymbol,
        date_earned: achievement.dateEarned,
      },
      { onConflict: 'learner_id,sound_symbol' }
    );

  if (error) throw error;
}

export async function insertAchievements(
  supabase: SupabaseClient,
  achievements: Achievement[],
  learnerId: string
): Promise<void> {
  if (achievements.length === 0) return;

  const rows = achievements.map(a => ({
    id: a.id,
    learner_id: learnerId,
    sound_symbol: a.soundSymbol,
    date_earned: a.dateEarned,
  }));

  const { error } = await supabase
    .from('achievements')
    .upsert(rows, { onConflict: 'learner_id,sound_symbol' });

  if (error) throw error;
}
