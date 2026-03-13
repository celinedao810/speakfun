import { GoogleGenAI, Type } from "@google/genai";
import {
  PlacementSentence, DiagnosticResult, SoundDrillPack, TargetSoundResult, WordHighlight,
  VocabItem, StructureItem, RawDialogueLine, VocabExerciseItem, StructureExerciseItem,
  VocabScoringResult, StructureScoringResult, ConversationScoringResult, ReadingScoringResult,
  ConversationExercise, ConversationTurnScoringResult,
} from "@/lib/types";

/**
 * Robust execution wrapper with exponential backoff for API calls.
 * Handles 429 (Quota) and 5xx (Server) errors.
 */
async function safeExecute<T>(fn: () => Promise<T>, maxRetries = 4, initialDelay = 2000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = error?.message || '';
      const isQuotaError = error?.status === 429 || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Resource exhausted');
      const isServerError = error?.status >= 500 || errorMsg.includes('500');

      if ((isQuotaError || isServerError) && i < maxRetries - 1) {
        console.warn(`API Warning: ${isQuotaError ? 'Quota exceeded' : 'Server error'}. Retrying in ${delay/1000}s... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 2s -> 4s -> 8s -> 16s
        continue;
      }

      if (isQuotaError && errorMsg.includes('limit: 0')) {
        throw new Error("The selected API key has a daily limit of 0 for this model. Please check your AI Studio plan or use a different key.");
      }

      if (isQuotaError) {
        throw new Error("Đã vượt quá giới hạn API. Vui lòng đợi 1-2 phút rồi thử lại. (API rate limit exceeded)");
      }

      throw error;
    }
  }
  throw new Error("Đã vượt quá số lần thử lại. Vui lòng đợi vài phút rồi thử lại.");
}

// Get API key - server-side only
const getApiKey = () => {
  return process.env.GEMINI_API_KEY || '';
};

export interface PronunciationResult {
  score: number;
  feedback: string;
  ipaTranscription: string;
  transcription?: string;  // What the AI heard (for ending sound exercises)
  highlights?: WordHighlight[];
}

export interface LiveEvaluationResult {
  score: number;
  transcription: string;
  feedback: {
    pronunciation: string;
    grammar: string;
    fluency: string;
    general: string;
  };
  highlights: WordHighlight[];
}

export interface AISuggestion {
  answer: string;
  tips: string;
}

export const generatePlacementSentences = async (industry: string, role: string): Promise<PlacementSentence[]> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Industry: ${industry}, Role: ${role}. Generate 3 complex sentences for a comprehensive pronunciation placement test.
      Phonetic Requirements for the set:
      1. Sentence 1: Focus on vowel contrasts (e.g., /iː/ vs /ɪ/ or /æ/ vs /e/) and ending sounds /s/, /z/, /iz/.
      2. Sentence 2: Focus on hard consonant clusters (str, spr, thr) and past tense endings /t/, /d/, /id/.
      3. Sentence 3: Focus on Liquids/Fricatives (r, l, θ, ð, ʃ) and natural Consonant-Vowel linking.
      Return JSON array of { "text": "...", "focusPhonemes": ["...", "..."] }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              focusPhonemes: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["text", "focusPhonemes"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  });
};

export const analyzePlacementDiagnostic = async (sentences: string[], audioBlobs: string[]): Promise<DiagnosticResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Analyze these 3 audio recordings against their respective sentences:
          1. "${sentences[0]}"
          2. "${sentences[1]}"
          3. "${sentences[2]}"
          Task: Perform a deep phonetic diagnostic. Identify missing linking, ending sounds, and mispronounced phonemes.
          Return JSON: { "needsLinking": boolean, "needsEndingSounds": ["s", "z", "t", "d"], "needsPhonemes": ["symbol1", "symbol2"] }` },
          { inlineData: { mimeType: 'audio/webm', data: audioBlobs[0] } },
          { inlineData: { mimeType: 'audio/webm', data: audioBlobs[1] } },
          { inlineData: { mimeType: 'audio/webm', data: audioBlobs[2] } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            needsLinking: { type: Type.BOOLEAN },
            needsEndingSounds: { type: Type.ARRAY, items: { type: Type.STRING } },
            needsPhonemes: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["needsLinking", "needsEndingSounds", "needsPhonemes"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const scorePronunciation = async (targetText: string, audioBase64: string, _isTongueTwister: boolean = false, _isInterview: boolean = false): Promise<PronunciationResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Evaluate this audio for: "${targetText}". Focus on final consonants and CONNECTED SPEECH (linking consonant to vowel). Feedback: Tiếng Việt. Return JSON { score, feedback, ipaTranscription, highlights: [{word, isCorrect}] }.` },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{}');
  });
};

/**
 * Specialized scoring for Ending Sound exercises (Step 4 & 5).
 * Simple word-by-word comparison: transcribe audio, compare to original, highlight differences.
 * Uses gemini-1.5-flash for audio to avoid rate limits on 2.0-flash.
 */
export const scoreEndingSoundPronunciation = async (
  targetText: string,
  audioBase64: string,
  _targetSounds: string[]
): Promise<PronunciationResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `TASK: Transcribe audio and find EXACT differences from original text.

ORIGINAL TEXT: "${targetText}"

STEP 1 - TRANSCRIBE:
Listen and write EXACTLY what you hear. Be very precise:
- "launches" vs "launch" are DIFFERENT words
- "campaigns" vs "campaign" are DIFFERENT words
- "trends" vs "trend" are DIFFERENT words
- Missing -s, -es, -ed endings = DIFFERENT word

STEP 2 - STRICT WORD-BY-WORD COMPARISON:
For EACH word in the original text, check if the transcription has the EXACT same word.

CRITICAL: These are NOT matches (mark as isCorrect: false):
- "launches" in original but "launch" in transcription → INCORRECT
- "campaigns" in original but "campaign" in transcription → INCORRECT
- "analyzes" in original but "analyze" in transcription → INCORRECT
- Any word with missing ending sounds → INCORRECT

Only mark isCorrect: true if the words are EXACTLY the same (ignoring punctuation).

STEP 3 - CALCULATE SCORE:
Count words marked as isCorrect: true, divide by total words, multiply by 100.

EXAMPLE:
Original: "Our team launches campaigns"
Transcription: "Our team launch campaign"
Result:
- "Our" → matches "Our" → isCorrect: true
- "team" → matches "team" → isCorrect: true
- "launches" → "launch" is DIFFERENT → isCorrect: false
- "campaigns" → "campaign" is DIFFERENT → isCorrect: false
Score: 2/4 = 50%

Return JSON:
{
  "score": number (0-100),
  "transcription": "exact transcription",
  "feedback": "Tóm tắt ngắn gọn bằng tiếng Việt về cách cải thiện phát âm âm cuối. Không liệt kê từ đúng/sai.",
  "ipaTranscription": "IPA of transcription",
  "highlights": [{"word": "word1", "isCorrect": true}, {"word": "word2", "isCorrect": false}, ...]
}

RULES:
- highlights must have ALL words from original in order
- Be STRICT: "launch" ≠ "launches", "campaign" ≠ "campaigns"` },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const evaluateLiveResponse = async (question: string, audioBase64: string): Promise<LiveEvaluationResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Analyze this audio response to the interview question: "${question}". Return JSON { score, transcription, feedback: { pronunciation, grammar, fluency, general }, highlights: [{ word, isCorrect }] }.` },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            transcription: { type: Type.STRING },
            feedback: {
              type: Type.OBJECT,
              properties: {
                pronunciation: { type: Type.STRING },
                grammar: { type: Type.STRING },
                fluency: { type: Type.STRING },
                general: { type: Type.STRING }
              },
              required: ["pronunciation", "grammar", "fluency", "general"]
            },
            highlights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { word: { type: Type.STRING }, isCorrect: { type: Type.BOOLEAN } },
                required: ["word", "isCorrect"]
              }
            }
          },
          required: ["score", "transcription", "feedback", "highlights"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

/**
 * Generate audio using the TTS API route.
 * Returns base64-encoded LINEAR16 audio data at 24000Hz sample rate.
 */
export const generateAudio = async (text: string): Promise<string> => {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'TTS generation failed');
  }

  const data = await response.json();
  return data.audio;
};


