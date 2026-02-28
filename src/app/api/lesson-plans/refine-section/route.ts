import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { refineLessonSection } from '@/lib/services/geminiService';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sectionHeading, currentContent, refinementInstruction, lessonContext } = await request.json();

    if (!sectionHeading || !currentContent || !refinementInstruction) {
      return NextResponse.json({ error: 'sectionHeading, currentContent, and refinementInstruction are required' }, { status: 400 });
    }

    const refined = await refineLessonSection(
      sectionHeading,
      currentContent,
      refinementInstruction,
      lessonContext || { topic: '', cefrLevel: '', lessonFormat: '' }
    );

    return NextResponse.json({ content: refined });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Refinement failed';
    console.error('[lesson-plans/refine-section] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
