// Validation for hub and topic data. Every write (import, Claude via MCP, restore)
// goes through validateTopic, so the renderer can rely on what it reads:
// gap text really appears in its line, frame indices point at real structures, etc.
// Unknown extra fields are allowed so the format can grow.

import { z } from 'zod';
import type { Hub, Topic } from './types';

const str = z.string();
const nonEmpty = z.string().trim().min(1);

const vocab = z.looseObject({ word: nonEmpty, pos: str, definition: nonEmpty, example: str });
const structure = z.looseObject({
  structure: nonEmpty, intent: nonEmpty, example: nonEmpty,
  alternative: str.optional(), promptSlots: str.optional(),
});
const move = z.looseObject({ name: nonEmpty, purpose: str, frames: z.array(z.number().int().min(0)) });
const scene = z.looseObject({ name: str.nullable(), setting: str.nullable(), moves: z.array(move).min(1) });
const gap = z.looseObject({ text: nonEmpty, frame: z.number().int().min(0) });
const line = z.looseObject({
  role: nonEmpty, text: nonEmpty,
  scene: z.number().int().optional(), part: str.optional(), gaps: z.array(gap).optional(),
});
const dialogue = z.looseObject({ context: str, roles: z.array(nonEmpty).min(1), lines: z.array(line).min(1) });
const speaking = z.looseObject({
  scenario: nonEmpty,
  roles: z.array(z.looseObject({ name: nonEmpty, tasks: z.array(str).min(1) })).min(1),
});

const flowBlock: z.ZodType = z.lazy(() => z.looseObject({
  t: z.enum(['logo', 'h', 'p', 'input', 'btn', 'link', 'or', 'acct', 'list', 'row', 'spin', 'cards']),
  text: str.optional(), sub: str.optional(), primary: z.boolean().optional(),
  icon: str.optional(), click: z.boolean().optional(),
  items: z.array(z.union([str, flowBlock])).optional(),
}));
const flow = z.looseObject({
  title: str.optional(),
  steps: z.array(z.looseObject({
    url: str.optional(), caption: str.optional(), hold: z.number().optional(),
    page: z.array(flowBlock).optional(),
    popup: z.looseObject({ url: str.optional(), blocks: z.array(flowBlock) }).optional(),
  })).min(1),
});

const pronPart = z.discriminatedUnion('kind', [
  z.looseObject({ kind: z.literal('reveal'), items: z.array(z.looseObject({ prompt: str, answer: str })).min(1) }),
  z.looseObject({ kind: z.literal('pairs'), pairs: z.array(z.looseObject({ sounds: str, words: z.array(z.tuple([str, str])) })).min(1) }),
  z.looseObject({ kind: z.literal('rules'), rules: z.array(z.looseObject({ ending: str, rows: z.array(z.looseObject({ sound: str, after: str, ex: str })) })).min(1) }),
  z.looseObject({ kind: z.literal('passage'), text: nonEmpty }),
  z.looseObject({ kind: z.literal('text'), text: nonEmpty }),
  z.looseObject({ kind: z.literal('choice'), items: z.array(z.looseObject({ word: str, link: str, options: z.array(str).min(2), correct: z.number().int().min(0) })).min(1) }),
  z.looseObject({ kind: z.literal('twisters'), items: z.array(z.looseObject({ text: str, ipa: str })).min(1) }),
  z.looseObject({ kind: z.literal('dictation'), chips: z.array(str), items: z.array(z.looseObject({ prompt: str, answer: str })).min(1) }),
]);

const USES = ['context', 'vocabTable', 'vocabulary', 'structures', 'prompts', 'dialogue',
  'speaking', 'homework', 'leadIn', 'prep', 'reading'] as const;

const round = z.looseObject({
  phase: nonEmpty,   // a key of hub.phases; only 'class' rounds count toward class time
  title: nonEmpty,
  min: z.number().min(0),
  group: z.enum(['whole', 'teacher', 'solo']),
  ctx: z.enum(['own', 'shared']).optional(),
  uses: z.enum(USES).optional(),
  how: str.optional(), tell: str.optional(), say: str.optional(),
  parts: z.array(pronPart).optional(),
  game: z.looseObject({ url: nonEmpty, cta: nonEmpty }).optional(),
});

const topicBase = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be lowercase letters, digits and dashes, e.g. "dev-04"'),
  track: nonEmpty,
  order: z.number().int(),
  title: nonEmpty,
  meeting: nonEmpty,
  anchor: str,
  cefr: nonEmpty,
  taughtOn: str.optional(),
  says: nonEmpty,
};

export const speakingTopicSchema = z.looseObject({
  ...topicBase,
  context: z.union([str, z.array(str)]).optional(),
  reading: z.looseObject({ title: str, passage: z.array(str).min(1) }).optional(),
  leadIn: z.array(str).min(1),
  vocabulary: z.array(vocab).min(1),
  structures: z.array(structure).min(1),
  comprehension: z.array(z.looseObject({ q: str, a: str })).optional(),
  speaking,
  homework: nonEmpty,
  dialogue,
  scenes: z.array(scene).optional(),
  moves: z.array(move).optional(),
  flow: flow.optional(),
});

export const pronTopicSchema = z.looseObject({
  ...topicBase,
  rounds: z.array(round).min(1),
  soundNotes: z.array(str).optional(),
});