export const generateDailyPack = async (symbol: string, _day: number, prefs?: any): Promise<any> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const context = prefs ? `Industry: ${prefs.industry}, Role: ${prefs.role}.` : 'General professional context.';
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a 5-step practice pack for the phonetic sound: "${symbol}". Context: ${context}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetSound: { type: Type.STRING },
            minimalPairs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { wordA: { type: Type.STRING }, wordB: { type: Type.STRING }, ipaA: { type: Type.STRING }, ipaB: { type: Type.STRING } },
                required: ["wordA", "wordB", "ipaA", "ipaB"]
              }
            },
            targetWord: {
              type: Type.OBJECT,
              properties: { word: { type: Type.STRING }, meaning: { type: Type.STRING }, partOfSpeech: { type: Type.STRING }, ipa: { type: Type.STRING } },
              required: ["word", "meaning", "partOfSpeech", "ipa"]
            },
            tongueTwister: { type: Type.STRING },
            shortStory: { type: Type.STRING }
          },
          required: ["targetSound", "minimalPairs", "targetWord", "tongueTwister", "shortStory"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const generateInterviewQuestions = async (role: string, _sen: any, ind: string, type: any, jd: string, sam: string): Promise<string[]> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `8 interview questions for ${type}. Role: ${role}, Industry: ${ind}, JD: ${jd}, Samples: ${sam}. JSON array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    });
    return JSON.parse(response.text || '[]');
  });
};

export const getAISuggestion = async (q: string, role: string, _sen: any, lvl: string, _cv: string, _jd: string): Promise<AISuggestion> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Example answer for: ${q}. Role: ${role}, Level: ${lvl}. Return JSON { answer, tips }.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { answer: { type: Type.STRING }, tips: { type: Type.STRING } },
          required: ["answer", "tips"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const polishInterviewAnswer = async (q: string, raw: string, role: string, _sen: any, lvl: string, _ins: string, _cv: string): Promise<string> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Question: ${q}, Raw: ${raw}, Role: ${role}, Level: ${lvl}. Polish the answer.`,
    });
    return response.text?.trim() || "";
  });
};

export const fixUserQuestions = async (rawInput: string): Promise<string[]> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Fix grammar in this list: "${rawInput}". Return JSON string array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    });
    return JSON.parse(response.text || '[]');
  });
};

export const generateEndingSoundPack = async (patternGroup: string, prefs?: any): Promise<any> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const industry = prefs?.industry || 'General';
    const role = prefs?.role || 'Professional';

    const isPastTense = patternGroup === 'PAST_TENSE';
    const sounds = isPastTense ? ['t', 'd', 'ɪd'] : ['s', 'z', 'ɪz'];
    const context = isPastTense
      ? 'regular past tense verbs'
      : 'plurals and third-person singular present tense verbs';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a comprehensive ending sound practice pack for ${patternGroup} pattern.
Industry context: ${industry}, Role: ${role}

The pack should focus on ${context} with endings: ${sounds.join(', ')}.

CRITICAL PHONETIC RULES - FOLLOW EXACTLY:
${isPastTense ? `
For PAST TENSE (-ed endings):
• /t/ sound: After voiceless consonants /p, k, f, s, ʃ, tʃ, θ/
  Examples: stopped /stɒpt/, worked /wɜːkt/, laughed /læft/, watched /wɒtʃt/
• /d/ sound: After voiced consonants /b, g, v, z, ʒ, dʒ, ð, m, n, ŋ, l, r/ and vowels
  Examples: played /pleɪd/, called /kɔːld/, opened /əʊpənd/, tried /traɪd/
• /ɪd/ sound: ONLY after /t/ or /d/
  Examples: wanted /wɒntɪd/, needed /niːdɪd/, started /stɑːtɪd/
` : `
For PLURALS and 3rd person (-s/-es endings):
• /s/ sound: After voiceless consonants /p, t, k, f, θ/
  Examples: books /bʊks/, cats /kæts/, cups /kʌps/, graphs /ɡræfs/, reports /rɪˈpɔːts/
• /z/ sound: After voiced consonants /b, d, g, v, ð, m, n, ŋ, l, r/ and vowels
  Examples: dogs /dɒɡz/, trees /triːz/, deals /diːlz/, campaigns /kæmˈpeɪnz/, plans /plænz/
• /ɪz/ sound: ONLY after sibilants /s, z, ʃ, ʒ, tʃ, dʒ/
  Examples: watches /wɒtʃɪz/, roses /rəʊzɪz/, judges /dʒʌdʒɪz/, changes /tʃeɪndʒɪz/, services /ˈsɜːvɪsɪz/

COMMON MISTAKES TO AVOID:
- "websites" ends in /s/ NOT /ɪz/ (site ends in /t/, so sites = /s/)
- "budgets" ends in /s/ NOT /ɪz/ (budget ends in /t/, so budgets = /s/)
- "agreements" ends in /s/ NOT /z/ (agreement ends in /t/, so = /s/)
- "reports" ends in /s/ NOT /z/ (report ends in /t/, so = /s/)
- "products" ends in /s/ NOT /z/ (product ends in /t/, so = /s/)
`}

