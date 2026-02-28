import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWindowForClass } from '@/lib/homework/generateWindow';

/**
 * GET /api/cron/homework
 *
 * Called on a schedule (every 10 min via Vercel Cron Jobs, see vercel.json).
 * Creates the next homework window for every class that has enrolled learners
 * and no currently open window.
 *
 * Protected by CRON_SECRET environment variable.
 * Locally: curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/homework
 */
export async function GET(request: NextRequest) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role client to bypass RLS — needed since there's no user session
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all distinct class IDs that have at least one enrollment
  const { data: enrollments, error } = await supabase
    .from('class_enrollments')
    .select('class_id');

  if (error) {
    console.error('[cron/homework] Failed to fetch enrollments:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const classIds = [...new Set((enrollments ?? []).map((e: { class_id: string }) => e.class_id))];

  let created = 0;
  const errors: string[] = [];

  for (const classId of classIds) {
    try {
      const result = await generateWindowForClass(supabase, classId);
      if (result.created) {
        created++;
        console.log(`[cron/homework] Created window for class ${classId} (session #${result.window?.sessionNumber})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${classId}: ${msg}`);
      console.error(`[cron/homework] Error for class ${classId}:`, msg);
    }
  }

  return NextResponse.json({
    processed: classIds.length,
    created,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
