-- ============================================================================
-- Phase 4b: Class Scheduling
-- ============================================================================

-- 1. Add columns to existing classes table
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS schedule_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_meet_url TEXT DEFAULT '';

-- 2. Create class_sessions table
CREATE TABLE public.class_sessions (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'COMPLETED', 'CANCELLED')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies (reuse existing SECURITY DEFINER helpers from 006)
CREATE POLICY "Teachers manage sessions in own classes"
  ON public.class_sessions FOR ALL
  USING (public.is_class_teacher(class_id))
  WITH CHECK (public.is_class_teacher(class_id));

CREATE POLICY "Learners view sessions in enrolled classes"
  ON public.class_sessions FOR SELECT
  USING (public.is_enrolled_in_class(class_id));

-- 4. Trigger for updated_at
CREATE TRIGGER update_class_sessions_updated_at
  BEFORE UPDATE ON public.class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. Index for fast lookups
CREATE INDEX idx_class_sessions_class_id ON public.class_sessions(class_id);