REQUIREMENTS:

STEP 1 - Pattern Recognition (step1):
- Create 3 groups, one for each sound: ${sounds.join(', ')}
- Each group needs:
  - sound: the IPA symbol (e.g., "s", "z", "ɪz" for plurals OR "t", "d", "ɪd" for past tense)
  - rule: Vietnamese explanation of when this sound is used
  - words: exactly 3 industry-relevant example words, each with:
    - word: the word (e.g., "books", "plays", "watches")
    - ipa: IPA transcription (e.g., "/bʊks/")
    - endingLetters: the letters that make the ending sound (e.g., "ks", "ys", "es")
  VERIFY each word follows the phonetic rules above before including it!
- summary: A Vietnamese summary paragraph explaining all 3 patterns
- quiz: 6 new words (2 per sound) for testing, each with word, correctSound, endingLetters

STEP 2 - Drag-and-Drop Game (step2Game):
- 10 industry-relevant words, distributed across all 3 sounds
- Each word has: word, sound (the IPA ending), endingLetters
- VERIFY each word's sound classification is correct!

STEP 3 - Odd One Out (step3OddOneOut):
- 3 rounds, increasing difficulty
- Each round: 4 words where EXACTLY 3 share the SAME ending sound and 1 has a DIFFERENT sound
- CRITICAL VALIDATION:
  * Count how many words have each sound before finalizing
  * Must be exactly 3-1 split (three /s/ + one /z/, or three /z/ + one /ɪz/, etc.)
  * The oddIndex must point to the single word with the different sound
  * DO NOT create 2-2 splits!
- Example for PLURALS: ["cats", "books", "maps", "dogs"] → 3 have /s/, 1 has /z/, oddIndex=3
- Example for PAST_TENSE: ["walked", "stopped", "laughed", "played"] → 3 have /t/, 1 has /d/, oddIndex=3
- Include: words array, oddIndex (0-3), explanation in Vietnamese

STEP 4 - Industry Phrases (step4Phrases):
- 2 industry-relevant sentences
- Each sentence contains 3-5 words with the target ending sounds
- Include: phrase, wordsWithEndings (array of words with target sounds)

STEP 5 - Short Story (shortStory):
- Exactly 3 sentences using many words with target ending sounds
- Industry-relevant content

BEFORE RETURNING: Double-check all word classifications follow the phonetic rules!