export const hubSchema = z.looseObject({
  course: z.looseObject({ name: nonEmpty, classSize: z.number().int().positive().optional() }),
  project: z.looseObject({ name: nonEmpty, oneLine: str, modules: z.array(str), timeline: z.array(z.looseObject({ wh: str, wt: str })) }),
  grouping: z.record(z.string(), z.number().nullable()),
  phases: z.record(z.string(), z.looseObject({ title: nonEmpty, blurb: str.optional() })),
  plan: z.array(round).min(1),
  tracks: z.array(nonEmpty).min(1),
  soon: z.record(z.string(), z.array(z.tuple([z.number(), str]))),
  rules: z.looseObject({ teacher: str, welcome: str, rules: z.array(z.looseObject({ title: str, text: str })), reminders: z.array(str) }),
});

function zodErrors(err: z.ZodError): string[] {
  return err.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

/** Structural + cross-reference checks. Returns a list of readable problems (empty = valid). */
export function validateTopic(topic: unknown, hub?: Pick<Hub, 'tracks'> | null): string[] {
  const t = topic as Topic;
  const isPron = !!(t && typeof t === 'object' && 'rounds' in t && t.rounds);
  const parsed = (isPron ? pronTopicSchema : speakingTopicSchema).safeParse(topic);
  if (!parsed.success) return zodErrors(parsed.error);

  const errors: string[] = [];
  if (hub && !hub.tracks.includes(t.track)) {
    errors.push(`track: "${t.track}" is not one of ${hub.tracks.map(x => `"${x}"`).join(', ')}`);
  }
  if (isPron) {
    t.rounds!.forEach((r, i) => {
      if (!r.parts && !r.game) errors.push(`rounds.${i} ("${r.title}"): needs either parts or game`);
      r.parts?.forEach((p, j) => {
        if (p.kind === 'choice') p.items.forEach((x, k) => {
          if (x.correct >= x.options.length) errors.push(`rounds.${i}.parts.${j}.items.${k}: correct=${x.correct} but only ${x.options.length} options`);
        });
      });
    });
    return errors;
  }

  const nFrames = t.structures!.length;
  const frameOk = (ix: number) => ix >= 0 && ix < nFrames;
  const d = t.dialogue!;
  d.lines.forEach((l, i) => {
    if (!d.roles.includes(l.role)) errors.push(`dialogue.lines.${i}: role "${l.role}" is not in dialogue.roles`);
    l.gaps?.forEach((g, j) => {
      if (!l.text.includes(g.text)) errors.push(`dialogue.lines.${i}.gaps.${j}: text "${g.text}" does not appear in the line`);
      if (!frameOk(g.frame)) errors.push(`dialogue.lines.${i}.gaps.${j}: frame ${g.frame} is out of range (0–${nFrames - 1})`);
    });
  });
  const checkMoves = (moves: { name: string; frames: number[] }[], where: string) =>
    moves.forEach((m, i) => m.frames.forEach(ix => {
      if (!frameOk(ix)) errors.push(`${where}.${i} ("${m.name}"): frame ${ix} is out of range (0–${nFrames - 1})`);
    }));
  t.scenes?.forEach((s, i) => checkMoves(s.moves, `scenes.${i}.moves`));
  if (t.moves) checkMoves(t.moves, 'moves');

  // When a topic has moves, each frame belongs to exactly one of them: the frame walkthrough
  // and the role-play follow the moves, so a frame in two moves is taught twice and a frame
  // in none is never taught.
  const allMoves = [...(t.scenes ?? []).flatMap(s => s.moves), ...(t.moves ?? [])];
  if (allMoves.length) {
    const homes = new Map<number, string[]>();
    allMoves.forEach(m => m.frames.forEach(ix => homes.set(ix, [...(homes.get(ix) ?? []), m.name])));
    t.structures!.forEach((f, ix) => {
      const h = homes.get(ix) ?? [];
      if (h.length === 0) errors.push(`structures.${ix} ("${f.structure}"): not in any move; add it to the move where it's used`);
      if (h.length > 1) errors.push(`structures.${ix} ("${f.structure}"): in ${h.length} moves (${h.join(', ')}); a frame belongs to exactly one move`);
    });
  }

  const words = new Map<string, number>();
  t.vocabulary!.forEach(v => words.set(normWord(v.word), (words.get(normWord(v.word)) ?? 0) + 1));
  for (const [w, n] of words) if (n > 1) errors.push(`vocabulary: "${w}" is listed ${n} times in this topic`);

  if (!t.context && !t.reading) errors.push('context or reading: one is required (the opening round shows it)');
  return errors;
}

const normWord = (w: string) => w.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * House rule: a word is taught once per track. Tracks are separate cohorts, so the same
 * word in another track is fine. `others` is every saved topic; the topic itself is skipped.
 */
export function trackDuplicates(topic: Topic, others: Topic[]): string[] {
  if (!topic.vocabulary) return [];
  const taughtIn = new Map<string, string>();
  for (const o of others) {
    if (o.id === topic.id || o.track !== topic.track) continue;
    for (const v of o.vocabulary ?? []) taughtIn.set(normWord(v.word), o.id);
  }
  return topic.vocabulary.flatMap(v => {
    const other = taughtIn.get(normWord(v.word));
    return other
      ? [`vocabulary: "${v.word}" is already taught in ${other} (same track, ${topic.track}). Pick a different word, or remove it from ${other} first.`]
      : [];
  });
}

export function validateHub(hub: unknown): string[] {
  const parsed = hubSchema.safeParse(hub);
  if (!parsed.success) return zodErrors(parsed.error);
  const h = hub as Hub;
  return h.plan.flatMap((r, i) => r.phase in h.phases ? []
    : [`plan.${i}.phase: "${r.phase}" is not one of the hub's phases (${Object.keys(h.phases).join(', ')})`]);
}
