/**
 * Letter rules for Voice Chain. The letter is spelling-based: "make" → E.
 */

/** Hesitation sounds — never count as a first or last word. */
const NOISE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'eh', 'hmm', 'hm', 'mm', 'mmm']);
/** Discourse markers that may come before the real first word ("So, ..."). */
const LEADING_FILLERS = new Set(['oh', 'well', 'so', 'okay', 'ok', 'like', 'yeah', 'right']);

/** Lower-case words containing at least one letter, punctuation stripped from the edges. */
export function wordsOf(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/^[^a-z]+|[^a-z]+$/g, ''))
    .filter(w => /[a-z]/.test(w));
}

/** Words that aren't hesitation sounds. */
export function contentWordCount(transcript: string): number {
  return wordsOf(transcript).filter(w => !NOISE_FILLERS.has(w)).length;
}

/** Letter the next reply must start with: last letter of the last real word. */
export function lastLetterOf(transcript: string): string | null {
  const words = wordsOf(transcript);
  for (let i = words.length - 1; i >= 0; i--) {
    if (NOISE_FILLERS.has(words[i])) continue;
    const letters = words[i].match(/[a-z]/g);
    if (letters) return letters[letters.length - 1];
  }
  return null;
}

/**
 * Checks the answer starts with `letter`. Leading hesitations and discourse
 * markers are skipped, but a marker that itself starts with the letter counts
 * ("So I think…" is fine for S).
 */
export function startsWithLetter(transcript: string, letter: string): { ok: boolean; heardWord: string | null } {
  const target = letter.toLowerCase();
  let heardWord: string | null = null;
  for (const word of wordsOf(transcript)) {
    if (NOISE_FILLERS.has(word)) continue;
    if (word[0] === target) return { ok: true, heardWord: word };
    heardWord ??= word;
    if (LEADING_FILLERS.has(word)) continue;
    return { ok: false, heardWord: word };
  }
  return { ok: false, heardWord };
}

// ---------------------------------------------------------------------------
// Letter choices for the listening check
// ---------------------------------------------------------------------------

/** Letters easy to mix up with each one at the end of a word (by sound or spelling). */
const CONFUSABLE: Record<string, string> = {
  a: 'eoiuy', b: 'pdvm', c: 'kgsq', d: 'tbge', e: 'yiadt', f: 'vpsh', g: 'kcdj',
  h: 'fkse', i: 'yeaj', j: 'gyih', k: 'cgqt', l: 'rnmw', m: 'nlbw', n: 'mlrg',
  o: 'uawe', p: 'bftk', q: 'kcgu', r: 'lneh', s: 'zcxe', t: 'dkpe', u: 'oawy',
  v: 'fbwz', w: 'vuoy', x: 'skzc', y: 'eiaw', z: 'sxvc',
};
/** Common last letters of English words, used to top up the choices. */
const COMMON_ENDINGS = 'estdynrlgkhm';

/** Small seeded random generator, so the same message always gets the same choices. */
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * The correct letter plus `count - 1` easy-to-confuse ones, shuffled.
 * Deterministic per `seed` (the message id), so leaving and coming back shows the same choices.
 */
export function letterChoices(correct: string, seed: string, count = 6): string[] {
  const answer = correct.toLowerCase();
  const pool = [...(CONFUSABLE[answer] ?? ''), ...COMMON_ENDINGS].filter(l => l !== answer);
  const distractors = [...new Set(pool)].slice(0, count - 1);
  const choices = [answer, ...distractors];
  const random = seededRandom(seed);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