Return JSON matching the exact schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            step1: {
              type: Type.OBJECT,
              properties: {
                groups: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sound: { type: Type.STRING },
                      rule: { type: Type.STRING },
                      words: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            word: { type: Type.STRING },
                            ipa: { type: Type.STRING },
                            endingLetters: { type: Type.STRING }
                          },
                          required: ["word", "ipa", "endingLetters"]
                        }
                      }
                    },
                    required: ["sound", "rule", "words"]
                  }
                },
                summary: { type: Type.STRING },
                quiz: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      correctSound: { type: Type.STRING },
                      endingLetters: { type: Type.STRING }
                    },
                    required: ["word", "correctSound", "endingLetters"]
                  }
                }
              },
              required: ["groups", "summary", "quiz"]
            },
            step2Game: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  sound: { type: Type.STRING },
                  endingLetters: { type: Type.STRING }
                },
                required: ["word", "sound", "endingLetters"]
              }
            },
            step3OddOneOut: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  words: { type: Type.ARRAY, items: { type: Type.STRING } },
                  oddIndex: { type: Type.NUMBER },
                  explanation: { type: Type.STRING }
                },
                required: ["words", "oddIndex", "explanation"]
              }
            },
            step4Phrases: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  phrase: { type: Type.STRING },
                  wordsWithEndings: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["phrase", "wordsWithEndings"]
              }
            },
            shortStory: { type: Type.STRING }
          },
          required: ["step1", "step2Game", "step3OddOneOut", "step4Phrases", "shortStory"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const generateLinkingSoundPack = async (_prefs?: any): Promise<any> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a high-quality connected speech (linking) practice pack. Focusing on Consonant-Vowel linking (e.g., 'keep it' -> 'kee-pit').`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            linkingRules: { type: Type.STRING },
            step1Examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { phrase: { type: Type.STRING }, explanation: { type: Type.STRING } },
                required: ["phrase", "explanation"]
              }
            },
            step2Dictation: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { phrase: { type: Type.STRING }, audioText: { type: Type.STRING } },
                required: ["phrase", "audioText"]
              }
            },
            step3Build: {
              type: Type.OBJECT,
              properties: { components: { type: Type.ARRAY, items: { type: Type.STRING } }, fullSentence: { type: Type.STRING } },
              required: ["components", "fullSentence"]
            },
            step4Mastery: {
              type: Type.OBJECT,
              properties: { sentence: { type: Type.STRING }, linkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } } },
              required: ["sentence", "linkingPoints"]
            }
          },
          required: ["linkingRules", "step1Examples", "step2Dictation", "step3Build", "step4Mastery"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const generateSoundDrillPack = async (
  soundSymbol: string,
  soundDescription: string,
  industry?: string,
  role?: string
): Promise<SoundDrillPack> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const industryContext = industry || 'General';
    const roleContext = role || 'Professional';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a 4-exercise pronunciation practice pack for the sound "${soundSymbol}" (${soundDescription}).

Context: Industry = ${industryContext}, Role = ${roleContext}

Requirements:
1. WORD EXERCISE: One industry-relevant word containing the target sound "${soundSymbol}". Include meaning, part of speech, IPA transcription, and an example sentence using the word.

2. MINIMAL PAIRS EXERCISE: Exactly 3 pairs of words for a listening discrimination exercise.

3. TONGUE TWISTER: A short tongue twister (1-2 sentences) that contains the target sound "${soundSymbol}" at least 5 times.

4. SHORT STORY: Exactly 3 sentences that form a coherent mini-story related to ${industryContext}.

Return JSON matching the exact schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetSound: { type: Type.STRING },
            targetSoundSymbol: { type: Type.STRING },
            industry: { type: Type.STRING },
            wordExercise: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                meaning: { type: Type.STRING },
                partOfSpeech: { type: Type.STRING },
                ipa: { type: Type.STRING },
                exampleSentence: { type: Type.STRING }
              },
              required: ["word", "meaning", "partOfSpeech", "ipa", "exampleSentence"]
            },
            minimalPairsExercise: {
              type: Type.OBJECT,
              properties: {
                pairs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      targetWord: { type: Type.STRING },
                      targetWordIpa: { type: Type.STRING },
                      distractorWord: { type: Type.STRING },
                      distractorWordIpa: { type: Type.STRING }
                    },
                    required: ["id", "targetWord", "targetWordIpa", "distractorWord", "distractorWordIpa"]
                  }
                },
                instructions: { type: Type.STRING }
              },
              required: ["pairs", "instructions"]
            },
            tongueTwisterExercise: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                targetSoundOccurrences: { type: Type.NUMBER }
              },
              required: ["text", "targetSoundOccurrences"]
            },
            shortStoryExercise: {
              type: Type.OBJECT,
              properties: {
                sentences: { type: Type.ARRAY, items: { type: Type.STRING } },
                fullText: { type: Type.STRING },
                targetSoundOccurrences: { type: Type.NUMBER }
              },
              required: ["sentences", "fullText", "targetSoundOccurrences"]
            }
          },
          required: ["targetSound", "targetSoundSymbol", "industry", "wordExercise", "minimalPairsExercise", "tongueTwisterExercise", "shortStoryExercise"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  });
};

export const scoreTargetSoundPronunciation = async (
  targetText: string,
  targetSound: string,
  targetSoundSymbol: string,
  audioBase64: string
): Promise<TargetSoundResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `You are an expert pronunciation coach evaluating a student's speech recording.

TASK: Evaluate the pronunciation of the target sound "${targetSoundSymbol}" (${targetSound}) in this audio recording.

Target text the student was asked to read: "${targetText}"

Provide constructive feedback in Vietnamese, specifically about how to improve the target sound "${targetSoundSymbol}".

Return JSON with:
- targetSoundScore: number between 0-100
- feedback: Vietnamese language feedback
- targetSoundInstances: array of objects with {word, isCorrect, suggestion?}`
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetSoundScore: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            targetSoundInstances: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN },
                  suggestion: { type: Type.STRING }
                },
                required: ["word", "isCorrect"]
              }
            }
          },
          required: ["targetSoundScore", "feedback", "targetSoundInstances"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  });
};

// ============================================================================
// Phase 6: Homework Exercise System — AI Functions
// ============================================================================

/**
 * Extracts vocabulary, grammar structures, and dialogues from a lesson PDF.
 * The PDF is sent as inline base64 data to Gemini's multimodal API.
 * Called server-side only (PDF bytes fetched via admin Supabase client).
 */
export const extractLessonContent = async (
  pdfBase64: string,
  lessonTitle: string
): Promise<{ vocabulary: VocabItem[]; structures: StructureItem[]; readingPassage: string }> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: { mimeType: 'application/pdf', data: pdfBase64 }
          },
          {
            text: `This is an English language learning lesson PDF titled "${lessonTitle}".

Extract the following from this lesson:

1. vocabulary: Target vocabulary words explicitly being taught (NOT common everyday words). Include only words students are expected to learn.
2. structures: Grammar patterns and sentence structures explicitly demonstrated in the lesson.
3. readingPassage: The main reading text or article from the lesson (continuous prose, NOT dialogues or vocabulary lists). Return the full text verbatim. If no dedicated reading section exists, return an empty string.

Rules:
- vocabulary IDs: use format "v1", "v2", etc.
- structures IDs: use format "s1", "s2", etc.
- IPA should use standard IPA notation.
- Definitions should be concise (1 sentence max).`
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  word: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  partOfSpeech: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  exampleSentence: { type: Type.STRING },
                  category: { type: Type.STRING },
                },
                required: ['id', 'word', 'ipa', 'partOfSpeech', 'definition', 'exampleSentence'],
              },
            },
            structures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  pattern: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  exampleSentence: { type: Type.STRING },
                  topic: { type: Type.STRING },
                },
                required: ['id', 'pattern', 'explanation', 'exampleSentence', 'topic'],
              },
            },
            readingPassage: { type: Type.STRING },
          },
          required: ['vocabulary', 'structures', 'readingPassage'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      vocabulary: result.vocabulary || [],
      structures: result.structures || [],
      readingPassage: result.readingPassage || '',
    };
  });
};

/**
 * Generates exercise clues for vocab items — definitions that do NOT
 * contain the target word, for "guess the word" exercises.
 */
export const generateVocabClues = async (
  items: VocabItem[],
  lessonId: string
): Promise<VocabExerciseItem[]> => {
  if (items.length === 0) return [];
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const itemsJson = JSON.stringify(items.map(v => ({
      id: v.id,
      word: v.word,
      definition: v.definition,
      partOfSpeech: v.partOfSpeech,
      category: v.category || '',
    })));
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are creating "guess the word" exercise clues for English vocabulary practice.

For each vocabulary item, generate a clue that:
- Does NOT contain the actual word anywhere
- Uses ONLY B1-B2 level English vocabulary in the clue text (simple, everyday words — no advanced synonyms or complex academic language)
- Starts with the category in brackets if available: [Category]
- Includes the part of speech in parentheses
- Rephrases the definition so learners must recall the word
- Do NOT include "Starts with: [letter]..." — the UI already shows the first letter as a hint

Example output for "negotiate": "[Business] (verb): To reach a formal agreement through discussion."

Input: ${itemsJson}

Return an array with the same IDs as input.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              clue: { type: Type.STRING },
            },
            required: ['id', 'clue'],
          },
        },
      },
    });
    const clues: { id: string; clue: string }[] = JSON.parse(response.text || '[]');
    const clueMap = new Map(clues.map(c => [c.id, c.clue]));
    return items.map(item => ({
      id: item.id,
      word: item.word,
      ipa: item.ipa,
      clue: clueMap.get(item.id) || `(${item.partOfSpeech}): ${item.definition}`,
      exampleSentence: item.exampleSentence,
      lessonId,
    }));
  });
};

/**
 * Generates 3 plausible-but-wrong dialogue options for conversation exercises.
 * Stored in lesson_exercises at generation time (not called at runtime).
 */
export const generateConversationDistractors = async (
  correctLine: string,
  conversationContext: RawDialogueLine[],
  position: 'NEXT' | 'PRIOR'
): Promise<string[]> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const contextText = conversationContext.map(l => `${l.speaker}: ${l.text}`).join('\n');
    const directionLabel = position === 'NEXT'
      ? 'the line that comes AFTER this conversation line'
      : 'the line that comes BEFORE this conversation line';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are creating multiple-choice options for a conversation sequencing exercise.

Full conversation context:
${contextText}

The correct answer is: "${correctLine}"
This is ${directionLabel}.

Generate exactly 3 WRONG options that:
- Sound plausible as real conversation responses in this context
- Are grammatically correct English
- Do NOT match the correct answer
- Are similar in length and register to the correct answer
- Would genuinely confuse a learner who doesn't know the conversation well

Return only the 3 wrong options as a JSON array of strings.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });
    const distractors: string[] = JSON.parse(response.text || '[]');
    return distractors.slice(0, 3);
  });
};

/**
 * Scores a learner's reading of a full lesson passage.
 * Checks overall reading accuracy, per-vocab pronunciation, and counts errors.
 */
export const scoreReadingPassage = async (
  readingPassage: string,
  vocabWords: string[],
  audioBase64: string
): Promise<ReadingScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
          {
            text: `You are evaluating a learner's oral reading of an English passage.

Reading passage:
"""
${readingPassage}
"""

Target vocabulary words to check: ${JSON.stringify(vocabWords)}

IMPORTANT — Proper nouns rule: The passage may contain proper nouns such as personal names (e.g. "Nguyen", "Khanh"), place names, or company names from non-English languages. Do NOT count these as pronunciation errors and do NOT include them in mispronunciations. Their pronunciation varies widely by language origin and cannot be held to a single standard.

Listen to the recording and evaluate:
1. readingMatches: Did the learner attempt to read the full passage? Set true if the learner made a genuine attempt to read the entire passage (even with pronunciation errors or minor word mistakes). Set false ONLY if they clearly stopped mid-way, skipped multiple sentences, or read completely different text. Pronunciation errors alone should NOT make this false.
2. mispronunciations: List every mispronounced common English word (skip all proper nouns). For each entry provide:
   - "word": the word as it appears in the passage
   - "issue": a short explanation in Vietnamese of what was wrong — mention the correct phoneme, stress, or sound (include IPA or example where helpful)
3. vocabResults: For each target vocabulary word, was it clearly and correctly pronounced? (true/false). Accept morphological variants as correct — e.g. if the vocab word is "stakeholder" but the passage uses "stakeholders" and the learner says "stakeholders", mark it true. Also accept -ing, -ed, -er, -tion forms of the same root word.
4. transcription: Write what the learner actually said
5. feedback: 1–2 sentences of overall constructive feedback on their reading, written in Vietnamese

Be lenient with minor accent differences. Focus on intelligibility and correctness.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            readingMatches: { type: Type.BOOLEAN },
            mispronunciations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  issue: { type: Type.STRING },
                },
                required: ['word', 'issue'],
              },
            },
            vocabResults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  correct: { type: Type.BOOLEAN },
                },
                required: ['word', 'correct'],
              },
            },
            feedback: { type: Type.STRING },
            transcription: { type: Type.STRING },
          },
          required: ['readingMatches', 'mispronunciations', 'vocabResults', 'feedback', 'transcription'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    const mispronunciations: { word: string; issue: string }[] = result.mispronunciations || [];
    const base = result.readingMatches ? 20 : 0;
    const vocabPts = (result.vocabResults as { word: string; correct: boolean }[])
      .filter(v => v.correct).length;
    // Derive penalty count from the explicit mispronunciation list for consistency
    const penaltiesApplied = mispronunciations.length;
    const deductions = penaltiesApplied * 0.5;
    const pointsEarned = Math.max(0, Math.round((base + vocabPts - deductions) * 10) / 10);
    return {
      readingMatches: result.readingMatches || false,
      penaltiesApplied,
      mispronunciations,
      vocabResults: result.vocabResults || [],
      pointsEarned,
      feedback: result.feedback || '',
      transcription: result.transcription || '',
    };
  });
};

