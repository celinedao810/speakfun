-- Fix vocab mastery unique constraint to include lesson_id.
-- Vocab IDs are generated per-lesson as "v1", "v2", etc. by Gemini,
-- so they are NOT globally unique — "v1" in Lesson 1 is a different word
-- from "v1" in Lesson 4. The old constraint (learner_id, class_id, vocab_item_id)
-- causes collisions across lessons, corrupting mastery data.

-- Drop the old constraint
ALTER TABLE public.learner_vocab_mastery
  DROP CONSTRAINT IF EXISTS learner_vocab_mastery_learner_id_class_id_vocab_item_id_key;

-- Add new constraint that scopes uniqueness per lesson
ALTER TABLE public.learner_vocab_mastery
  ADD CONSTRAINT learner_vocab_mastery_learner_class_lesson_vocab_key
  UNIQUE (learner_id, class_id, lesson_id, vocab_item_id);
