import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  generateInterviewQuestions,
  polishInterviewAnswer,
  getAISuggestion,
  fixUserQuestions,
} from '@/lib/services/geminiService';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body;

    if (type === 'generate-questions') {
      const { role, seniority, industry, questionType, jd, samples } = body;
      if (!role || !industry) {
        return NextResponse.json({ error: 'role and industry are required' }, { status: 400 });
      }
      const result = await generateInterviewQuestions(role, seniority, industry, questionType, jd ?? '', samples ?? '');
      return NextResponse.json(result);
    }

    if (type === 'polish-answer') {
      const { q, raw, role, seniority, level, instructions, cv } = body;
      if (!q || !raw || !role) {
        return NextResponse.json({ error: 'q, raw, and role are required' }, { status: 400 });
      }
      const result = await polishInterviewAnswer(q, raw, role, seniority, level ?? '', instructions ?? '', cv ?? '');
      return NextResponse.json(result);
    }

    if (type === 'ai-suggestion') {
      const { q, role, seniority, level, cv, jd } = body;
      if (!q || !role) {
        return NextResponse.json({ error: 'q and role are required' }, { status: 400 });
      }
      const result = await getAISuggestion(q, role, seniority, level ?? '', cv ?? '', jd ?? '');
      return NextResponse.json(result);
    }

    if (type === 'fix-questions') {
      const { rawInput } = body;
      if (!rawInput) {
        return NextResponse.json({ error: 'rawInput is required' }, { status: 400 });
      }
      const result = await fixUserQuestions(rawInput);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Interview operation failed';
    console.error('[ai/interview] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