/**
 * Generates a role-play conversation exercise from the lesson's grammar structures.
 * The conversation is at A2 CEFR level and gives learners turns to practise each structure.
 */
export const generateConversationExercise = async (
  structureItems: StructureExerciseItem[],
  lessonId: string
): Promise<ConversationExercise> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const structuresJson = JSON.stringify(
      structureItems.map(s => ({ id: s.id, pattern: s.pattern, explanation: s.explanation, exampleSentence: s.exampleSentence }))
    );
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are designing an English speaking exercise for A2-level CEFR learners.

You are given a list of grammar structures from a lesson. Create a natural conversation where a learner can practise each structure. The conversation must be:
- A2 level vocabulary and grammar (simple everyday words — only the target structures may be slightly more complex)
- Natural and coherent — a realistic dialogue between two people in a professional or everyday context
- Each LEARNER turn MUST practise exactly one target structure
- Rule for structure placement:
  * If the structure is naturally used in a QUESTION → have the LEARNER ask the question (AI provides the answer in the next AI turn)
  * If the structure is naturally used in a STATEMENT or ANSWER → have the AI ask a question that prompts the learner to respond using that structure

For LEARNER turns, the "text" field must be the ideal/sample answer the learner should say (used for scoring).
For LEARNER turns, the "hint" field must be the structure pattern the learner should use (e.g. "Subject + has/have + been + V-ing + ...").
The total number of turns should be appropriate for the number of structures (roughly 2 turns per structure: one AI prompt turn + one LEARNER turn).

Grammar structures:
${structuresJson}

Return a JSON object.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenario: { type: Type.STRING },
            aiRole: { type: Type.STRING },
            learnerRole: { type: Type.STRING },
            turns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.NUMBER },
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING },
                  targetStructureId: { type: Type.STRING },
                  hint: { type: Type.STRING },
                },
                required: ['index', 'speaker', 'text'],
              },
            },
          },
          required: ['scenario', 'aiRole', 'learnerRole', 'turns'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      lessonId,
      scenario: result.scenario || '',
      aiRole: result.aiRole || 'Colleague',
      learnerRole: result.learnerRole || 'Team Member',
      turns: (result.turns || []).map((t: { index: number; speaker: string; text: string; targetStructureId?: string; hint?: string }, i: number) => ({
        index: i,
        speaker: (t.speaker || '').toUpperCase() === 'LEARNER' ? 'LEARNER' : 'AI',
        text: t.text || '',
        targetStructureId: t.targetStructureId,
        hint: t.hint,
      })),
    };
  });
};

