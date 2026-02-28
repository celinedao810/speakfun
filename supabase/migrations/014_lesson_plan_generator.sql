-- ============================================================================
-- Migration 014: Lesson Plan Generator
-- Run in Supabase SQL Editor
-- ============================================================================

CREATE TABLE public.generated_lesson_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    JSONB NOT NULL,   -- LessonPlanSection[] = [{id, heading, content}]
  metadata   JSONB,            -- {topic, cefrLevel, lessonFormat, learnerPersonas, otherInstructions}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.generated_lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_own_plans"
  ON public.generated_lesson_plans FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Trigger to auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_generated_lesson_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_generated_lesson_plans_updated_at
  BEFORE UPDATE ON public.generated_lesson_plans
  FOR EACH ROW EXECUTE FUNCTION update_generated_lesson_plans_updated_at();
