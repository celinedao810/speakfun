-- Migration 022: Add homework_end_date to class_homework_settings
-- Teachers can set an end date for the session chain; generation stops after this date.

ALTER TABLE class_homework_settings
  ADD COLUMN IF NOT EXISTS homework_end_date DATE DEFAULT NULL;
