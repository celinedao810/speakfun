/**
 * `is_committed` is only recomputed when an item is practised, so after a teacher lowers the
 * threshold, items already past it would stay "still learning" (and keep being served) until
 * their next correct answer. Judge mastery against the class's current threshold instead.
 */
export const isMastered = (isCommitted: boolean | undefined, correctCount: number, threshold: number): boolean =>
  !!isCommitted || correctCount >= threshold;
