import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchSubmission } from '@/lib/supabase/queries/homework';
import { generateWindowForClass } from '@/lib/homework/generateWindow';

/**
 * GET /api/homework/window?classId=xxx
 *
 * Returns the current open homework window for the learner.
 * Lazily creates the next session window if none is currently open.
 * Window generation logic lives in src/lib/homework/generateWindow.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate (or fetch existing) window for this class
    const { window, courseComplete, notConfigured } = await generateWindowForClass(supabase, classId);

    // Fetch learner submission for this window
    let submission = null;
    if (window) {
      submission = await fetchSubmission(supabase, user.id, window.id);
    }

    // Fetch lesson name for regular sessions
    let lessonName: string | null = null;
    if (window?.cycleLessonId && !window.isReviewSession) {
      const { data: lesson } = await supabase
        .from('lessons')
        .select('title')
        .eq('id', window.cycleLessonId)
        .maybeSingle();
      lessonName = (lesson as { title: string } | null)?.title ?? null;
    }

    return NextResponse.json({ window, submission, lessonName, courseComplete, notConfigured });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch window';
    console.error('[homework/window] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
