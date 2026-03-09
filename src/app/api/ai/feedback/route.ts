import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { transcribeAudio, assessSpeech } from '@/lib/services/geminiService';

export const maxDuration = 120;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/aac': 'audio/aac',
  'audio/x-aac': 'audio/aac',
  'audio/mp4': 'audio/mp4',
  'video/mp4': 'video/mp4',
  'video/quicktime': 'video/quicktime',
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, audioBase64, mimeType, transcription, teacherComment } = body;

    const normalizedMime = ALLOWED_MIME_TYPES[mimeType];
    if (!normalizedMime) {
      return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 400 });
    }

    if (type === 'transcribe') {
      if (!audioBase64) {
        return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
      }
      const result = await transcribeAudio(audioBase64, normalizedMime);
      return NextResponse.json(result);
    }

    if (type === 'assess') {
      if (!audioBase64 || !transcription) {
        return NextResponse.json({ error: 'audioBase64 and transcription are required' }, { status: 400 });
      }
      const result = await assessSpeech(transcription, audioBase64, normalizedMime, teacherComment);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown type. Use "transcribe" or "assess".' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Feedback generation failed';
    console.error('[ai/feedback] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