/**
 * Scores a learner's spoken response for a conversation role-play turn.
 * Awards 10pt for exact target structure, 5pt for similar structure, 0pt if missing.
 * Deducts 0.5pt per pronunciation/grammar/word-choice error.
 */
export const scoreConversationTurn = async (
  targetText: string,
  hint: string,
  audioBase64: string
): Promise<ConversationTurnScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `You are scoring a learner's spoken English response in a role-play exercise.

Target grammar structure pattern: "${hint}"
Sample answer (one possible correct response): "${targetText}"

Scoring rules:
1. Transcribe exactly what the learner said.
2. Evaluate whether the learner correctly applied the TARGET GRAMMAR STRUCTURE PATTERN (not whether they matched the sample answer word-for-word). The sample answer is just one example — different vocabulary or examples that still follow the same pattern are equally valid.
   - structureExact = true: The learner correctly applied the target structure pattern with appropriate grammar → base 10 points
   - structureUsed = true (but not exact): The learner used a recognisably similar structure that conveys the same meaning → base 5 points
   - Both false: The learner did not use the target structure at all → base 0 points
3. Count errors (each deducts 0.5pt from the base):
   - Pronunciation errors (clearly wrong sounds, not just accent)
   - Grammar errors (wrong tense, subject-verb agreement, article misuse, etc.)
   - Significant word choice errors (wrong vocabulary that changes meaning)
   - Do NOT penalise for using different but valid vocabulary/examples that still fit the structure.
4. pointsEarned = max(0, base - penaltiesApplied × 0.5)
5. grammarCorrect = true if no grammar errors found.
6. Write 1–2 sentences of feedback in Vietnamese.
7. correctedSentence: Rewrite the learner's actual transcription as a corrected sentence that properly uses the target structure pattern. Keep the learner's own vocabulary and examples where possible — only fix structural or grammar errors.`,
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            structureExact: { type: Type.BOOLEAN },
            structureUsed: { type: Type.BOOLEAN },
            grammarCorrect: { type: Type.BOOLEAN },
            penaltiesApplied: { type: Type.NUMBER },
            pointsEarned: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            correctedSentence: { type: Type.STRING },
          },
          required: ['transcription', 'structureExact', 'structureUsed', 'grammarCorrect', 'penaltiesApplied', 'pointsEarned', 'feedback', 'correctedSentence'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      transcription: result.transcription || '',
      structureExact: result.structureExact || false,
      structureUsed: result.structureUsed || result.structureExact || false,
      grammarCorrect: result.grammarCorrect || false,
      penaltiesApplied: result.penaltiesApplied || 0,
      pointsEarned: result.pointsEarned || 0,
      feedback: result.feedback || '',
      correctedSentence: result.correctedSentence || '',
    };
  });
};

/**
 * Evaluates whether a learner correctly said the target vocabulary word
 * and scores their pronunciation.
 */
export const scoreVocabGuess = async (
  targetWord: string,
  ipa: string,
  audioBase64: string,
  timerMode: boolean
): Promise<VocabScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const maxPoints = timerMode ? 1 : 0.5;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Evaluate this English pronunciation recording for a vocabulary exercise.

Target word: "${targetWord}"
IPA: ${ipa}

Step 1: Transcribe what the learner said.
Step 2: Check if they said the correct word (exact match, ignoring minor accent differences).
Step 3: If correct, score pronunciation 0-100 based on vowels, consonants, and stress.
Step 4: Give brief feedback in Vietnamese.`
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recognizedWord: { type: Type.STRING },
            isCorrectWord: { type: Type.BOOLEAN },
            pronunciationScore: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ['recognizedWord', 'isCorrectWord', 'pronunciationScore', 'feedback'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    const isCorrectWord = result.isCorrectWord || false;
    return {
      vocabItemId: '',  // Set by caller
      recognizedWord: result.recognizedWord || '',
      isCorrectWord,
      pronunciationScore: result.pronunciationScore || 0,
      pointsEarned: isCorrectWord ? maxPoints : 0,  // deterministic — never trust AI for this
      feedback: result.feedback || '',
      highlights: [],
    };
  });
};

/**
 * Scores a learner reading an example sentence aloud.
 * Base points: 5pt (no timer) or 7pt (timer), minus 0.5pt per error.
 */
export const scoreStructureReading = async (
  exampleSentence: string,
  audioBase64: string,
  timerMode: boolean
): Promise<StructureScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const basePoints = timerMode ? 7 : 5;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Evaluate this English sentence reading for pronunciation, intonation, and word stress.

Target sentence: "${exampleSentence}"
Base points: ${basePoints} (subtract 0.5 per error)

Count pronunciation errors, intonation errors, word stress errors.
Calculate: pointsEarned = max(0, ${basePoints} - (total_errors × 0.5))
Score pronunciation 0-100.
Give feedback in Vietnamese.`
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pronunciationScore: { type: Type.NUMBER },
            pointsEarned: { type: Type.NUMBER },
            penaltiesApplied: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            highlights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN },
                },
                required: ['word', 'isCorrect'],
              },
            },
          },
          required: ['pronunciationScore', 'pointsEarned', 'penaltiesApplied', 'feedback'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      structureItemId: '',  // Set by caller
      step: 'READ_EXAMPLE' as const,
      pronunciationScore: result.pronunciationScore || 0,
      pointsEarned: result.pointsEarned || 0,
      feedback: result.feedback || '',
      penaltiesApplied: result.penaltiesApplied || 0,
    };
  });
};

/**
 * Evaluates a learner's own sentence using a target grammar structure.
 * Points: 5pt (no timer) or 7pt (timer), minus 0.5pt per grammar/pronun error.
 */
export const scoreOwnSentence = async (
  structurePattern: string,
  audioBase64: string,
  timerMode: boolean
): Promise<StructureScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const basePoints = timerMode ? 7 : 5;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Evaluate this learner-generated English sentence for a speaking exercise.

Target grammar structure: "${structurePattern}"
Base points: ${basePoints} (subtract 0.5 per error, 0 if grammatically incorrect)

