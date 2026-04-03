import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchOpenWindow, fetchSubmission } from '@/lib/supabase/queries/homework';

/**
 * GET /api/homework/window?classId=xxx
 *
 * Read-only: returns the current open homework window for the learner.
 * Windows are created only by:
 *   1. generate-exercises route (first session, immediately after teacher generates exercises)
 *   2. Cron job at 23:00 UTC / 6:00am UTC+7 daily
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

    // Use service role to bypass RLS for reliable window read
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const window = await fetchOpenWindow(serviceSupabase, classId);

    // Fetch learner submission for this window (learner-scoped client)
    let submission = null;
    if (window) {
      submission = await fetchSubmission(supabase, user.id, window.id);
    }

    // Lightweight course status check: complete if today > homework_end_date
    let courseComplete = false;
    const notConfigured = false;
    if (!window) {
      const { data: settingsRow } = await serviceSupabase
        .from('class_homework_settings')
        .select('homework_end_date')
        .eq('class_id', classId)
        .maybeSingle();
      const endDate: string | null = (settingsRow as { homework_end_date: string | null } | null)?.homework_end_date ?? null;
      if (endDate) {
        const UTC7_OFFSET = 7 * 60 * 60 * 1000;
        const nowUtc7 = new Date(Date.now() + UTC7_OFFSET);
        const today = `${nowUtc7.getUTCFullYear()}-${String(nowUtc7.getUTCMonth() + 1).padStart(2, '0')}-${String(nowUtc7.getUTCDate()).padStart(2, '0')}`;
        courseComplete = today > endDate;
      }
    }

    // Fetch lesson name for regular sessions
    let lessonName: string | null = null;
    if (window?.cycleLessonId && !window.isReviewSession) {
      const { data: lesson } = await serviceSupabase
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
