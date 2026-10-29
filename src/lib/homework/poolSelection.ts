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
