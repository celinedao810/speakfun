-- Migration 021: Structure mastery tracking
-- Tracks how many times a learner has correctly used each grammar structure
-- in conversation exercises (both regular and review sessions).
-- Mirrors learner_vocab_mastery. Structure IDs ("s1", "s2", etc.) are
-- reused across lessons, so the compound key (lesson_id + structure_item_id)
-- is required.

CREATE TABLE IF NOT EXISTS learner_structure_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  structure_item_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  is_committed BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, class_id, lesson_id, structure_item_id)
);

ALTER TABLE learner_structure_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learner owns their structure mastery"
  ON learner_structure_mastery
  FOR ALL
  USING (learner_id = auth.uid());

-- Add structureGuessesToCommit to class_homework_settings
ALTER TABLE class_homework_settings
  ADD COLUMN IF NOT EXISTS structure_guesses_to_commit INTEGER NOT NULL DEFAULT 10;
