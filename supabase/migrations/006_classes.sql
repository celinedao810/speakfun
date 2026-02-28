-- ============================================================================
-- Phase 4: Class Management
-- ============================================================================

-- 1. Create all tables first
-- ============================================================================

CREATE TABLE public.classes (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  class_code TEXT UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 6)),
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_enrollments (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, learner_id)
);

ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_courses (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, course_id)
);

ALTER TABLE public.class_courses ENABLE ROW LEVEL SECURITY;

-- 2. Helper functions (SECURITY DEFINER bypasses RLS, breaking recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(p_class_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = p_class_id AND learner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. RLS policies
-- ============================================================================

-- Classes policies
CREATE POLICY "Teachers manage own classes"
  ON public.classes FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Learners view enrolled classes"
  ON public.classes FOR SELECT
  USING (public.is_enrolled_in_class(id));

-- Enrollment policies
CREATE POLICY "Teachers manage enrollments in own classes"
  ON public.class_enrollments FOR ALL
  USING (public.is_class_teacher(class_id))
  WITH CHECK (public.is_class_teacher(class_id));

CREATE POLICY "Learners view own enrollments"
  ON public.class_enrollments FOR SELECT
  USING (auth.uid() = learner_id);

CREATE POLICY "Learners join classes"
  ON public.class_enrollments FOR INSERT
  WITH CHECK (auth.uid() = learner_id);

-- Class courses policies
CREATE POLICY "Teachers manage course assignments in own classes"
  ON public.class_courses FOR ALL
  USING (public.is_class_teacher(class_id))
  WITH CHECK (public.is_class_teacher(class_id));

CREATE POLICY "Learners view assigned courses"
  ON public.class_courses FOR SELECT
  USING (public.is_enrolled_in_class(class_id));

-- 4. Triggers
-- ============================================================================

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.update_class_student_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.classes
    SET student_count = (
      SELECT COUNT(*) FROM public.class_enrollments WHERE class_id = OLD.class_id
    ), updated_at = now()
    WHERE id = OLD.class_id;
    RETURN OLD;
  ELSE
    UPDATE public.classes
    SET student_count = (
      SELECT COUNT(*) FROM public.class_enrollments WHERE class_id = NEW.class_id
    ), updated_at = now()
    WHERE id = NEW.class_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_enrollment_change
  AFTER INSERT OR DELETE ON public.class_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_class_student_count();
