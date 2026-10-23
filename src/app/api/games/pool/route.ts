import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { buildClassPool } from '@/lib/games/classPool';

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** One class's game pool (see buildClassPool), for the class's teacher and enrolled learners. */
export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminClient();
  const { data: cls } = await db.from('classes').select('id, name, teacher_id').eq('id', classId).maybeSingle();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  const isTeacher = cls.teacher_id === user.id;
  if (!isTeacher) {
    const { data: enrolment } = await db.from('class_enrollments').select('id')
      .eq('class_id', classId).eq('learner_id', user.id).maybeSingle();
    if (!enrolment) return NextResponse.json({ error: 'Not in this class' }, { status: 403 });
  }

  return NextResponse.json(await buildClassPool(db, cls, isTeacher));
}
