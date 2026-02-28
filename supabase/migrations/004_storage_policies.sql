-- ============================================================================
-- Phase 3b: Storage bucket & RLS policies for lesson PDFs
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-pdfs', 'lesson-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Teachers upload PDFs to their own courses
CREATE POLICY "Teachers upload lesson PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = (string_to_array(name, '/'))[1]
      AND courses.teacher_id = auth.uid()
    )
  );

-- Teachers update PDFs (required for upsert)
CREATE POLICY "Teachers update lesson PDFs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = (string_to_array(name, '/'))[1]
      AND courses.teacher_id = auth.uid()
    )
  );

-- Teachers delete PDFs from their own courses
CREATE POLICY "Teachers delete lesson PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lesson-pdfs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = (string_to_array(name, '/'))[1]
      AND courses.teacher_id = auth.uid()
    )
  );

-- Authenticated users can read PDFs
CREATE POLICY "Authenticated users read lesson PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-pdfs' AND auth.uid() IS NOT NULL);
