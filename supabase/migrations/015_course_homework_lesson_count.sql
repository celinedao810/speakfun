-- Migration 015: Add homework_lesson_count to courses
-- Teacher-editable field: how many lessons from this course are included
-- in the homework cycle. When set, the homework system runs exactly
-- (homework_lesson_count × 3) regular sessions then one final review.
-- NULL = homework generation is blocked until the teacher sets this value.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS homework_lesson_count INTEGER NULL;
