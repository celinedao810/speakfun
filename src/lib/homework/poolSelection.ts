/** Unbiased in-place-free shuffle (Fisher–Yates). `arr.sort(() => Math.random() - 0.5)` is
 *  NOT uniform: it largely preserves the input order, so the first items keep winning. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Orders items so a daily pool rotates through everything that isn't mastered:
 * never-practised items first, then the least recently practised. Ties (items last seen in
 * the same session share a timestamp) are broken randomly.
 */
export function orderByRotation<T>(items: readonly T[], lastSeenAt: (item: T) => string | undefined): T[] {
  return shuffle(items).sort((a, b) => {
    const la = lastSeenAt(a);
    const lb = lastSeenAt(b);
    if (!la && !lb) return 0;
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}

/** Share of the pool reserved for items the learner got wrong last time. */
const WRONG_SHARE = 1 / 3;

/**
 * Builds a daily pool from the unmastered items:
 *   1. up to ~1/3 of the slots go to items whose latest attempt was wrong (retry them),
 *      least recently practised first;
 *   2. the remaining slots are split evenly between never-practised items and practised
 *      ones (least recently practised first), so new material keeps arriving while
 *      earlier material keeps being revisited;
 *   3. a group that is short donates its unused slots to the others.
 */
export function pickPool<T>(
  items: readonly T[],
  limit: number,
  info: (item: T) => { lastSeenAt?: string; lastAttemptCorrect?: boolean },
): T[] {
  const wrong: T[] = [];
  const fresh: T[] = [];
  const practised: T[] = [];
  for (const item of items) {
    const { lastSeenAt, lastAttemptCorrect } = info(item);
    if (!lastSeenAt) fresh.push(item);
    else if (lastAttemptCorrect === false) wrong.push(item);
    else practised.push(item);
  }
  const seen = (item: T) => info(item).lastSeenAt;
  const wrongQ = orderByRotation(wrong, seen);
  const freshQ = shuffle(fresh);
  const practisedQ = orderByRotation(practised, seen);

  const wrongTake = Math.min(wrongQ.length, Math.ceil(limit * WRONG_SHARE));
  const rest = limit - wrongTake;
  const freshTake = Math.min(freshQ.length, Math.ceil(rest / 2));
  const practisedTake = Math.min(practisedQ.length, rest - freshTake);

  const picked = [
    ...wrongQ.slice(0, wrongTake),
    ...freshQ.slice(0, freshTake),
    ...practisedQ.slice(0, practisedTake),
  ];
  // Backfill leftover slots from whatever is still unused, new material first.
  const leftover = [
    ...freshQ.slice(freshTake),
    ...practisedQ.slice(practisedTake),
    ...wrongQ.slice(wrongTake),
  ];
  return [...picked, ...leftover.slice(0, Math.max(0, limit - picked.length))];
}
