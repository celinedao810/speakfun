import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  scorePronunciation,
  scoreEndingSoundPronunciation,
  scoreTargetSoundPronunciation,
  evaluateLiveResponse,
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

    if (type === 'pronunciation') {
      const { targetText, audioBase64, isTongueTwister, isInterview } = body;
      if (!targetText || !audioBase64) {
        return NextResponse.json({ error: 'targetText and audioBase64 are required' }, { status: 400 });
      }
      const result = await scorePronunciation(targetText, audioBase64, isTongueTwister, isInterview);
      return NextResponse.json(result);
    }

    if (type === 'ending-sound') {
      const { targetText, audioBase64, targetSounds } = body;
      if (!targetText || !audioBase64) {
        return NextResponse.json({ error: 'targetText and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreEndingSoundPronunciation(targetText, audioBase64, targetSounds ?? []);
      return NextResponse.json(result);
    }

    if (type === 'target-sound') {
      const { targetText, targetSound, targetSoundSymbol, audioBase64 } = body;
      if (!targetText || !targetSound || !targetSoundSymbol || !audioBase64) {
        return NextResponse.json({ error: 'targetText, targetSound, targetSoundSymbol, and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreTargetSoundPronunciation(targetText, targetSound, targetSoundSymbol, audioBase64);
      return NextResponse.json(result);
    }

    if (type === 'live-response') {
      const { question, audioBase64 } = body;
      if (!question || !audioBase64) {
        return NextResponse.json({ error: 'question and audioBase64 are required' }, { status: 400 });
      }
      const result = await evaluateLiveResponse(question, audioBase64);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scoring failed';
    console.error('[ai/score] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
