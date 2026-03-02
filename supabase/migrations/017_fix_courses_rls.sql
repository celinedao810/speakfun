-- Fix courses & lessons RLS policies (idempotent — safe to re-run)

-- ============================================================================
-- COURSES
-- ============================================================================
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view courses" ON public.courses;

-- Teachers can INSERT/UPDATE/DELETE their own courses
CREATE POLICY "Teachers manage own courses"
  ON public.courses FOR ALL
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- All authenticated users can read courses
CREATE POLICY "Authenticated users can view courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- LESSONS
-- ============================================================================
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own course lessons" ON public.lessons;
DROP POLICY IF EXISTS "Authenticated users can view lessons" ON public.lessons;

-- Teachers can CRUD lessons belonging to their own courses
CREATE POLICY "Teachers manage own course lessons"
  ON public.lessons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = lessons.course_id
      AND courses.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = lessons.course_id
      AND courses.teacher_id = auth.uid()
    )
  );

-- All authenticated users can read lessons
CREATE POLICY "Authenticated users can view lessons"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (true);
