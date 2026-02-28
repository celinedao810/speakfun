-- Migration 010: Add reading passage to extraction/exercises, reading tracking to windows/submissions

-- Add reading passage to content extraction table
ALTER TABLE public.lesson_extracted_content
  ADD COLUMN IF NOT EXISTS reading_passage TEXT NOT NULL DEFAULT '';

-- Add reading passage to exercises table
ALTER TABLE public.lesson_exercises
  ADD COLUMN IF NOT EXISTS reading_passage TEXT NOT NULL DEFAULT '';

-- Track which lesson's reading passage is pending for a homework window
-- NULL means no reading exercise this session (mastered or not yet available)
ALTER TABLE public.daily_homework_windows
  ADD COLUMN IF NOT EXISTS pending_reading_lesson_id TEXT;

-- Track whether the learner mastered the reading (for next-day carry-forward logic)
-- TRUE = mastered (scored >= 20 + vocabCount), next day skips reading until new lesson
ALTER TABLE public.daily_homework_submissions
  ADD COLUMN IF NOT EXISTS reading_mastered BOOLEAN NOT NULL DEFAULT FALSE;
