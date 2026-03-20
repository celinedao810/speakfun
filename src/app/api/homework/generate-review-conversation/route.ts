import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateReviewConversationExercise } from '@/lib/services/geminiService';
import { StructureExerciseItem } from '@/lib/types';

/**
 * POST /api/homework/generate-review-conversation
 *
 * Dynamically generates a 10-learner-turn IT-context conversation for a review session.
 * Called at session load time when no cached conversation is found in sessionState.
 *
 * Body: { structureItems: StructureExerciseItem[] }  (up to 10 items)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { structureItems }: { structureItems: StructureExerciseItem[] } = await request.json();

    if (!structureItems || structureItems.length === 0) {
      return NextResponse.json({ error: 'structureItems is required' }, { status: 400 });
    }

    const conversation = await generateReviewConversationExercise(structureItems);
    return NextResponse.json(conversation);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate review conversation';
    console.error('[generate-review-conversation] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
