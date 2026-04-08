import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  scoreVocabGuess,
  scoreStructureReading,
  scoreOwnSentence,
  scoreReadingPassage,
  scoreConversationTurn,
  scoreFreeTalk,
  generateFreeTalkTopic,
  generateAnswerGuide,
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

    if (type === 'vocab-guess') {
      const { targetWord, ipa, audioBase64, timerMode } = body;
      if (!targetWord || !ipa || !audioBase64) {
        return NextResponse.json({ error: 'targetWord, ipa, and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreVocabGuess(targetWord, ipa, audioBase64, timerMode ?? false);
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
      const { structurePattern, audioBase64, timerMode, exampleSentence } = body;
      if (!structurePattern || !audioBase64) {
        return NextResponse.json({ error: 'structurePattern and audioBase64 are required' }, { status: 400 });
      }
      const result = await scoreOwnSentence(structurePattern, audioBase64, timerMode ?? false, exampleSentence);
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
      const { audioBase64, vocabWords, structurePatterns, topic } = body;
      if (!audioBase64) {
        return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
      }
      const result = await scoreFreeTalk(audioBase64, vocabWords ?? [], structurePatterns ?? [], topic);
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
