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
