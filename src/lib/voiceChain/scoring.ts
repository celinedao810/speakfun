import { GoogleGenAI, Type } from '@google/genai';
import { CRITERION_MAX } from './config';
import type { ScoreBreakdown, VoiceChainFeedback } from './types';

export interface VoiceScoringResult {
  transcript: string;
  inappropriate: boolean;
  scores: ScoreBreakdown;
  feedback: VoiceChainFeedback;
}

interface ScoreVoiceMessageInput {
  audioBase64: string;
  mimeType: string;
  /** Transcript of the message being answered (replies only). */
  previousTranscript?: string | null;
  /** Letter the reply had to start with (replies only). */
  requiredLetter?: string | null;
}

/** Retries rate-limit and server errors with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      const msg = err?.message || '';
      const retryable = err?.status === 429 || (err?.status ?? 0) >= 500 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      if (!retryable || i >= maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/** Snaps to 0, 0.5 or 1. */
function clampScore(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(CRITERION_MAX, Math.round(v * 2) / 2));
}

function buildPrompt(previousTranscript?: string | null, requiredLetter?: string | null): string {
  const context = previousTranscript
    ? `This recording is a REPLY in the chain. The previous player said:
"""${previousTranscript}"""
The reply was supposed to start with a word beginning with the letter "${(requiredLetter || '').toUpperCase()}" and continue the topic or story of the previous message, like a natural conversation.`
    : `This recording STARTS a new chain. There is no previous message; judge coherence only within the recording.`;

  return `You are a fair, encouraging English speaking examiner for adult learners (roughly A2–C1) playing "Voice Chain": a spoken word-chain game where each player records up to 45 seconds and the next player must answer straight away.

${context}

Do these steps:
1. transcript: transcribe exactly what was said. Write numbers as words ("five", not "5"). Keep hesitation sounds (um, uh, er) where they occur. Do not correct grammar.
2. inappropriate: true ONLY if the recording contains hate speech, harassment, sexual content, threats, or personal contact details (phone number, email, home address, social media handle). Otherwise false.
3. Score each criterion as exactly 0, 0.5 or 1:
   - 1 = good for this skill (roughly B2 or better): clear, with only minor slips.
   - 0.5 = OK: understandable, but with noticeable problems.
   - 0 = weak: hard to follow, many errors, or very little usable speech.
   Criteria:
   - coherence: ideas are logically connected and easy to follow${previousTranscript ? '; the reply clearly follows on from the previous message (an off-topic reply scores 0)' : ''}.
   - grammar: accuracy of tenses, agreement, articles, word order. Minor slips cost little; errors that confuse meaning cost more.
   - wordChoice: range and appropriateness of vocabulary and collocations for the situation.
   - fluency: smooth delivery at a natural pace with few or short pauses. Long silences (over 2 seconds) lower the score. Under 20 seconds of real speech scores at most 0.5.
   - pronunciation: clear ending sounds (final consonants such as -s, -ed, -t, -k, -d), intelligibility and word stress. Do not penalise a natural accent that is easy to understand.
4. feedback: one short, specific sentence in English per criterion (max 25 words each), quoting the learner's own words where useful. Plus "tip": one practical thing to try next time.
5. endingSoundIssues: the words (max 6) where the learner dropped or blurred the final sound. Empty array if none.`;
}

export async function scoreVoiceMessage({
  audioBase64,
  mimeType,
  previousTranscript,
  requiredLetter,
}: ScoreVoiceMessageInput): Promise<VoiceScoringResult> {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    const feedbackLine = { type: Type.STRING };
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: buildPrompt(previousTranscript, requiredLetter) },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            inappropriate: { type: Type.BOOLEAN },
            scores: {
              type: Type.OBJECT,
              properties: {
                coherence: { type: Type.NUMBER },
                grammar: { type: Type.NUMBER },
                wordChoice: { type: Type.NUMBER },
                fluency: { type: Type.NUMBER },
                pronunciation: { type: Type.NUMBER },
              },
              required: ['coherence', 'grammar', 'wordChoice', 'fluency', 'pronunciation'],
            },
            feedback: {
              type: Type.OBJECT,
              properties: {
                coherence: feedbackLine,
                grammar: feedbackLine,
                wordChoice: feedbackLine,
                fluency: feedbackLine,
                pronunciation: feedbackLine,
                tip: feedbackLine,
              },
              required: ['coherence', 'grammar', 'wordChoice', 'fluency', 'pronunciation', 'tip'],
            },
            endingSoundIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['transcript', 'inappropriate', 'scores', 'feedback', 'endingSoundIssues'],
        },
      },
    });

    const raw = JSON.parse(response.text || '{}');
    const s = raw.scores || {};
    const f = raw.feedback || {};
    return {
      transcript: String(raw.transcript || '').trim(),
      inappropriate: raw.inappropriate === true,
      scores: {
        coherence: clampScore(s.coherence),
        grammar: clampScore(s.grammar),
        wordChoice: clampScore(s.wordChoice),
        fluency: clampScore(s.fluency),
        pronunciation: clampScore(s.pronunciation),
      },
      feedback: {
        coherence: String(f.coherence || ''),
        grammar: String(f.grammar || ''),
        wordChoice: String(f.wordChoice || ''),
        fluency: String(f.fluency || ''),
        pronunciation: String(f.pronunciation || ''),
        tip: String(f.tip || ''),
        endingSoundIssues: Array.isArray(raw.endingSoundIssues) ? raw.endingSoundIssues.map(String).slice(0, 6) : [],
      },
    };
  });
}
