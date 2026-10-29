-- Migration 027: remember whether the most recent attempt at each item was correct, so
-- homework can bring back items the learner got wrong last time. NULL = no attempt recorded yet
-- (rows from before this migration stay NULL until practised again).
ALTER TABLE public.learner_vocab_mastery
  ADD COLUMN IF NOT EXISTS last_attempt_correct BOOLEAN;

ALTER TABLE public.learner_structure_mastery
  ADD COLUMN IF NOT EXISTS last_attempt_correct BOOLEAN;
