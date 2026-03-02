import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  generatePlacementSentences,
  analyzePlacementDiagnostic,
  generateDailyPack,
  generateEndingSoundPack,
  generateLinkingSoundPack,
  generateSoundDrillPack,
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

    if (type === 'placement-sentences') {
      const { industry, role } = body;
      if (!industry || !role) {
        return NextResponse.json({ error: 'industry and role are required' }, { status: 400 });
      }
      const result = await generatePlacementSentences(industry, role);
      return NextResponse.json(result);
    }

    if (type === 'placement-diagnostic') {
      const { sentences, audioBlobs } = body;
      if (!sentences || !audioBlobs) {
        return NextResponse.json({ error: 'sentences and audioBlobs are required' }, { status: 400 });
      }
      const result = await analyzePlacementDiagnostic(sentences, audioBlobs);
      return NextResponse.json(result);
    }

    if (type === 'daily-pack') {
      const { symbol, day, prefs } = body;
      if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
      }
      const result = await generateDailyPack(symbol, day ?? 1, prefs);
      return NextResponse.json(result);
    }

    if (type === 'ending-sound-pack') {
      const { patternGroup, prefs } = body;
      if (!patternGroup) {
        return NextResponse.json({ error: 'patternGroup is required' }, { status: 400 });
      }
      const result = await generateEndingSoundPack(patternGroup, prefs);
      return NextResponse.json(result);
    }

    if (type === 'linking-sound-pack') {
      const { prefs } = body;
      const result = await generateLinkingSoundPack(prefs);
      return NextResponse.json(result);
    }

    if (type === 'sound-drill-pack') {
      const { soundSymbol, soundDescription, industry, role } = body;
      if (!soundSymbol || !soundDescription) {
        return NextResponse.json({ error: 'soundSymbol and soundDescription are required' }, { status: 400 });
      }
      const result = await generateSoundDrillPack(soundSymbol, soundDescription, industry, role);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('[ai/generate] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
