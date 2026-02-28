import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchClassHomeworkSettings } from '@/lib/supabase/queries/homework';

/**
 * GET /api/homework/settings?classId=xxx
 *
 * Returns homework settings for a class (with defaults if not configured).
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

    const settings = await fetchClassHomeworkSettings(supabase, classId);
    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch settings';
    console.error('[homework/settings] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
