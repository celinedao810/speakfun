// Sentence Builder: learners make one sentence per turn from the vocabulary and structures
// on the board (1 vocab item + 1 structure, or 2 vocab items); accepted sentences score 1 point
// per item used and lock those items.
// Pure state + helpers here; the screens live in components/games/sentenceBuilder.

export interface PoolVocab {
  key: string;
  word: string;
  pos: string;
  definition: string;
  example: string;
  lesson: number;        // 1-based position of the source lesson in the class's courses
}

export interface PoolStructure {
  key: string;
  text: string;          // keeps [slot] brackets where known
  pattern: string;       // the saved pattern, as the review game uses it
  intent: string;
  example: string;
  lesson: number;
}

export interface GamePool {
  classId: string;
  className: string;
  lessons: { no: number; title: string }[];
  vocab: PoolVocab[];
  structures: PoolStructure[];
  learners?: string[];   // class roster, teacher only
}

export const BOARD = { vocab: 20, structures: 15 };
/** Below this screen height the longest structures don't fit at 18px, so the board shows 12 instead of 15. */
export const SHORT_SCREEN = { height: 860, structures: 12 };
export const TIMERS = [0, 45, 60, 90] as const;
export type TimerSetting = typeof TIMERS[number];

/** Comparable form of a structure: no brackets, quotes, dash styles or end punctuation. */
export function plainStructure(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[[\]]/g, '')
    .replace(/\s*[—–-]\s*/g, ' - ')
    .replace(/[.?!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const vocabKey = (word: string) => 'v:' + word.toLowerCase().trim();
export const structureKey = (text: string) => 's:' + plainStructure(text);
export const isVocabKey = (k: string) => k.startsWith('v:');

/** The two most recent lessons in the pool come up about twice as often. */
function recentLessons(items: { lesson: number }[]): Set<number> {
  const nos = [...new Set(items.map(x => x.lesson))].sort((a, b) => b - a);
  return new Set(nos.slice(0, 2));
}

/** Weighted draw without replacement (Efraimidis–Spirakis): higher weight, earlier pick. */
export function weightedDraw<T extends { key: string; lesson: number }>(items: T[], n: number, recent: Set<number>, rand = Math.random): string[] {
  return items
    .map(x => ({ key: x.key, rank: Math.pow(rand(), 1 / (recent.has(x.lesson) ? 2 : 1)) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .map(x => x.key);
}

export function drawBoard(pool: GamePool, structures: number = BOARD.structures, rand = Math.random) {
  const recent = recentLessons([...pool.vocab, ...pool.structures]);
  return {
    vocab: weightedDraw(pool.vocab, BOARD.vocab, recent, rand),
    structures: weightedDraw(pool.structures, structures, recent, rand),
  };
}

// ---------------------------------------------------------------------------
// Round state
// ---------------------------------------------------------------------------

interface Snapshot {
  turn: number;
  scores: number[];
  used: Record<string, number>;
  board: { vocab: string[]; structures: string[] };
}

export interface Round extends Snapshot {
  learners: string[];
  timer: TimerSetting;
  selected: string[];
  history: Snapshot[];     // most recent last; Undo pops one
  ended: boolean;
  turnStartedAt: number;   // ms epoch, for the turn timer (survives a refresh)
  lastGain: { learner: number; points: number; at: number } | null;
}

export function newRound(pool: GamePool, learners: string[], timer: TimerSetting, structures: number = BOARD.structures, rand = Math.random): Round {
  return {
    learners, timer,
    turn: 0,
    scores: learners.map(() => 0),
    used: {},
    board: drawBoard(pool, structures, rand),
    selected: [],
    history: [],
    ended: false,
    turnStartedAt: Date.now(),
    lastGain: null,
  };
}

const snap = (r: Round): Snapshot => ({ turn: r.turn, scores: r.scores, used: r.used, board: r.board });

export const available = (r: Round) => ({
  vocab: r.board.vocab.filter(k => !(k in r.used)),
  structures: r.board.structures.filter(k => !(k in r.used)),
});

/** A valid sentence uses at least 1 vocab item and 1 structure, or at least 2 vocab items. */
const validCombo = (vocab: number, structures: number) => (vocab >= 1 && structures >= 1) || vocab >= 2;

export function canAccept(r: Round): boolean {
  const vocab = r.selected.filter(isVocabKey).length;
  return validCombo(vocab, r.selected.length - vocab);
}

export type RoundAction =
  | { type: 'toggle'; key: string }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'pass' }
  | { type: 'undo' }
  | { type: 'shuffle'; pool: GamePool; rand?: () => number }
  | { type: 'end' };

function nextTurn(r: Round, patch: Partial<Round>): Round {
  const next = { ...r, ...patch, history: [...r.history, snap(r)], selected: [],
    turn: (r.turn + 1) % r.learners.length, turnStartedAt: Date.now() };
  const left = available(next);
  // no valid sentence can be made from what's left: the round is over
  if (!validCombo(left.vocab.length, left.structures.length)) next.ended = true;
  return next;
}

export function roundReducer(r: Round, a: RoundAction): Round {
  if (r.ended && a.type !== 'undo') return r;
  switch (a.type) {
    case 'toggle':
      if (a.key in r.used) return r;
      return { ...r, selected: r.selected.includes(a.key) ? r.selected.filter(k => k !== a.key) : [...r.selected, a.key] };
    case 'accept': {
      if (!canAccept(r)) return r;
      const used = { ...r.used };
      r.selected.forEach(k => { used[k] = r.turn; });
      const scores = r.scores.map((s, i) => i === r.turn ? s + r.selected.length : s);
      return nextTurn(r, { used, scores, lastGain: { learner: r.turn, points: r.selected.length, at: Date.now() } });
    }
    case 'reject':
    case 'pass':
      return nextTurn(r, { lastGain: null });
    case 'undo': {
      const prev = r.history[r.history.length - 1];
      if (!prev) return r;
      return { ...r, ...prev, history: r.history.slice(0, -1), selected: [], ended: false,
        turnStartedAt: Date.now(), lastGain: null };
    }
    case 'shuffle': {
      // Used items stay where they are; every available slot gets a fresh item from the unused pool,
      // preferring items not already showing.
      const rand = a.rand ?? Math.random;
      const onBoard = new Set([...r.board.vocab, ...r.board.structures]);
      const refill = (keys: string[], items: (PoolVocab | PoolStructure)[]) => {
        const open = keys.filter(k => !(k in r.used));
        const fresh = items.filter(x => !(x.key in r.used) && !onBoard.has(x.key));
        const candidates = fresh.length >= open.length ? fresh : items.filter(x => !(x.key in r.used));
        const drawn = weightedDraw(candidates, open.length, recentLessons(items), rand);
        let i = 0;
        return keys.map(k => (k in r.used ? k : drawn[i++] ?? k));
      };
      return { ...r, history: [...r.history, snap(r)], selected: [],
        board: { vocab: refill(r.board.vocab, a.pool.vocab), structures: refill(r.board.structures, a.pool.structures) } };
    }
    case 'end':
      // kept in the history so Undo on the results screen goes straight back to the board
      return { ...r, history: [...r.history, snap(r)], ended: true, selected: [] };
  }
}

/** Results: learners by score (ties share a rank), with the items each one used. */
export function ranking(r: Round) {
  const rows = r.learners.map((name, i) => ({
    name, index: i, score: r.scores[i],
    items: Object.entries(r.used).filter(([, who]) => who === i).map(([k]) => k),
  })).sort((a, b) => b.score - a.score);
  return rows.map(row => ({ ...row, rank: rows.findIndex(x => x.score === row.score) + 1 }));
}
