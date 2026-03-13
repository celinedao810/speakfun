-- Add conversation_exercise column to lesson_exercises
-- Stores the pre-generated role-play conversation for Exercise 3,
-- replacing the reading passage exercise.

ALTER TABLE lesson_exercises
  ADD COLUMN IF NOT EXISTS conversation_exercise JSONB;
