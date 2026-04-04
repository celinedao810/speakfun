import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWindowForClass } from '@/lib/homework/generateWindow';

/**
 * POST /api/admin/force-review?classId=<classId>
 *
 * One-time admin endpoint to force-generate a review session for a class,
 * regardless of the normal modulo-7 schedule. Used to recover from scheduling
 * anomalies (e.g., two sessions generated on the same day).
 *
 * Protected by CRON_SECRET.
 * Example:
 *   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
 *     "http://localhost:3000/api/admin/force-review?classId=<classId>"
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const classId = request.nextUrl.searchParams.get('classId');
  if (!classId) {
    return NextResponse.json({ error: 'Missing classId query parameter' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await generateWindowForClass(supabase, classId, { forceReview: true });

  return NextResponse.json({
    created: result.created,
    sessionNumber: result.window?.sessionNumber ?? null,
    isReviewSession: result.window?.isReviewSession ?? null,
    windowDate: result.window?.windowDate ?? null,
  });
}
