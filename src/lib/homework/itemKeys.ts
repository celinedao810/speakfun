/**
 * Vocab and structure IDs ("v1", "s1", ...) are generated per lesson, so the same ID
 * exists in every lesson. An item is only identified by lesson + ID — always use this key
 * (never a bare `item.id`) for maps, sets, comparisons, React keys and anything persisted.
 */
export const itemKey = (lessonId: string, itemId: string): string => `${lessonId}:${itemId}`;
