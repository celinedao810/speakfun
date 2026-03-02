import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateVocabClues } from '@/lib/services/geminiService';
import {
  fetchExtractedContent,
  upsertLessonExercises,
} from '@/lib/supabase/queries/homework';
import { StructureExerciseItem } from '@/lib/types';
import { triggerWindowGenerationForLesson } from '@/lib/homework/scheduler';

export const maxDuration = 60; // seconds

export async function POST(request: NextRequest) {
  try {
    const { lessonId, classId } = await request.json();

    if (!lessonId || !classId) {
      return NextResponse.json(
        { error: 'lessonId and classId are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark as GENERATING
    await upsertLessonExercises(supabase, lessonId, { generationStatus: 'GENERATING' });

    // Fetch extracted content for this lesson
    const extracted = await fetchExtractedContent(supabase, lessonId);
    if (!extracted || extracted.extractionStatus !== 'DONE') {
      await upsertLessonExercises(supabase, lessonId, {
        generationStatus: 'ERROR',
        errorMessage: 'Content has not been extracted yet. Please extract content first.',
      });
      return NextResponse.json({ error: 'Content not extracted' }, { status: 400 });
    }

    // 1. Generate vocab exercise clues
    const vocabItems = await generateVocabClues(extracted.vocabulary, lessonId);

    // 2. Convert structures to exercise items
    const structureItems: StructureExerciseItem[] = extracted.structures.map(s => ({
      id: s.id,
      pattern: s.pattern,
      explanation: s.explanation,
      exampleSentence: s.exampleSentence,
      lessonId,
    }));

    // 3. Copy reading passage from extracted content
    const readingPassage = extracted.readingPassage || '';

    const now = new Date().toISOString();

    // Save exercises to DB
    await upsertLessonExercises(supabase, lessonId, {
      vocabItems,
      structureItems,
      readingPassage,
      generationStatus: 'DONE',
      generatedAt: now,
    });

    // Immediately create homework windows for all classes using this lesson (server-side, no learner action needed).
    // GET /api/homework/window still creates lazily as a fallback, but this is the primary trigger.
    triggerWindowGenerationForLesson(lessonId).catch((err) =>
      console.error('[generate-exercises] Window trigger error:', err)
    );

    return NextResponse.json({
      success: true,
      vocabCount: vocabItems.length,
      structureCount: structureItems.length,
      readingPassageLength: readingPassage.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Exercise generation failed';
    console.error('[generate-exercises] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
