import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { extractLessonContent } from '@/lib/services/geminiService';
import { upsertExtractedContent } from '@/lib/supabase/queries/homework';

// Admin Supabase client for direct storage access (bypasses RLS for PDF download)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const { lessonId, pdfPath, lessonTitle } = await request.json();

    if (!lessonId || !pdfPath) {
      return NextResponse.json({ error: 'lessonId and pdfPath are required' }, { status: 400 });
    }

    // Verify the requesting user is a teacher with access to this lesson
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark as EXTRACTING in DB so teacher sees loading state
    await upsertExtractedContent(supabase, lessonId, { extractionStatus: 'EXTRACTING' });

    // Download PDF from Supabase Storage using admin client (avoids signed URL expiry race)
    const adminSupabase = getAdminClient();
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from('lesson-pdfs')
      .download(pdfPath);

    if (downloadError || !fileData) {
      await upsertExtractedContent(supabase, lessonId, {
        extractionStatus: 'ERROR',
        errorMessage: `Failed to download PDF: ${downloadError?.message || 'Unknown error'}`,
      });
      return NextResponse.json({ error: 'Failed to download PDF' }, { status: 500 });
    }

    // Convert Blob to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBase64 = Buffer.from(arrayBuffer).toString('base64');

    // Call Gemini to extract content from PDF
    const extracted = await extractLessonContent(pdfBase64, lessonTitle || 'Lesson');

    // Save to DB
    const now = new Date().toISOString();
    await upsertExtractedContent(supabase, lessonId, {
      vocabulary: extracted.vocabulary,
      structures: extracted.structures,
      readingPassage: extracted.readingPassage,
      extractionStatus: 'DONE',
      extractedAt: now,
    });

    return NextResponse.json({
      success: true,
      vocabulary: extracted.vocabulary,
      structures: extracted.structures,
      readingPassage: extracted.readingPassage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    console.error('[extract-lesson] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
