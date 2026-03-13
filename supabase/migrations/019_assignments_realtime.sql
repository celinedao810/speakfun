-- Enable Supabase Realtime for the assignments table
-- Required so learners receive live updates when a teacher assigns a new phoneme

ALTER TABLE public.assignments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
  END IF;
END $$;

-- Add conversation_exercise column to lesson_exercises
-- Stores the pre-generated role-play conversation for Exercise 3,
-- replacing the reading passage exercise.

ALTER TABLE lesson_exercises
  ADD COLUMN IF NOT EXISTS conversation_exercise JSONB;
