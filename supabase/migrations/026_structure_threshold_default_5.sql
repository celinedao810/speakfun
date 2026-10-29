-- Migration 026: structures are mastered after 5 correct guesses (was 10).
-- Teachers can still change this per class in Homework Settings.
ALTER TABLE public.class_homework_settings
  ALTER COLUMN structure_guesses_to_commit SET DEFAULT 5;

-- Move classes still on the old default (10) to 5; leave any class a teacher customised.
UPDATE public.class_homework_settings
  SET structure_guesses_to_commit = 5
  WHERE structure_guesses_to_commit = 10;
