-- Migration 013: Add homework_restarted_at to class_homework_settings
-- Allows teachers to restart homework generation after the course auto-stops
-- (triggered when 2 consecutive review sessions are detected at the end of the window history).

ALTER TABLE class_homework_settings
  ADD COLUMN IF NOT EXISTS homework_restarted_at TIMESTAMPTZ NULL DEFAULT NULL;
