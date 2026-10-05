/**
 * Decides which candidate word (if any) a transcript contains.
 *
 * Matching happens here, in code, rather than in the model: when Gemini is shown
 * the candidate list it tends to "hear" one of those words in noise or silence.
 * So the clip is transcribed blind and only then compared against the words.
 */

/** Lowercase letters, digits and single spaces only. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * A plural is a fair attempt at the word ("user stories" for "user story"), but
 * "-ies" is three letters off "-y", so compare the singular form as well.
 */
function spokenSimilarity(spoken: string, target: string): number {
  let singular = spoken;
  if (spoken.endsWith('ies')) singular = spoken.slice(0, -3) + 'y';
  else if (spoken.endsWith('s') && !target.endsWith('s')) singular = spoken.slice(0, -1);
  return Math.max(similarity(spoken, target), similarity(singular, target));
}

/**
 * At most a quarter of the letters may differ. That makes 3-letter words exact (one
 * letter off "bug" is "but", which learners say all the time), lets "back lock" count
 * for "backlog" (a devoiced final /g/ is still a fair attempt), but turns away
 * near-misses like "we go around" for "workaround".
 */
const MIN_SIMILARITY = 0.75;

interface SpokenMatch {
  word: string;
  similarity: number;
  /** Token span in the transcript, so two candidates can't claim the same speech. */
  start: number;
  end: number;
}

/**
 * Returns every candidate the transcript contains. Learners often say several words
 * in one breath ("database priority feedback backlog"), and each one should count.
 */
export function matchSpokenWords(
  transcript: string,
  candidates: string[],
): Array<{ word: string; similarity: number }> {
  const tokens = normalise(transcript).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  // Best-scoring span for each candidate
  const found: SpokenMatch[] = [];
  for (const word of candidates) {
    const wordTokens = normalise(word).split(' ').filter(Boolean);
    const target = wordTokens.join('');
    if (!target) continue;
    const n = wordTokens.length;

    // Compare against runs of n-1..n+1 transcript tokens joined without spaces, so
    // "data base" still matches "database" and "userstory" matches "user story".
    let best: SpokenMatch | null = null;
    for (let len = Math.max(1, n - 1); len <= n + 1; len++) {
      for (let i = 0; i + len <= tokens.length; i++) {
        const s = spokenSimilarity(tokens.slice(i, i + len).join(''), target);
        if (s >= MIN_SIMILARITY && (!best || s > best.similarity)) {
          best = { word, similarity: s, start: i, end: i + len };
        }
      }
    }
    if (best) found.push(best);
  }

  // Strongest matches claim their words first; a weaker match on the same words loses.
  found.sort((a, b) => b.similarity - a.similarity);
  const accepted: SpokenMatch[] = [];
  for (const m of found) {
    if (!accepted.some(a => m.start < a.end && a.start < m.end)) accepted.push(m);
  }
  return accepted.map(({ word, similarity }) => ({ word, similarity }));
}
