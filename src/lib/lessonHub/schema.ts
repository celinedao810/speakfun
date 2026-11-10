// Validation for hub and topic data. Every write (import, Claude via MCP, restore)
// goes through validateTopic, so the renderer can rely on what it reads:
// gap text really appears in its line, frame indices point at real structures, etc.
// Unknown extra fields are allowed so the format can grow.

import { z } from 'zod';
import type { Hub, InterviewBank, Topic } from './types';

const str = z.string();
const nonEmpty = z.string().trim().min(1);

const vocab = z.looseObject({ word: nonEmpty, pos: str, definition: nonEmpty, example: str, ipa: str.nullable().optional() });
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

const explainItem = z.looseObject({ h: str, t: str.optional(), ex: z.union([str, z.array(str)]).optional() });
const stressWord = z.looseObject({ word: str, syllables: z.array(str).min(1), natural: z.number().int().min(0), ipa: str });
const wordForm = z.looseObject({ s: str, ipa: str, g: str });

const pronPart = z.discriminatedUnion('kind', [
  z.looseObject({ kind: z.literal('reveal'), items: z.array(z.looseObject({ prompt: str, answer: str })).min(1) }),
  z.looseObject({ kind: z.literal('pairs'), pairs: z.array(z.looseObject({ sounds: str, words: z.array(z.tuple([str, str])) })).min(1) }),
  z.looseObject({ kind: z.literal('rules'), rules: z.array(z.looseObject({ ending: str, rows: z.array(z.looseObject({ sound: str, after: str, ex: str })) })).min(1) }),
  z.looseObject({ kind: z.literal('passage'), text: nonEmpty }),
  z.looseObject({ kind: z.literal('text'), text: nonEmpty }),
  z.looseObject({ kind: z.literal('choice'), items: z.array(z.looseObject({ word: str, link: str, options: z.array(str).min(2), correct: z.number().int().min(0) })).min(1) }),
  z.looseObject({ kind: z.literal('twisters'), items: z.array(z.looseObject({ text: str, ipa: str })).min(1) }),
  z.looseObject({ kind: z.literal('dictation'), chips: z.array(str), items: z.array(z.looseObject({ prompt: str, answer: str })).min(1) }),
  z.looseObject({ kind: z.literal('explain'), items: z.array(explainItem).min(1) }),
  z.looseObject({ kind: z.literal('columns'), cols: z.array(z.looseObject({ h: str, note: str, lines: z.array(str) })).min(1) }),
  z.looseObject({ kind: z.literal('stressguide'), items: z.array(explainItem).min(1), words: z.array(stressWord).min(1) }),
  z.looseObject({ kind: z.literal('stressdemo'), words: z.array(stressWord).min(1) }),
  z.looseObject({ kind: z.literal('wordbank'), items: z.array(z.looseObject({ word: str, noun: wordForm, verb: wordForm })).min(1) }),
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

/* ---------------- interview topics ---------------- */

const frame = z.looseObject({ structure: nonEmpty, example: nonEmpty, alternative: str.nullable().optional() });
const frameworkStep = z.looseObject({
  name: nonEmpty, purpose: str.optional(),
  frames: z.array(frame).min(1, 'every step needs at least one frame'),
});
const framework = z.looseObject({
  id: nonEmpty, name: nonEmpty, flow: nonEmpty,
  length: str.optional(), why: str.optional(), notes: z.array(str).optional(), modelQuestion: str.optional(),
  steps: z.array(frameworkStep).min(1, 'a framework needs at least one step'),
  modelAnswer: z.looseObject({ persona: str.optional(), paragraphs: z.array(nonEmpty).min(1, 'the model answer needs at least one paragraph') }),
  buildOwn: str.optional(),
});
const segment = z.looseObject({
  title: nonEmpty,
  min: z.number().min(0).optional(),
  phase: nonEmpty.optional(),
  group: z.enum(['whole', 'teacher', 'solo']).optional(),
  uses: nonEmpty,
  how: str.optional(), tell: str.optional(), say: str.optional(),
});

export const interviewTopicSchema = z.looseObject({
  id: topicBase.id,
  kind: z.literal('interview'),
  track: nonEmpty,
  order: z.number().int(),
  title: nonEmpty,
  cefr: str.optional(),
  says: str.optional(),
  goal: str.optional(),
  meeting: str.optional(),
  anchor: str.optional(),
  taughtOn: str.optional(),
  leadIn: z.array(str).optional(),
  segments: z.array(segment).min(1),
  frameworks: z.array(framework).min(1),
  homework: nonEmpty,
});

/* ---------------- interview question bank ---------------- */

const bankQuestion = z.looseObject({ id: nonEmpty, text: nonEmpty, mandatory: z.boolean().optional(), framework: str.optional() });
const bankGroup = z.looseObject({ id: nonEmpty, name: nonEmpty, framework: str.optional(), questions: z.array(bankQuestion) });
const bankRound = z.looseObject({ id: nonEmpty, name: nonEmpty, groups: z.array(bankGroup).min(1) });
const interviewBank = z.looseObject({ rounds: z.array(bankRound).min(1) });

export const hubSchema = z.looseObject({
  course: z.looseObject({ name: nonEmpty, classSize: z.number().int().positive().optional() }),
  project: z.looseObject({ name: nonEmpty, oneLine: str, modules: z.array(str), timeline: z.array(z.looseObject({ wh: str, wt: str })) }),
  grouping: z.record(z.string(), z.number().nullable()),
  phases: z.record(z.string(), z.looseObject({ title: nonEmpty, blurb: str.optional() })),
  plan: z.array(round).min(1),
  tracks: z.array(nonEmpty).min(1),
  soon: z.record(z.string(), z.array(z.tuple([z.number(), str]))),
  rules: z.looseObject({ teacher: str, welcome: str, rules: z.array(z.looseObject({ title: str, text: str })), reminders: z.array(str) }),
  interviewBanks: z.record(z.string(), interviewBank).optional(),
});

function zodErrors(err: z.ZodError): string[] {
  return err.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

type HubRefs = Pick<Hub, 'tracks'> & Partial<Pick<Hub, 'phases' | 'interviewBanks'>>;

export const isInterviewTopic = (t: unknown) => !!(t && typeof t === 'object' && (t as Topic).kind === 'interview');

/** Structural + cross-reference checks. Returns a list of readable problems (empty = valid). */
export function validateTopic(topic: unknown, hub?: HubRefs | null): string[] {
  if (isInterviewTopic(topic)) return validateInterviewTopic(topic, hub);
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
        if (p.kind === 'stressguide' || p.kind === 'stressdemo') p.words.forEach((w, k) => {
          if (w.natural >= w.syllables.length) errors.push(`rounds.${i}.parts.${j}.words.${k}: natural=${w.natural} but "${w.word}" has only ${w.syllables.length} syllables`);
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
  const frames = new Map<string, number[]>();
  t.structures!.forEach((f, ix) => frames.set(normFrame(f.structure), [...(frames.get(normFrame(f.structure)) ?? []), ix]));
  for (const ixs of frames.values()) if (ixs.length > 1) {
    errors.push(`structures.${ixs.join(', ')}: the same frame ("${t.structures![ixs[0]].structure}") is listed ${ixs.length} times in this topic`);
  }

  if (!t.context && !t.reading) errors.push('context or reading: one is required (the opening round shows it)');
  return errors;
}

const normWord = (w: string) => w.toLowerCase().replace(/\s+/g, ' ').trim();

/** Frames match when the wording is the same, whatever the slots are called and ignoring final punctuation. */
const normFrame = (f: string) => f.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\[[^\]]*\]/g, '[]')
  .replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');

/** Every sentence frame a topic teaches, with where it sits: speaking structures and interview framework frames alike. */
function framesOf(t: Topic): { structure: string; where: string }[] {
  return [
    ...(t.structures ?? []).map((f, i) => ({ structure: f.structure, where: `structures.${i}` })),
    ...(t.frameworks ?? []).flatMap((fw, i) => (fw.steps ?? []).flatMap((s, j) => (s.frames ?? []).map((f, k) =>
      ({ structure: f.structure, where: `frameworks.${i}.steps.${j}.frames.${k} (${fw.id} · ${s.name})` })))),
  ];
}

/**
 * Interview topics: segments in place of the fixed plan, frameworks in place of vocabulary,
 * structures and dialogue. Bank references are checked against the hub's bank for the track.
 */
function validateInterviewTopic(topic: unknown, hub?: HubRefs | null): string[] {
  const parsed = interviewTopicSchema.safeParse(topic);
  if (!parsed.success) return zodErrors(parsed.error);
  const t = topic as Topic;
  const errors: string[] = [];
  if (hub && !hub.tracks.includes(t.track)) {
    errors.push(`track: "${t.track}" is not one of ${hub.tracks.map(x => `"${x}"`).join(', ')}`);
  }
  const bank = hub?.interviewBanks?.[t.track];
  const fws = t.frameworks!;
  const fwIds = new Set<string>();
  fws.forEach((f, i) => {
    if (fwIds.has(f.id)) errors.push(`frameworks.${i}: id "${f.id}" is used twice in this topic`);
    fwIds.add(f.id);
  });

  const used = new Set<string>();
  t.segments!.forEach((s, i) => {
    const at = `segments.${i} ("${s.title}")`;
    if (s.phase && hub?.phases && !(s.phase in hub.phases)) {
      errors.push(`${at}: phase "${s.phase}" is not one of the hub's phases (${Object.keys(hub.phases).join(', ')})`);
    }
    const u = s.uses as string;
    if (u.startsWith('framework:')) {
      const id = u.slice('framework:'.length);
      if (!fwIds.has(id)) errors.push(`${at}: uses framework "${id}", which is not in this topic's frameworks (${[...fwIds].join(', ')})`);
      used.add(id);
    } else if (u === 'questionBank') {
      if (hub && !bank) errors.push(`${at}: uses the question bank, but the hub has no interviewBanks entry for "${t.track}"`);
    } else if (u === 'leadIn') {
      if (!t.leadIn?.length) errors.push(`${at}: uses leadIn, but the topic has no leadIn questions`);
    } else if (u !== 'homework') {
      errors.push(`${at}: uses must be leadIn, questionBank, framework:<id> or homework, not "${u}"`);
    }
  });
  fws.forEach((f, i) => {
    if (!used.has(f.id)) errors.push(`frameworks.${i} ("${f.id}"): no segment uses it; add a segment with uses "framework:${f.id}"`);
    if (f.modelQuestion && hub) {
      if (!bank) errors.push(`frameworks.${i}.modelQuestion: "${f.modelQuestion}" needs a question bank for "${t.track}"`);
      else if (!bank.rounds.some(r => r.groups.some(g => g.questions.some(q => q.id === f.modelQuestion)))) {
        errors.push(`frameworks.${i}.modelQuestion: "${f.modelQuestion}" is not a question in the ${t.track} bank`);
      }
    }
  });

  const seen = new Map<string, string>();
  framesOf(t).forEach(f => {
    const k = normFrame(f.structure);
    const first = seen.get(k);
    if (first) errors.push(`${f.where}: the same frame ("${f.structure}") is already at ${first} in this topic`);
    else seen.set(k, f.where);
  });
  return errors;
}

/**
 * House rules: within a track, a word is taught once and a frame is used once. Frames may be
 * paraphrased but not repeated word for word, whether they sit in a speaking topic's structures
 * or an interview framework. An interview framework is taught in one topic only. Tracks are
 * separate cohorts, so repeats across tracks are fine. `others` is every saved topic; the topic
 * itself is skipped.
 */
export function trackDuplicates(topic: Topic, others: Topic[]): string[] {
  const wordIn = new Map<string, string>(), frameIn = new Map<string, string>(), fwIn = new Map<string, string>();
  for (const o of others) {
    if (o.id === topic.id || o.track !== topic.track) continue;
    for (const v of o.vocabulary ?? []) wordIn.set(normWord(v.word), o.id);
    for (const f of framesOf(o)) frameIn.set(normFrame(f.structure), o.id);
    for (const f of o.frameworks ?? []) fwIn.set(f.id, o.id);
  }
  const where = `same track, ${topic.track}`;
  return [
    ...(topic.vocabulary ?? []).flatMap(v => {
      const other = wordIn.get(normWord(v.word));
      return other ? [`vocabulary: "${v.word}" is already taught in ${other} (${where}). Pick a different word, or remove it from ${other} first.`] : [];
    }),
    ...framesOf(topic).flatMap(f => {
      const other = frameIn.get(normFrame(f.structure));
      return other ? [`${f.where}: "${f.structure}" is already used in ${other} (${where}). Paraphrase it, or change it in ${other} first.`] : [];
    }),
    ...(topic.frameworks ?? []).flatMap(f => {
      const other = fwIn.get(f.id);
      return other ? [`frameworks: "${f.id}" is already taught in ${other} (${where}). A framework is taught in one topic; give this one a new id.`] : [];
    }),
  ];
}

/** Question bank rules, per track. */
export function validateBanks(banks: Record<string, InterviewBank>, tracks?: string[]): string[] {
  const errors: string[] = [];
  for (const [track, bank] of Object.entries(banks)) {
    const at = `interviewBanks.${track}`;
    if (tracks && !tracks.includes(track)) errors.push(`${at}: "${track}" is not one of the hub's tracks (${tracks.join(', ')})`);
    const qIds = new Map<string, string>();
    const roundIds = new Set<string>();
    bank.rounds.forEach((r, ri) => {
      const rAt = `${at}.rounds.${ri} ("${r.id}")`;
      if (roundIds.has(r.id)) errors.push(`${rAt}: round id is used twice`);
      roundIds.add(r.id);
      const groupIds = new Set<string>();
      r.groups.forEach((g, gi) => {
        const gAt = `${rAt}.groups.${gi} ("${g.id}")`;
        if (groupIds.has(g.id)) errors.push(`${gAt}: group id is used twice in this round`);
        groupIds.add(g.id);
        g.questions.forEach((q, qi) => {
          const qAt = `${gAt}.questions.${qi} ("${q.id}")`;
          const prev = qIds.get(q.id);
          if (prev) errors.push(`${qAt}: id is already used at ${prev}; question ids are unique across the track's bank`);
          else qIds.set(q.id, qAt);
          if (!g.framework && !q.framework) errors.push(`${qAt}: the group has no framework, so the question needs its own "framework"`);
        });
      });
    });
  }
  return errors;
}

/** Not errors: bank groups may point at frameworks whose topic isn't written yet. */
export function bankWarnings(banks: Record<string, InterviewBank>, topics: Topic[]): string[] {
  const out: string[] = [];
  for (const [track, bank] of Object.entries(banks)) {
    const built = new Set(topics.filter(t => t.track === track).flatMap(t => (t.frameworks ?? []).map(f => f.id)));
    const wanted = new Set(bank.rounds.flatMap(r => r.groups.flatMap(g => [g.framework, ...g.questions.map(q => q.framework)])).filter(Boolean) as string[]);
    const missing = [...wanted].filter(f => !built.has(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (missing.length) out.push(`${track}: frameworks not built in any topic yet: ${missing.join(', ')}`);
  }
  return out;
}

export function validateHub(hub: unknown): string[] {
  const parsed = hubSchema.safeParse(hub);
  if (!parsed.success) return zodErrors(parsed.error);
  const h = hub as Hub;
  return [
    ...h.plan.flatMap((r, i) => r.phase in h.phases ? []
      : [`plan.${i}.phase: "${r.phase}" is not one of the hub's phases (${Object.keys(h.phases).join(', ')})`]),
    ...(h.interviewBanks ? validateBanks(h.interviewBanks, h.tracks) : []),
  ];
}
