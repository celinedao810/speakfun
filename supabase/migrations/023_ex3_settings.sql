-- Add Ex3 duration and error deduction settings to class_homework_settings

ALTER TABLE class_homework_settings
  ADD COLUMN IF NOT EXISTS ex3_duration_mins         integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ex3_deducted_points_per_error numeric(4,2) NOT NULL DEFAULT 0.10;