Step 1: Transcribe what was said.
Step 2: Check if the sentence uses the target structure correctly (grammarCorrect).
Step 3: Check if the sentence makes sense (makesSense).
Step 4: Count grammar and pronunciation errors.
Step 5: pointsEarned = 0 if not grammarCorrect, else max(0, ${basePoints} - errors × 0.5).
Step 6: Pronunciation score 0-100.
Step 7: Feedback in Vietnamese.`
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            grammarCorrect: { type: Type.BOOLEAN },
            makesSense: { type: Type.BOOLEAN },
            pronunciationScore: { type: Type.NUMBER },
            pointsEarned: { type: Type.NUMBER },
            penaltiesApplied: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ['transcription', 'grammarCorrect', 'makesSense', 'pronunciationScore', 'pointsEarned', 'penaltiesApplied', 'feedback'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      structureItemId: '',  // Set by caller
      step: 'OWN_SENTENCE' as const,
      pronunciationScore: result.pronunciationScore || 0,
      grammarCorrect: result.grammarCorrect || false,
      pointsEarned: result.pointsEarned || 0,
      feedback: result.feedback || '',
      transcription: result.transcription || '',
      penaltiesApplied: result.penaltiesApplied || 0,
    };
  });
};

/**
 * Evaluates a conversation response recording.
 * ≤10s correct = 5pt, >10s correct = 4pt, wrong = 0pt.
 */
export const scoreConversationResponse = async (
  targetLine: string,
  audioBase64: string,
  timeTakenMs: number
): Promise<ConversationScoringResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const withinTime = timeTakenMs <= 10000;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Evaluate this conversation response recording.

Target line (correct answer): "${targetLine}"
Time taken: ${Math.round(timeTakenMs / 1000)}s — within 10s limit: ${withinTime ? 'YES' : 'NO'}

Step 1: Transcribe what was said.
Step 2: Check if the learner read the correct line (fuzzy match, ignore minor accents).
Step 3: Score pronunciation 0-100.
Step 4: Points: 0 if incorrect, ${withinTime ? '5' : '4'} if correct.`
          },
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            isCorrect: { type: Type.BOOLEAN },
            pronunciationScore: { type: Type.NUMBER },
            pointsEarned: { type: Type.NUMBER },
          },
          required: ['transcription', 'isCorrect', 'pronunciationScore', 'pointsEarned'],
        },
      },
    });
    const result = JSON.parse(response.text || '{}');
    return {
      isCorrect: result.isCorrect || false,
      pronunciationScore: result.pronunciationScore || 0,
      transcription: result.transcription || '',
      pointsEarned: result.pointsEarned || 0,
      timeTakenMs,
    };
  });
};

// ============================================================================
// Lesson Plan Generator
// ============================================================================

export interface LessonPlanInput {
  topic: string;
  cefrLevel: string;
  lessonFormat: string;
  learnerPersonas: string;
  otherInstructions: string;
  referencePdfsBase64: string[];
}

export interface LessonPlanOutput {
  title: string;
  sections: { id: string; heading: string; content: string }[];
}

export const generateLessonPlan = async (
  input: LessonPlanInput
): Promise<LessonPlanOutput> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const instructionText = `You are an expert in IT English and curriculum design. I want to build the lessons for the course of English for IT Professionals (dev, BA, tester, PM, UI/UX designer, data analyst etc.) Using the attached lesson as reference, and following the given details, pls build similar lessons (same structures, with target language relevant to the topics and the target learners).

Now create a full lesson plan with the following details:
- Topic: ${input.topic}
- CEFR Level: ${input.cefrLevel}
- Lesson Length & Format: ${input.lessonFormat || 'Not specified'}
- Learner Personas: ${input.learnerPersonas || 'Not specified'}
- Additional Instructions: ${input.otherInstructions || 'None'}

Produce a complete, classroom-ready lesson plan with these exact sections (use these exact IDs):
1. Learning Objectives (id: "objectives")
2. Warmer (id: "warmer") — include approximate time
3. Vocabulary Focus (id: "vocabulary")
4. Language Focus (id: "language")
5. Main Activities (id: "activities")
6. Wrap-Up (id: "wrap_up")
7. Homework (id: "homework")

Each section content must be well-structured markdown with proper line breaks. Use bullet points, bold terms, and example sentences where appropriate.

IMPORTANT FORMATTING RULES:
- Always use real newline characters (\n) between lines — never run multiple sentences or sub-items onto a single line.
- For vocabulary items, use this exact multi-line format for each word:
  **Word** (part of speech) — /phonetic/
  Definition: ...
  - Example 1: "..."
  - Example 2: "..."
- Separate each numbered vocabulary item with a blank line.
- For any numbered list, each item's sub-content (definition, examples, steps) must be on its own line, indented with "  " (two spaces) or as a bullet.

The title should be a short, descriptive heading for this specific lesson (e.g. "IT English: REST APIs and Web Services").`;

    // Build parts: reference PDFs first (if any), then the instruction text
    const parts: object[] = input.referencePdfsBase64.map(b64 => ({
      inlineData: { mimeType: 'application/pdf', data: b64 },
    }));
    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  heading: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ['id', 'heading', 'content'],
              },
            },
          },
          required: ['title', 'sections'],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      title: result.title || 'Lesson Plan',
      sections: result.sections || [],
    };
  });
};

export const refineLessonSection = async (
  sectionHeading: string,
  currentContent: string,
  refinementInstruction: string,
  lessonContext: { topic: string; cefrLevel: string; lessonFormat: string }
): Promise<string> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const prompt = `You are an expert EFL curriculum designer for IT English.

Lesson context:
- Topic: ${lessonContext.topic}
- CEFR Level: ${lessonContext.cefrLevel}
- Format: ${lessonContext.lessonFormat || 'Not specified'}

Section: ${sectionHeading}

Current content:
${currentContent}

Teacher's refinement instruction:
${refinementInstruction}

Rewrite ONLY the content of this section according to the teacher's instructions. Keep the same general structure but improve it as requested.
Return ONLY the new markdown content for this section — no headings, no preamble, just the content.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || currentContent;
  });
};

export const chatRefineLessonPlan = async (
  currentSections: { id: string; heading: string; content: string }[],
  chatInstruction: string,
  lessonContext: { topic: string; cefrLevel: string; lessonFormat: string }
): Promise<LessonPlanOutput> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const sectionsJson = JSON.stringify(currentSections);

    const prompt = `You are an expert EFL curriculum designer for IT English.

Current lesson plan (JSON):
${sectionsJson}

Lesson context:
- Topic: ${lessonContext.topic}
- CEFR Level: ${lessonContext.cefrLevel}
- Format: ${lessonContext.lessonFormat || 'Not specified'}

Teacher feedback:
${chatInstruction}

Regenerate the full lesson plan incorporating the teacher's feedback. Preserve the same section ids: objectives, warmer, vocabulary, language, activities, wrap_up, homework. Return the complete updated plan with the same title or an improved one.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  heading: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ['id', 'heading', 'content'],
              },
            },
          },
          required: ['title', 'sections'],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      title: result.title || lessonContext.topic,
      sections: result.sections || currentSections,
    };
  });
};

