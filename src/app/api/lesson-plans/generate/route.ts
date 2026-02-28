import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateLessonPlan, LessonPlanInput } from '@/lib/services/geminiService';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: LessonPlanInput = await request.json();
    const { topic, cefrLevel, lessonFormat, learnerPersonas, otherInstructions, referencePdfsBase64 } = body;

    if (!topic || !cefrLevel) {
      return NextResponse.json({ error: 'topic and cefrLevel are required' }, { status: 400 });
    }

    const result = await generateLessonPlan({
      topic,
      cefrLevel,
      lessonFormat: lessonFormat || '',
      learnerPersonas: learnerPersonas || '',
      otherInstructions: otherInstructions || '',
      referencePdfsBase64: referencePdfsBase64 || [],
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('[lesson-plans/generate] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
