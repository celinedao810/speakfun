-- Migration 011: Replace date-based homework windows with session-number-based system
-- Allows multiple windows per calendar day (e.g. 10-minute test sessions)
-- and tracks which lesson cycle + session-in-cycle each window belongs to.

-- 1. Drop the old UNIQUE(class_id, window_date) constraint so multiple windows per day are allowed
ALTER TABLE public.daily_homework_windows
  DROP CONSTRAINT IF EXISTS daily_homework_windows_class_id_window_date_key;

-- 2. Add session sequencing columns (nullable first so existing rows don't conflict)
ALTER TABLE public.daily_homework_windows
  ADD COLUMN IF NOT EXISTS session_number INTEGER,
  ADD COLUMN IF NOT EXISTS lesson_cycle_session INTEGER,   -- 1, 2, or 3; NULL = review session
  ADD COLUMN IF NOT EXISTS cycle_lesson_id TEXT;           -- lesson whose exercises are used; NULL = review

-- 3. Backfill session_number with sequential values per class, ordered by created_at
--    (row_number() starts at 1 per class, which is the correct sequence)
UPDATE public.daily_homework_windows w
SET session_number = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY created_at ASC) AS rn
  FROM public.daily_homework_windows
) sub
WHERE w.id = sub.id;

-- 4. Now enforce NOT NULL after backfill
ALTER TABLE public.daily_homework_windows
  ALTER COLUMN session_number SET NOT NULL,
  ALTER COLUMN session_number SET DEFAULT 1;

-- 5. Add unique constraint on (class_id, session_number)
ALTER TABLE public.daily_homework_windows
  ADD CONSTRAINT daily_homework_windows_class_session_unique
  UNIQUE (class_id, session_number);
