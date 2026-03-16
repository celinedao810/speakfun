import { NextRequest, NextResponse } from 'next/server';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { GoogleGenAI, Type } from '@google/genai';

const getTTSClient = () => {
  if (process.env.GOOGLE_CLOUD_PRIVATE_KEY) {
    return new TextToSpeechClient({
      credentials: {
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
  }
  return new TextToSpeechClient();
};

export interface GeneratedTurn {
  speaker: string;
  text: string;
  voice: string;
}

export async function POST(request: NextRequest) {
  try {
    const { conversation, instructions, voiceMap, comment } = await request.json();

    if (!conversation?.trim()) {
      return NextResponse.json({ error: 'Conversation is required' }, { status: 400 });
    }

    // Step 1: Gemini parses and enhances the conversation
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

    const prompt = `You are an audio director for English language learning materials.

Parse this conversation and prepare each turn for realistic text-to-speech audio generation.

CONVERSATION:
${conversation}

TEACHER INSTRUCTIONS:
${instructions || 'Create a natural, realistic conversational audio.'}

${comment ? `REFINEMENT FEEDBACK (apply this to improve the result):\n${comment}\n` : ''}
AVAILABLE VOICES (en-US only):
- en-US-Neural2-J: Deep authoritative male
- en-US-Neural2-I: Friendly warm male
- en-US-Neural2-D: Casual younger male
- en-US-Studio-Q: Most natural expressive male (premium)
- en-US-Neural2-A: Clear professional female
- en-US-Neural2-C: Warm approachable female
- en-US-Neural2-F: Expressive energetic female
- en-US-Neural2-G: Natural conversational female
- en-US-Neural2-H: Bright articulate female
- en-US-Studio-O: Most natural expressive female (premium)

TEACHER VOICE OVERRIDES (always respect these, never change them): ${JSON.stringify(voiceMap || {})}

Your tasks:
1. Parse every speaker turn — preserve all text exactly as written
2. Assign a voice to each speaker that fits their role/name/personality (always use teacher overrides when provided)
3. Assign distinct voices to different speakers — no two speakers should share a voice
4. Only add natural speech fillers (uh, um) if the teacher's instructions explicitly request it
5. Return every turn in order

Return strictly valid JSON.`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            turns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING },
                  voice: { type: Type.STRING },
                },
                required: ['speaker', 'text', 'voice'],
              },
            },
          },
          required: ['turns'],
        },
      },
    });

    const parsed = JSON.parse(geminiResponse.text || '{}');
    const turns: GeneratedTurn[] = parsed.turns || [];

    if (turns.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse conversation turns. Use the format "SpeakerName: text" — one turn per line.' },
        { status: 400 }
      );
    }

    // Step 2: TTS all turns in parallel
    const ttsClient = getTTSClient();

    const audioChunks = await Promise.all(
      turns.map(async (turn) => {
        const voice = voiceMap?.[turn.speaker] || turn.voice || 'en-US-Neural2-J';
        const [res] = await ttsClient.synthesizeSpeech({
          input: { text: turn.text },
          voice: { languageCode: 'en-US', name: voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.0,
          },
        });
        return res.audioContent as Buffer | null;
      })
    );

    // Step 3: Concatenate MP3 chunks (MP3 frames are concatenation-safe)
    const validChunks = audioChunks.filter((c): c is Buffer => c !== null);
    if (validChunks.length === 0) {
      return NextResponse.json({ error: 'No audio was generated' }, { status: 500 });
    }

    const combined = Buffer.concat(validChunks);
    const base64 = combined.toString('base64');

    return NextResponse.json({
      audio: base64,
      turns: turns.map((t) => ({
        speaker: t.speaker,
        text: t.text,
        voice: voiceMap?.[t.speaker] || t.voice,
      })),
    });
  } catch (error: any) {
    console.error('TTS Conversation Error:', error);
    return NextResponse.json(
      { error: error.message || 'Audio generation failed' },
      { status: 500 }
    );
  }
}
