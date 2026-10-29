import { SupabaseClient } from '@supabase/supabase-js';
import {
  batchUpdateVocabMastery,
  batchUpdateStructureMastery,
  fetchClassHomeworkSettings,
} from '@/lib/supabase/queries/homework';
import { MasteryApplied, StructureAttemptAudit, VocabAttemptAudit } from '@/lib/types';

/**
 * Records one session's vocab + structure attempts into the learner's mastery tables.
 *
 * Attempts without a lessonId or item ID are dropped: IDs like "v1"/"s1" repeat across lessons,
 * so an attempt that can't be tied to a lesson would be written against the wrong item (or fail).
 */
export async function applySessionMastery(
  supabase: SupabaseClient,
  learnerId: string,
  classId: string,
  vocabAttempts: VocabAttemptAudit[] = [],
  structureAttempts: StructureAttemptAudit[] = [],
): Promise<MasteryApplied> {
  const vocab = vocabAttempts.filter(a => a?.lessonId && a?.vocabItemId);
  const structures = structureAttempts.filter(a => a?.lessonId && a?.structureItemId);
  const dropped = vocabAttempts.length - vocab.length + (structureAttempts.length - structures.length);
  if (dropped > 0) console.error('[applySessionMastery] Dropped', dropped, 'attempt(s) missing lessonId/itemId');

  const result: MasteryApplied = { wordsCommittedCount: 0, structuresCommittedCount: 0 };
  if (vocab.length === 0 && structures.length === 0) return result;

  const settings = await fetchClassHomeworkSettings(supabase, classId);

  if (vocab.length > 0) {
    const r = await batchUpdateVocabMastery(
      supabase, learnerId, classId,
      vocab.map(a => ({
        vocabItemId: a.vocabItemId,
        lessonId: a.lessonId,
        correct: typeof a.isCorrectWord === 'boolean'
          ? a.isCorrectWord
          : !!((a as unknown as { correct?: boolean }).correct),
        commitThreshold: settings.correctGuessesToCommit,
      })),
    );
    if (!r.ok) console.error('[applySessionMastery] Vocab mastery update failed for learner', learnerId, 'class', classId);
    result.wordsCommittedCount = r.newlyCommittedCount;
  }

  if (structures.length > 0) {
    const r = await batchUpdateStructureMastery(
      supabase, learnerId, classId,
      structures.map(a => ({
        structureItemId: a.structureItemId,
        lessonId: a.lessonId,
        correct: a.isCorrect,
        commitThreshold: settings.structureGuessesToCommit,
      })),
    );
    if (!r.ok) console.error('[applySessionMastery] Structure mastery update failed for learner', learnerId, 'class', classId);
    result.structuresCommittedCount = r.newlyCommittedCount;
  }

  return result;
}
