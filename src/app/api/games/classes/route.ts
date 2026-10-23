import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export interface GameClass { id: string; name: string; role: 'teacher' | 'learner' }

/** Classes the signed-in user can play games for: classes they teach, then classes they're enrolled in. */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: taught }, { data: enrolled }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('teacher_id', user.id).order('created_at', { ascending: false }),
    supabase.from('class_enrollments').select('class_id, classes(name)').eq('learner_id', user.id).order('enrolled_at', { ascending: false }),
  ]);

  const classes: GameClass[] = [
    ...(taught ?? []).map(c => ({ id: c.id as string, name: c.name as string, role: 'teacher' as const })),
    ...(enrolled ?? []).map(e => ({
      id: e.class_id as string,
      name: ((e.classes as unknown as { name?: string } | null)?.name) || 'Class',
      role: 'learner' as const,
    })),
  ];
  return NextResponse.json({ classes });
}
