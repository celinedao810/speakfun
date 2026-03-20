-- Migration 021: Structure mastery tracking
-- Tracks how many times a learner has correctly used each grammar structure
-- in conversation exercises (both regular and review sessions).
-- Mirrors learner_vocab_mastery. Structure IDs ("s1", "s2", etc.) are
-- reused across lessons, so the compound key (lesson_id + structure_item_id)
-- is required.
-- Note: class_id and lesson_id are plain TEXT (no FK) to avoid type-mismatch
-- issues across environments; referential integrity is enforced by app logic.

CREATE TABLE IF NOT EXISTS public.learner_structure_mastery (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  structure_item_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  is_committed BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (learner_id, class_id, lesson_id, structure_item_id)
);

ALTER TABLE public.learner_structure_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage own structure mastery"
  ON public.learner_structure_mastery FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Add structureGuessesToCommit to class_homework_settings
ALTER TABLE public.class_homework_settings
  ADD COLUMN IF NOT EXISTS structure_guesses_to_commit INTEGER NOT NULL DEFAULT 10;
