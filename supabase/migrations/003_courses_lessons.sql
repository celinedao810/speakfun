-- ============================================================================
-- Phase 3: Courses & Lessons tables
-- ============================================================================

-- Courses table
CREATE TABLE public.courses (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  lesson_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Teachers can CRUD their own courses
CREATE POLICY "Teachers manage own courses"
  ON public.courses FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Learners can read courses they're enrolled in (via classes, added in Phase 4)
-- For now, allow all authenticated users to SELECT courses
CREATE POLICY "Authenticated users can view courses"
  ON public.courses FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Lessons table
CREATE TABLE public.lessons (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pdf_path TEXT, -- Supabase Storage path: {course_id}/{lesson_id}.pdf
  pdf_file_name TEXT, -- Original filename for display
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Teachers can CRUD lessons in their own courses
CREATE POLICY "Teachers manage own course lessons"
  ON public.lessons FOR ALL
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

-- Authenticated users can view lessons
CREATE POLICY "Authenticated users can view lessons"
  ON public.lessons FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Auto-update lesson_count on courses when lessons change
CREATE OR REPLACE FUNCTION public.update_course_lesson_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.courses
    SET lesson_count = (SELECT COUNT(*) FROM public.lessons WHERE course_id = OLD.course_id),
        updated_at = now()
    WHERE id = OLD.course_id;
    RETURN OLD;
  ELSE
    UPDATE public.courses
    SET lesson_count = (SELECT COUNT(*) FROM public.lessons WHERE course_id = NEW.course_id),
        updated_at = now()
    WHERE id = NEW.course_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_lesson_change
  AFTER INSERT OR DELETE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_course_lesson_count();

-- Updated_at trigger for courses
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Updated_at trigger for lessons
CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- Storage bucket for lesson PDFs
-- ============================================================================
-- NOTE: Create bucket 'lesson-pdfs' via Supabase Dashboard or CLI:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-pdfs', 'lesson-pdfs', false);
--
-- Storage policies (run in Supabase Dashboard > Storage > Policies):
--
-- 1. Teachers upload to their own courses:
--   CREATE POLICY "Teachers upload lesson PDFs"
--     ON storage.objects FOR INSERT
--     WITH CHECK (
--       bucket_id = 'lesson-pdfs'
--       AND auth.uid() IS NOT NULL
--       AND EXISTS (
--         SELECT 1 FROM public.courses
--         WHERE courses.id = (string_to_array(name, '/'))[1]
--         AND courses.teacher_id = auth.uid()
--       )
--     );
--
-- 2. Teachers delete from their own courses:
--   CREATE POLICY "Teachers delete lesson PDFs"
--     ON storage.objects FOR DELETE
--     USING (
--       bucket_id = 'lesson-pdfs'
--       AND auth.uid() IS NOT NULL
--       AND EXISTS (
--         SELECT 1 FROM public.courses
--         WHERE courses.id = (string_to_array(name, '/'))[1]
--         AND courses.teacher_id = auth.uid()
--       )
--     );
--
-- 3. Authenticated users can read:
--   CREATE POLICY "Authenticated users read lesson PDFs"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'lesson-pdfs' AND auth.uid() IS NOT NULL);
