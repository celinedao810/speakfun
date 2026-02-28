import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { chatRefineLessonPlan } from '@/lib/services/geminiService';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentSections, chatInstruction, lessonContext } = await request.json();

    if (!currentSections || !chatInstruction) {
      return NextResponse.json({ error: 'currentSections and chatInstruction are required' }, { status: 400 });
    }

    const result = await chatRefineLessonPlan(
      currentSections,
      chatInstruction,
      lessonContext || { topic: '', cefrLevel: '', lessonFormat: '' }
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat refinement failed';
    console.error('[lesson-plans/chat-refine] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
