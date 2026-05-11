import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { mimeType, fileName, fileSize } = await request.json();
    if (!mimeType || !fileSize) {
      return NextResponse.json({ error: 'mimeType and fileSize are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });

    // Initiate a resumable upload session with Gemini Files API
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
        },
        body: JSON.stringify({ file: { display_name: fileName || 'recording' } }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      console.error('[init-upload] Gemini init failed:', err);
      return NextResponse.json({ error: 'Failed to initiate upload session' }, { status: 502 });
    }

    const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) {
      return NextResponse.json({ error: 'No upload URL returned by Gemini' }, { status: 502 });
    }

    return NextResponse.json({ uploadUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    console.error('[init-upload] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
