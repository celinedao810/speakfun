import { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'lesson-pdfs';

export async function uploadLessonPDF(
  supabase: SupabaseClient,
  courseId: string,
  lessonId: string,
  file: File
): Promise<string | null> {
  const path = `${courseId}/${lessonId}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error('Error uploading PDF:', error);
    return null;
  }
  return path;
}

export async function deleteLessonPDF(
  supabase: SupabaseClient,
  pdfPath: string
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([pdfPath]);

  if (error) {
    console.error('Error deleting PDF:', error);
    return false;
  }
  return true;
}

export function getLessonPDFUrl(
  supabase: SupabaseClient,
  pdfPath: string
): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(pdfPath);

  return data.publicUrl;
}

export async function getSignedPDFUrl(
  supabase: SupabaseClient,
  pdfPath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pdfPath, expiresIn);

  if (error) {
    console.error('Error creating signed URL:', error);
    return null;
  }
  return data.signedUrl;
}
