import { NextRequest, NextResponse } from 'next/server';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Initialize TTS client with service account credentials
const getClient = () => {
  // For Vercel deployment, use environment variables
  if (process.env.GOOGLE_CLOUD_PRIVATE_KEY) {
    return new TextToSpeechClient({
      credentials: {
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
  }

  // For local development, use GOOGLE_APPLICATION_CREDENTIALS file
  return new TextToSpeechClient();
};

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const client = getClient();

    // Check if input is a short phonetic symbol (1-2 chars, possibly with slashes)
    const cleanText = text.trim().replace(/\//g, '');
    const isShortPhonetic = cleanText.length <= 2;

    // For short phonetic symbols, wrap in a speakable phrase
    const textToSpeak = isShortPhonetic ? `The sound ${cleanText}` : text.trim();

    const [response] = await client.synthesizeSpeech({
      input: { text: textToSpeak },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-J', // High-quality male voice for pronunciation
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
        speakingRate: 0.9, // Slightly slower for clearer pronunciation
      },
    });

    if (!response.audioContent) {
      return NextResponse.json(
        { error: 'No audio content generated' },
        { status: 500 }
      );
    }

    // Convert to base64
    const audioBuffer = response.audioContent as Buffer;
    const base64Audio = audioBuffer.toString('base64');

    return NextResponse.json({ audio: base64Audio });
  } catch (error: any) {
    console.error('TTS API Error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS generation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'TTS API is running' });
}
