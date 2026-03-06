import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchSubmission, upsertSubmission } from '@/lib/supabase/queries/homework';
import { HomeworkSessionState } from '@/lib/types';

/**
 * POST /api/homework/save-progress
 *
 * Auto-saves exercise progress during an active session.
 * Called after each exercise answer is submitted.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      windowId,
      classId,
      sessionState,
      ex1Score,
      ex2Score,
      ex3aScore,
      ex3bScore,
      ex1Completed,
      ex2Completed,
      ex3Completed,
      wrongVocabIds,
    }: {
      windowId: string;
      classId: string;
      sessionState?: HomeworkSessionState;
      ex1Score?: number;
      ex2Score?: number;
      ex3aScore?: number;
      ex3bScore?: number;
      ex1Completed?: boolean;
      ex2Completed?: boolean;
      ex3Completed?: boolean;
      wrongVocabIds?: string[];
    } = await request.json();

    if (!windowId || !classId) {
      return NextResponse.json({ error: 'windowId and classId are required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // save-progress payloads are partial, so preserve existing values to avoid
    // accidentally overwriting already-computed scores with zeros.
    const existing = await fetchSubmission(supabase, user.id, windowId);
    const e1 = ex1Score ?? existing?.ex1Score ?? 0;
    const e2 = ex2Score ?? existing?.ex2Score ?? 0;
    const e3a = ex3aScore ?? existing?.ex3aScore ?? 0;
    const e3b = ex3bScore ?? existing?.ex3bScore ?? 0;
    const total = e1 + e2 + e3a + e3b;
    const c1 = ex1Completed ?? existing?.ex1Completed ?? false;
    const c2 = ex2Completed ?? existing?.ex2Completed ?? false;
    const c3 = ex3Completed ?? existing?.ex3Completed ?? false;
    const allDone = (existing?.allCompleted ?? false) || !!(c1 && c2 && c3);

    await upsertSubmission(supabase, {
      learnerId: user.id,
      windowId,
      classId,
      ex1Score: e1,
      ex2Score: e2,
      ex3aScore: e3a,
      ex3bScore: e3b,
      totalScore: total,
      ex1Completed: c1,
      ex2Completed: c2,
      ex3Completed: c3,
      allCompleted: allDone,
      wrongVocabIds: wrongVocabIds ?? existing?.wrongVocabIds ?? [],
      sessionState: sessionState ?? existing?.sessionState ?? {},
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      submittedAt: existing?.submittedAt,
      readingMastered: existing?.readingMastered ?? false,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Save failed';
    console.error('[save-progress] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
