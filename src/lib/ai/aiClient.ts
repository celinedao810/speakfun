// Client-side AI wrapper — calls Next.js API routes, never the Gemini SDK directly.
// Import this in "use client" components instead of @/lib/services/geminiService.

import type {
  PlacementSentence, DiagnosticResult, SoundDrillPack, TargetSoundResult,
  VocabScoringResult, StructureScoringResult, ReadingScoringResult, ConversationTurnScoringResult,
  FreeTalkScoringResult,
} from '@/lib/types';
import type {
  PronunciationResult, LiveEvaluationResult, AISuggestion,
} from '@/lib/services/geminiService';

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Score ───────────────────────────────────────────────────────────────────

export const scorePronunciation = (
  targetText: string,
  audioBase64: string,
  isTongueTwister?: boolean,
  isInterview?: boolean,
): Promise<PronunciationResult> =>
  post('/api/ai/score', { type: 'pronunciation', targetText, audioBase64, isTongueTwister, isInterview });

export const scoreEndingSoundPronunciation = (
  targetText: string,
  audioBase64: string,
  targetSounds: string[],
): Promise<PronunciationResult> =>
  post('/api/ai/score', { type: 'ending-sound', targetText, audioBase64, targetSounds });

export const scoreTargetSoundPronunciation = (
  targetText: string,
  targetSound: string,
  targetSoundSymbol: string,
  audioBase64: string,
): Promise<TargetSoundResult> =>
  post('/api/ai/score', { type: 'target-sound', targetText, targetSound, targetSoundSymbol, audioBase64 });

export const evaluateLiveResponse = (
  question: string,
  audioBase64: string,
): Promise<LiveEvaluationResult> =>
  post('/api/ai/score', { type: 'live-response', question, audioBase64 });

// ── Generate ────────────────────────────────────────────────────────────────

export const generatePlacementSentences = (
  industry: string,
  role: string,
): Promise<PlacementSentence[]> =>
  post('/api/ai/generate', { type: 'placement-sentences', industry, role });

export const analyzePlacementDiagnostic = (
  sentences: string[],
  audioBlobs: string[],
): Promise<DiagnosticResult> =>
  post('/api/ai/generate', { type: 'placement-diagnostic', sentences, audioBlobs });

export const generateDailyPack = (
  symbol: string,
  day: number,
  prefs?: any,
): Promise<any> =>
  post('/api/ai/generate', { type: 'daily-pack', symbol, day, prefs });

export const generateEndingSoundPack = (
  patternGroup: string,
  prefs?: any,
): Promise<any> =>
  post('/api/ai/generate', { type: 'ending-sound-pack', patternGroup, prefs });

export const generateLinkingSoundPack = (
  prefs?: any,
): Promise<any> =>
  post('/api/ai/generate', { type: 'linking-sound-pack', prefs });

export const generateSoundDrillPack = (
  soundSymbol: string,
  soundDescription: string,
  industry?: string,
  role?: string,
): Promise<SoundDrillPack> =>
  post('/api/ai/generate', { type: 'sound-drill-pack', soundSymbol, soundDescription, industry, role });

// ── Interview ───────────────────────────────────────────────────────────────

export const generateInterviewQuestions = (
  role: string,
  seniority: any,
  industry: string,
  type: any,
  jd: string,
  samples: string,
): Promise<string[]> =>
  post('/api/ai/interview', { type: 'generate-questions', role, seniority, industry, questionType: type, jd, samples });

export const polishInterviewAnswer = (
  q: string,
  raw: string,
  role: string,
  seniority: any,
  level: string,
  instructions: string,
  cv: string,
): Promise<string> =>
  post('/api/ai/interview', { type: 'polish-answer', q, raw, role, seniority, level, instructions, cv });

export const getAISuggestion = (
  q: string,
  role: string,
  seniority: any,
  level: string,
  cv: string,
  jd: string,
): Promise<AISuggestion> =>
  post('/api/ai/interview', { type: 'ai-suggestion', q, role, seniority, level, cv, jd });

export const fixUserQuestions = (rawInput: string): Promise<string[]> =>
  post('/api/ai/interview', { type: 'fix-questions', rawInput });

// ── Homework score ──────────────────────────────────────────────────────────

export const scoreVocabGuess = (
  targetWord: string,
  ipa: string,
  audioBase64: string,
  timerMode: boolean,
): Promise<VocabScoringResult> =>
  post('/api/ai/homework-score', { type: 'vocab-guess', targetWord, ipa, audioBase64, timerMode });

export const scoreStructureReading = (
  exampleSentence: string,
  audioBase64: string,
  timerMode: boolean,
): Promise<StructureScoringResult> =>
  post('/api/ai/homework-score', { type: 'structure-reading', exampleSentence, audioBase64, timerMode });

export const scoreOwnSentence = (
  structurePattern: string,
  audioBase64: string,
  timerMode: boolean,
  exampleSentence?: string,
): Promise<StructureScoringResult> =>
  post('/api/ai/homework-score', { type: 'own-sentence', structurePattern, audioBase64, timerMode, exampleSentence });

export const scoreReadingPassage = (
  readingPassage: string,
  vocabWords: string[],
  audioBase64: string,
): Promise<ReadingScoringResult> =>
  post('/api/ai/homework-score', { type: 'reading-passage', readingPassage, vocabWords, audioBase64 });

export const scoreConversationTurn = (
  targetText: string,
  hint: string,
  audioBase64: string,
): Promise<ConversationTurnScoringResult> =>
  post('/api/ai/homework-score', { type: 'conversation-turn', targetText, hint, audioBase64 });

export const scoreFreeTalk = (
  audioBase64: string,
  vocabWords: string[],
  structurePatterns: string[],
  topic?: string,
  deductedPointsPerError?: number,
): Promise<FreeTalkScoringResult> =>
  post('/api/ai/homework-score', { type: 'free-talk', audioBase64, vocabWords, structurePatterns, topic, deductedPointsPerError });

export const generateFreeTalkTopic = (
  vocabWords: string[],
  structurePatterns: string[],
  learnerRole?: string,
): Promise<string> =>
  post('/api/ai/homework-score', { type: 'free-talk-topic', vocabWords, structurePatterns, learnerRole });

export const generateAnswerGuide = (
  topic: string,
  vocabWords: string[],
  structurePatterns: string[],
): Promise<string[]> =>
  post('/api/ai/homework-score', { type: 'answer-guide', topic, vocabWords, structurePatterns });

// ── Safe client-side re-exports ─────────────────────────────────────────────

// generateAudio already calls /api/tts (no Gemini key needed)
export { generateAudio } from '@/lib/services/geminiService';
// Pure browser utilities
export { decodePCM, createAudioBuffer } from '@/lib/audio/audioUtils';
