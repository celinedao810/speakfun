import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { findStructureFrame } from '@/lib/homework/structureFrame';
import {
  scoreVocabGuess,
  matchVocabFromCandidates,
  scoreStructureReading,
  scoreOwnSentence,
  scoreReadingPassage,
  scoreConversationTurn,
  scoreFreeTalk,
  generateFreeTalkTopic,
  generateAnswerGuide,
  AI_UNAVAILABLE,
} from '@/lib/services/geminiService';

// Free talk sends up to 2 minutes of audio; one Gemini pass on that takes ~15-25s, and a retry
// after a 5xx needs room too. At 60s the platform killed the request mid-retry and the learner got no score.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body;

    if (type === 'vocab-guess') {
      const { targetWord, ipa, audioBase64, timerMode } = body;
      if (!targetWord || !ipa || !audioBase64) {
        return NextResponse.json({ error: 'targetWord, ipa, and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreVocabGuess(targetWord, ipa, audioBase64, timerMode ?? false);
      return NextResponse.json(result);
    }

    if (type === 'vocab-match') {
      const { candidates, audioBase64, timerMode } = body;
      if (!Array.isArray(candidates) || candidates.length === 0 || !audioBase64) {
        return NextResponse.json({ error: 'a non-empty candidates array and audioBase64 are required' }, { status: 400 });
      }
      const result = await matchVocabFromCandidates(candidates, audioBase64, timerMode ?? false);
      return NextResponse.json(result);
    }

    if (type === 'structure-reading') {
      const { exampleSentence, audioBase64, timerMode } = body;
      if (!exampleSentence || !audioBase64) {
        return NextResponse.json({ error: 'exampleSentence and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreStructureReading(exampleSentence, audioBase64, timerMode ?? false);
      return NextResponse.json(result);
    }

    if (type === 'own-sentence') {
      const { structurePattern, audioBase64, timerMode, exampleSentence, lessonId } = body;
      if (!structurePattern || !audioBase64) {
        return NextResponse.json({ error: 'structurePattern and audioBase64 are required' }, { status: 400 });
      }
      // The frame with its [slot] brackets, so the copy check knows which words are meant to be repeated
      let frame: string | null = null;
      if (typeof lessonId === 'string' && lessonId) {
        try {
          const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          frame = await findStructureFrame(admin, lessonId, structurePattern);
        } catch (err) {
          console.error('[ai/homework-score] Frame lookup failed:', err);
        }
      }
      const result = await scoreOwnSentence(frame ?? structurePattern, audioBase64, timerMode ?? false, exampleSentence, !!frame);
      return NextResponse.json(result);
    }

    if (type === 'reading-passage') {
      const { readingPassage, vocabWords, audioBase64 } = body;
      if (!readingPassage || !audioBase64) {
        return NextResponse.json({ error: 'readingPassage and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreReadingPassage(readingPassage, vocabWords ?? [], audioBase64);
      return NextResponse.json(result);
    }

    if (type === 'conversation-turn') {
      const { targetText, hint, audioBase64 } = body;
      if (!targetText || !audioBase64) {
        return NextResponse.json({ error: 'targetText and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreConversationTurn(targetText, hint ?? '', audioBase64);
      return NextResponse.json(result);
    }

    if (type === 'free-talk') {
      const { audioBase64, vocabWords, structurePatterns, topic, deductedPointsPerError } = body;
      if (!audioBase64) {
        return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
      }
      const result = await scoreFreeTalk(audioBase64, vocabWords ?? [], structurePatterns ?? [], topic, deductedPointsPerError ?? 0.1);
      return NextResponse.json(result);
    }

    if (type === 'free-talk-topic') {
      const { vocabWords, structurePatterns, learnerRole } = body;
      const topic = await generateFreeTalkTopic(vocabWords ?? [], structurePatterns ?? [], learnerRole);
      return NextResponse.json(topic);
    }

    if (type === 'answer-guide') {
      const { topic, vocabWords, structurePatterns } = body;
      const bullets = await generateAnswerGuide(topic ?? '', vocabWords ?? [], structurePatterns ?? []);
      return NextResponse.json(bullets);
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scoring failed';
    console.error('[ai/homework-score] Error:', message);
    if (message.startsWith(AI_UNAVAILABLE)) {
      return NextResponse.json({ error: message.slice(AI_UNAVAILABLE.length + 2), code: AI_UNAVAILABLE }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
