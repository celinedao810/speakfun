import { SupabaseClient } from '@supabase/supabase-js';
import { LearnerProgress } from '@/lib/types';
import { insertAssignments, insertRecords } from './queries/assignments';
import { insertAchievements } from './queries/achievements';
import { insertInterviewQAs, insertInterviewSessions, insertDrillSessions, insertLiveInterviewSessions } from './queries/interview';

export async function migrateLocalStorageToSupabase(
  supabase: SupabaseClient,
  userId: string,
  localData: LearnerProgress
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update profile with preferences and placement_test_done
    if (localData.preferences || localData.placementTestDone) {
      const updates: Record<string, unknown> = {};
      if (localData.preferences) updates.preferences = localData.preferences;
      if (localData.placementTestDone) updates.placement_test_done = true;

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) console.error('Migration: profile update failed:', error);
    }

    // 2. Insert assignments (must complete before records due to FK)
    if (localData.assignments.length > 0) {
      await insertAssignments(supabase, localData.assignments, userId);

      // 3. Flatten and insert all assignment records
      const allRecords = localData.assignments.flatMap(a =>
        a.records.map(record => ({ record, assignmentId: a.id }))
      );
      if (allRecords.length > 0) {
        await insertRecords(supabase, allRecords);
      }
    }

    // 4. Insert remaining data in parallel (no FK dependencies between them)
    await Promise.all([
      insertAchievements(supabase, localData.achievements, userId),
      insertInterviewQAs(supabase, localData.interviewPrep, userId),
      insertInterviewSessions(supabase, localData.interviewSessions, userId),
      insertDrillSessions(supabase, localData.drillSessions, userId),
      insertLiveInterviewSessions(supabase, localData.liveInterviewHistory, userId),
    ]);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown migration error';
    console.error('Migration failed:', message);
    return { success: false, error: message };
  }
}
