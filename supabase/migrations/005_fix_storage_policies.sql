-- ============================================================================
-- Fix: Use SECURITY DEFINER function for storage policy course ownership check
-- The direct EXISTS query from storage.objects RLS cannot access public.courses
-- due to cross-table RLS evaluation.
-- ============================================================================

-- Helper function to check course ownership
-- SECURITY DEFINER bypasses RLS on public.courses when called from storage policies
CREATE OR REPLACE FUNCTION public.is_course_owner(course_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = course_id
    AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Replace storage policies to use the helper function
DROP POLICY IF EXISTS "Teachers upload lesson PDFs" ON storage.objects;
CREATE POLICY "Teachers upload lesson PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND public.is_course_owner((string_to_array(name, '/'))[1])
  );

DROP POLICY IF EXISTS "Teachers update lesson PDFs" ON storage.objects;
CREATE POLICY "Teachers update lesson PDFs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND public.is_course_owner((string_to_array(name, '/'))[1])
  );

DROP POLICY IF EXISTS "Teachers delete lesson PDFs" ON storage.objects;
CREATE POLICY "Teachers delete lesson PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND public.is_course_owner((string_to_array(name, '/'))[1])
  );
