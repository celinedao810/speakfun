import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { exampleSentence } = await request.json() as { exampleSentence?: string };
    if (!exampleSentence?.trim()) {
      return NextResponse.json({ error: 'exampleSentence is required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate this English sentence to Vietnamese. Return ONLY the Vietnamese sentence, nothing else.\n\n"${exampleSentence.trim()}"`,
    });

    const vietnamese = response.text?.trim() ?? '';
    return NextResponse.json({ vietnamese });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Translation failed';
    console.error('[games/translate-structure] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