// ─── Homework Feedback Tool ──────────────────────────────────────────────────

export interface TranscriptionResult {
  transcription: string;
}

export interface SpeechAssessmentResult {
  overallScore: number;
  transcription: string;
  feedback: {
    pronunciation: string;
    grammar: string;
    wordChoice: string;
    cohesionAndCoherence: string;
    summary: string;
  };
}

/**
 * Transcribe audio recording to text.
 * Supports wav, mp3, aac, mp4/mov (audio track).
 */
export const transcribeAudio = async (
  audioBase64: string,
  mimeType: string
): Promise<TranscriptionResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Transcribe the spoken content in this audio recording as accurately as possible.
Return ONLY the verbatim transcription — no commentary, no formatting, no labels.
If the audio is silent or unintelligible, return an empty string.`,
          },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      },
    });
    const transcription = (response.text || '').trim();
    return { transcription };
  });
};

/**
 * Assess using transcription text only — used when the audio file is no longer
 * available (e.g. after a service-worker-triggered page reload).
 */
export const assessSpeechTextOnly = async (
  transcription: string,
  teacherComment?: string
): Promise<SpeechAssessmentResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const refinementInstruction = teacherComment
      ? `\n\nTEACHER COMMENT (apply to your feedback): "${teacherComment}"`
      : '';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert English language teacher reviewing a student's spoken response (transcription only — no audio available).

TRANSCRIPTION:
"${transcription}"

Assess across four dimensions and provide actionable, constructive feedback in English.
Note: pronunciation feedback should be based on likely issues inferred from the text patterns.${refinementInstruction}

Return JSON with this exact structure:
{
  "overallScore": <number 0-100>,
  "transcription": "${transcription.replace(/"/g, '\\"')}",
  "feedback": {
    "pronunciation": "<inferred pronunciation feedback based on word choices>",
    "grammar": "<detailed grammar feedback>",
    "wordChoice": "<detailed word choice feedback>",
    "cohesionAndCoherence": "<detailed cohesion & coherence feedback>",
    "summary": "<2-3 sentence overall summary with top 2 improvement priorities>"
  }
}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER },
            transcription: { type: Type.STRING },
            feedback: {
              type: Type.OBJECT,
              properties: {
                pronunciation: { type: Type.STRING },
                grammar: { type: Type.STRING },
                wordChoice: { type: Type.STRING },
                cohesionAndCoherence: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ['pronunciation', 'grammar', 'wordChoice', 'cohesionAndCoherence', 'summary'],
            },
          },
          required: ['overallScore', 'transcription', 'feedback'],
        },
      },
    });
    return JSON.parse(response.text || '{}');
  });
};

/**
 * Assess the quality of a spoken recording across four dimensions:
 * pronunciation, grammar, word choice, cohesion & coherence.
 * Optionally accepts a teacher comment to guide or refine the AI feedback.
 */
export const assessSpeech = async (
  transcription: string,
  audioBase64: string,
  mimeType: string,
  teacherComment?: string
): Promise<SpeechAssessmentResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const refinementInstruction = teacherComment
      ? `\n\nTEACHER COMMENT (apply to your feedback): "${teacherComment}"`
      : '';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `You are an expert English language teacher reviewing a student's spoken recording.

TRANSCRIPTION (for reference):
"${transcription}"

Assess the recording across four dimensions and provide actionable, constructive feedback in English.${refinementInstruction}

Return JSON with this exact structure:
{
  "overallScore": <number 0-100>,
  "transcription": "<exact transcription you hear>",
  "feedback": {
    "pronunciation": "<detailed feedback on pronunciation: problem sounds, stress, intonation, connected speech>",
    "grammar": "<detailed feedback on grammatical accuracy: tense, agreement, sentence structure>",
    "wordChoice": "<detailed feedback on vocabulary: appropriateness, variety, precision, collocations>",
    "cohesionAndCoherence": "<detailed feedback on organisation, logical flow, discourse markers, idea development>",
    "summary": "<2-3 sentence overall summary with the top 2 improvement priorities>"
  }
}`,
          },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER },
            transcription: { type: Type.STRING },
            feedback: {
              type: Type.OBJECT,
              properties: {
                pronunciation: { type: Type.STRING },
                grammar: { type: Type.STRING },
                wordChoice: { type: Type.STRING },
                cohesionAndCoherence: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ['pronunciation', 'grammar', 'wordChoice', 'cohesionAndCoherence', 'summary'],
            },
          },
          required: ['overallScore', 'transcription', 'feedback'],
        },
      },
    });
    return JSON.parse(response.text || '{}');
  });
};

export interface RefinementChange {
  original: string;
  corrected: string;
  reason: string;
}

export interface RefinementResult {
  refinedText: string;
  changes: RefinementChange[];
  summary: string;
}

/**
 * Refine a speech transcription: correct grammar/word-choice mistakes,
 * make it sound natural for a professional native speaker,
 * and keep the language level at A2–B1.
 * An optional teacher comment can guide the refinement.
 */
export const refineTranscription = async (
  transcription: string,
  teacherComment?: string
): Promise<RefinementResult> => {
  return safeExecute(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const refinementInstruction = teacherComment
      ? `\n\nTEACHER INSTRUCTION: "${teacherComment}"`
      : '';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an English language coach helping students improve spoken English.

ORIGINAL TRANSCRIPTION:
"${transcription}"

TASK: Produce a refined version that:
1. Fixes ALL grammar mistakes (tense, agreement, article use, prepositions, etc.)
2. Replaces unnatural or incorrect word choices with appropriate alternatives
3. Sounds like a confident native speaker in a professional workplace context
4. Stays at A2-B1 language level — keep vocabulary accessible, avoid complex structures
5. Preserves the speaker's original meaning and speaking style as much as possible${refinementInstruction}

Return JSON:
{
  "refinedText": "<full corrected and improved version>",
  "changes": [
    { "original": "<exact phrase from original>", "corrected": "<replacement>", "reason": "<brief explanation>" }
  ],
  "summary": "<1-2 sentences summarising what was improved>"
}

If there are no corrections needed, return the original text unchanged with an empty changes array.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            refinedText: { type: Type.STRING },
            changes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  corrected: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['original', 'corrected', 'reason'],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['refinedText', 'changes', 'summary'],
        },
      },
    });
    return JSON.parse(response.text || '{}');
  });
};
