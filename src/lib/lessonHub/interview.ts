// Interview prep: the rules for a learner's picks, shared by the teacher screens and the
// MCP connector. Pure functions over the track's bank and one learner's selection record.
//
// The technical round is a chain per learner: project intake → mandatory project pitch →
// picked drill-down questions filled from that project → the teacher's follow-ups.

import type {
  BankGroup, BankQuestion, BankRound, CustomQuestion, Framework, InterviewBank, InterviewSelection,
  IntakeValues, QuestionPick, Topic,
} from './types';

/* ---------------- the bank ---------------- */

export interface BankEntry { q: BankQuestion; round: BankRound; group: BankGroup; framework: string | null }

export const frameworkOf = (q: BankQuestion, g: BankGroup): string | null => g.framework ?? q.framework ?? null;

export function bankIndex(bank: InterviewBank | null | undefined): Map<string, BankEntry> {
  const m = new Map<string, BankEntry>();
  bank?.rounds.forEach(round => round.groups.forEach(group => group.questions.forEach(q =>
    m.set(q.id, { q, round, group, framework: frameworkOf(q, group) }))));
  return m;
}

/** The [slot] names in a question, in order. */
export const slotMarkers = (text: string) => [...text.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

/** Question text split for display: plain text, and slots with their value when one is filled in. */
export function questionParts(text: string, values?: Record<string, string>): ({ text: string } | { slot: string; value: string | null })[] {
  return text.split(/\[([^\]]+)\]/g).map((p, i) => {
    if (i % 2 === 0) return { text: p };
    const v = values?.[p]?.trim();
    return { slot: p, value: v || null };
  }).filter(p => !('text' in p) || p.text);
}

/** The question as a sentence: filled slots replaced by their values, empty ones left as [slot]. */
export const fillQuestion = (text: string, values?: Record<string, string>) =>
  questionParts(text, values).map(p => 'text' in p ? p.text : p.value ?? `[${p.slot}]`).join('');

const isEmpty = (s: string | undefined | null) => !s || !s.trim();

/** Natural order for framework ids: F2 before F10. */
export const byFrameworkId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Framework names from the interview topics of a track, keyed by id. */
export function frameworkNames(topics: Topic[], track: string): Record<string, string> {
  const out: Record<string, string> = {};
  topics.filter(t => t.kind === 'interview' && t.track === track)
    .forEach(t => (t.frameworks ?? []).forEach((f: Framework) => { out[f.id] = f.name; }));
  return out;
}

/** Every framework the bank or the topics know, with the best name: the topic's, else the bank group's. */
export function allFrameworkNames(bank: InterviewBank | null | undefined, names: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  bank?.rounds.forEach(r => r.groups.forEach(g => {
    if (g.framework) out[g.framework] = g.name;
    g.questions.forEach(q => { if (q.framework && !(q.framework in out)) out[q.framework] = ''; });
  }));
  return { ...out, ...names };
}

export const frameworkLabel = (id: string, names: Record<string, string>) => names[id] ? `${id} · ${names[id]}` : id;

export function frameworkOptions(bank: InterviewBank | null | undefined, names: Record<string, string>): { id: string; label: string }[] {
  const all = allFrameworkNames(bank, names);
  return Object.keys(all).sort(byFrameworkId).map(id => ({ id, label: frameworkLabel(id, all) }));
}

/* ---------------- one learner's selection ---------------- */

export function emptySelection(classId: string, learnerId: string, track: string): InterviewSelection {
  return { classId, learnerId, track, intake: {}, intakeUpdatedAt: null, intakeChanged: false, picks: [], custom: [], updatedAt: null };
}

/** Mandatory questions are always picked, first in their round. */
export function withMandatory(sel: InterviewSelection, bank: InterviewBank): InterviewSelection {
  const have = new Set(sel.picks.map(p => p.questionId));
  const missing: QuestionPick[] = [];
  bank.rounds.forEach(r => r.groups.forEach(g => g.questions.forEach(q => {
    if (q.mandatory && !have.has(q.id)) missing.push({ questionId: q.id, round: r.id, text: q.text });
  })));
  return missing.length ? { ...sel, picks: [...missing, ...sel.picks] } : sel;
}

const roundOfPick = (p: QuestionPick, idx: Map<string, BankEntry>) => idx.get(p.questionId)?.round.id ?? p.round ?? null;

/** Items that take one of a round's places: mandatory + bank picks + requested questions. */
export function roundCount(sel: InterviewSelection, bank: InterviewBank, roundId: string): number {
  const idx = bankIndex(bank);
  return sel.picks.filter(p => roundOfPick(p, idx) === roundId).length
    + sel.custom.filter(c => c.round === roundId && c.kind === 'requested').length;
}

/** Null when one more item fits in the round, otherwise the message to show. */
export function roundFull(sel: InterviewSelection, bank: InterviewBank, roundId: string): string | null {
  const r = bank.rounds.find(x => x.id === roundId);
  if (!r) return `No round "${roundId}" in the bank.`;
  return roundCount(sel, bank, roundId) >= r.pick ? `${r.name} already has ${r.pick} questions — remove one first` : null;
}

const touch = (sel: InterviewSelection, now: string): InterviewSelection => ({ ...sel, updatedAt: now });

/** Slot values to start a template with: the ones that come from the learner's intake. */
function slotsFromIntake(q: BankQuestion, intake: IntakeValues): Record<string, string> | undefined {
  if (!q.slots?.length) return undefined;
  const out: Record<string, string> = {};
  q.slots.forEach(s => { out[s.name] = s.fromIntake && !isEmpty(intake[s.fromIntake]) ? intake[s.fromIntake].trim() : ''; });
  return out;
}

export type Result = { sel: InterviewSelection; error?: string };

/** Tick or untick a bank question. Mandatory questions stay; a full round refuses one more. */
export function togglePick(sel: InterviewSelection, bank: InterviewBank, questionId: string, now: string): Result {
  const e = bankIndex(bank).get(questionId);
  const picked = sel.picks.some(p => p.questionId === questionId);
  if (e?.q.mandatory) return { sel };
  if (picked) return { sel: touch({ ...sel, picks: sel.picks.filter(p => p.questionId !== questionId) }, now) };
  if (!e) return { sel, error: `Question ${questionId} is not in the bank.` };
  const full = roundFull(sel, bank, e.round.id);
  if (full) return { sel, error: full };
  const pick: QuestionPick = { questionId, round: e.round.id, text: e.q.text, pickedAt: now };
  const slotValues = slotsFromIntake(e.q, sel.intake);
  if (slotValues) pick.slotValues = slotValues;
  return { sel: touch({ ...sel, picks: [...sel.picks, pick] }, now) };
}

export function setSlot(sel: InterviewSelection, questionId: string, slot: string, value: string, now: string): InterviewSelection {
  return touch({ ...sel, picks: sel.picks.map(p => p.questionId !== questionId ? p
    : { ...p, slotValues: { ...p.slotValues, [slot]: value } }) }, now);
}

/**
 * Save the learner's project intake. Empty slots that come from the intake are filled from it;
 * slots that already have a value are never overwritten. If an intake field that filled slots
 * changes, the record is flagged so the teacher can check those questions.
 */
export function saveIntake(sel: InterviewSelection, bank: InterviewBank, intake: IntakeValues, now: string): InterviewSelection {
  const clean: IntakeValues = {};
  Object.entries(intake).forEach(([k, v]) => { if (!isEmpty(v)) clean[k] = v.trim(); });
  const prev = sel.intake;
  const idx = bankIndex(bank);
  let changed = false;
  const picks = sel.picks.map(p => {
    const q = idx.get(p.questionId)?.q;
    if (!q?.slots?.some(s => s.fromIntake)) return p;
    const values = { ...p.slotValues };
    q.slots.forEach(s => {
      if (!s.fromIntake) return;
      const next = clean[s.fromIntake] ?? '';
      if (isEmpty(values[s.name])) { if (next) values[s.name] = next; return; }
      const before = prev[s.fromIntake] ?? '';
      if (before && before !== next && values[s.name].trim() !== next) changed = true;
    });
    return { ...p, slotValues: values };
  });
  const fieldsChanged = [...new Set([...Object.keys(prev), ...Object.keys(clean)])]
    .some(k => (prev[k] ?? '') !== (clean[k] ?? ''));
  return {
    ...sel, intake: clean, picks,
    intakeUpdatedAt: fieldsChanged ? now : sel.intakeUpdatedAt,
    intakeChanged: sel.intakeChanged || changed,
    updatedAt: now,
  };
}

export interface CustomInput { round: string; kind: CustomQuestion['kind']; text: string; framework?: string; parentId?: string }

export function addCustom(sel: InterviewSelection, bank: InterviewBank, input: CustomInput): Result & { id?: string } {
  const text = input.text.trim();
  if (!text) return { sel, error: 'Write the question first.' };
  if (input.kind === 'requested') {
    const full = roundFull(sel, bank, input.round);
    if (full) return { sel, error: full };
  }
  const used = new Set(sel.custom.map(c => c.id));
  let n = sel.custom.length + 1;
  while (used.has(`c-${n}`)) n++;
  const c: CustomQuestion = { id: `c-${n}`, round: input.round, kind: input.kind, text };
  if (input.framework) c.framework = input.framework;
  if (input.kind === 'follow-up' && input.parentId) c.parentId = input.parentId;
  return { sel: { ...sel, custom: [...sel.custom, c] }, id: c.id };
}

export const removeCustom = (sel: InterviewSelection, id: string, now: string) =>
  touch({ ...sel, custom: sel.custom.filter(c => c.id !== id) }, now);

/** A requested question becomes a bank question: a new id in the chosen group, and a normal pick for this learner. */
export function promoteToBank(
  bank: InterviewBank, sel: InterviewSelection, customId: string, roundId: string, groupId: string,
  framework: string | undefined, now: string,
): { bank: InterviewBank; sel: InterviewSelection; questionId: string } | { error: string } {
  const c = sel.custom.find(x => x.id === customId && x.kind === 'requested');
  if (!c) return { error: 'Only a requested question can be added to the bank.' };
  const round = bank.rounds.find(r => r.id === roundId);
  const group = round?.groups.find(g => g.id === groupId);
  if (!round || !group) return { error: 'Pick a round and a group.' };
  if (!group.framework && !(framework || c.framework)) return { error: `"${group.name}" has no framework of its own, so the question needs one.` };
  if (roundId !== c.round) {
    const full = roundFull(sel, bank, roundId);
    if (full) return { error: full };
  }
  const idx = bankIndex(bank);
  const prefix = roundId.charAt(0);
  let n = group.questions.length + 1;
  while (idx.has(`${prefix}-${groupId}-${n}`)) n++;
  const questionId = `${prefix}-${groupId}-${n}`;
  const q: BankQuestion = { id: questionId, text: c.text };
  if (!group.framework) q.framework = framework || c.framework;
  const next: InterviewBank = {
    ...bank,
    rounds: bank.rounds.map(r => r.id !== roundId ? r : {
      ...r, groups: r.groups.map(g => g.id !== groupId ? g : { ...g, questions: [...g.questions, q] }),
    }),
  };
  return {
    bank: next,
    questionId,
    sel: touch({
      ...sel,
      custom: sel.custom.filter(x => x.id !== customId)
        // follow-ups that hung off the requested question now hang off the bank question
        .map(x => x.parentId === customId ? { ...x, parentId: questionId } : x),
      picks: [...sel.picks, { questionId, round: roundId, text: c.text, pickedAt: now }],
    }, now),
  };
}

/* ---------------- flags and the resolved view ---------------- */

export const requiredIntake = (bank: InterviewBank) => bank.intake.filter(f => f.required ?? true);

export interface Flags { intakeMissing: boolean; slotsToFill: boolean; intakeChanged: boolean; removedFromBank: number }

export function flagsFor(sel: InterviewSelection, bank: InterviewBank): Flags {
  const idx = bankIndex(bank);
  return {
    intakeMissing: bank.rounds.some(r => r.usesIntake) && requiredIntake(bank).some(f => isEmpty(sel.intake[f.key])),
    slotsToFill: sel.picks.some(p => (idx.get(p.questionId)?.q.slots ?? []).some(s => isEmpty(p.slotValues?.[s.name]))),
    intakeChanged: sel.intakeChanged,
    removedFromBank: sel.picks.filter(p => !idx.has(p.questionId)).length,
  };
}

export function flagLabels(f: Flags): string[] {
  return [
    f.intakeMissing && 'intake missing',
    f.slotsToFill && 'slots to fill',
    f.intakeChanged && 'intake changed',
    f.removedFromBank && `${f.removedFromBank} removed from bank`,
  ].filter(Boolean) as string[];
}

export interface ResolvedQuestion {
  id: string;                    // bank question id, or the custom id
  source: 'bank' | 'requested' | 'follow-up';
  text: string;                  // filled from the slot values
  template?: string;
  framework: string | null;
  mandatory?: boolean;
  removedFromBank?: boolean;
  emptySlots?: string[];
  parentId?: string;
}

export interface ResolvedRound {
  id: string; name: string; pick: number; count: number;
  questions: ResolvedQuestion[];   // the items that count: mandatory, bank picks and requested ones
  followUps: ResolvedQuestion[];
}

export function resolveRound(sel: InterviewSelection, bank: InterviewBank, round: BankRound): ResolvedRound {
  const idx = bankIndex(bank);
  const picks = sel.picks.filter(p => roundOfPick(p, idx) === round.id).map((p): ResolvedQuestion => {
    const e = idx.get(p.questionId);
    if (!e) return { id: p.questionId, source: 'bank', text: p.text ? fillQuestion(p.text, p.slotValues) : p.questionId, framework: null, removedFromBank: true };
    const empty = (e.q.slots ?? []).filter(s => isEmpty(p.slotValues?.[s.name])).map(s => s.name);
    return {
      id: p.questionId, source: 'bank', text: fillQuestion(e.q.text, p.slotValues), framework: e.framework,
      ...(e.q.slots?.length ? { template: e.q.text } : {}),
      ...(e.q.mandatory ? { mandatory: true } : {}),
      ...(empty.length ? { emptySlots: empty } : {}),
    };
  });
  // mandatory first, the rest in the order they were picked
  picks.sort((a, b) => Number(!!b.mandatory) - Number(!!a.mandatory));
  const custom = (kind: CustomQuestion['kind']) => sel.custom.filter(c => c.round === round.id && c.kind === kind)
    .map((c): ResolvedQuestion => ({ id: c.id, source: kind, text: c.text, framework: c.framework ?? null, ...(c.parentId ? { parentId: c.parentId } : {}) }));
  const questions = [...picks, ...custom('requested')];
  return { id: round.id, name: round.name, pick: round.pick, count: questions.length, questions, followUps: custom('follow-up') };
}

export const resolveRounds = (sel: InterviewSelection, bank: InterviewBank) => bank.rounds.map(r => resolveRound(sel, bank, r));

/**
 * The technical chain: the mandatory pitch at the root, each picked question under it,
 * follow-ups under the question they follow. Follow-ups without a parent hang off the pitch;
 * ones whose parent was removed are listed apart.
 */
export function chainFor(r: ResolvedRound) {
  const root = r.questions.find(q => q.mandatory) ?? null;
  const children = r.questions.filter(q => q !== root);
  const ids = new Set(r.questions.map(q => q.id));
  const under = (id: string) => r.followUps.filter(f => f.parentId === id);
  return {
    root,
    rootFollowUps: r.followUps.filter(f => !f.parentId || (root && f.parentId === root.id)),
    children: children.map(q => ({ q, followUps: under(q.id) })),
    orphans: r.followUps.filter(f => f.parentId && !ids.has(f.parentId)),
  };
}

/* ---------------- class overview ---------------- */

export interface OverviewItem { key: string; text: string; tag?: 'custom' | 'custom · follow-up'; learners: string[] }
export interface OverviewGroup { framework: string | null; label: string; items: OverviewItem[] }

/** Every picked question in the class grouped by the framework that answers it, most picked first. */
export function overviewByFramework(
  rows: { name: string; sel: InterviewSelection }[], bank: InterviewBank, names: Record<string, string>,
): OverviewGroup[] {
  const groups = new Map<string | null, Map<string, OverviewItem>>();
  const order = new Map<string, number>();
  [...bankIndex(bank).keys()].forEach((id, i) => order.set(id, i));
  const add = (fw: string | null, key: string, item: Omit<OverviewItem, 'learners'>, learner: string) => {
    if (!groups.has(fw)) groups.set(fw, new Map());
    const g = groups.get(fw)!;
    if (!g.has(key)) g.set(key, { ...item, learners: [] });
    if (!g.get(key)!.learners.includes(learner)) g.get(key)!.learners.push(learner);
  };
  rows.forEach(({ name, sel }) => resolveRounds(sel, bank).forEach(r => {
    r.questions.forEach(q => q.source === 'bank'
      ? add(q.framework, q.id, { key: q.id, text: (q.template ?? q.text) + (q.removedFromBank ? ' (removed from bank)' : '') }, name)
      : add(q.framework, `${name}:${q.id}`, { key: `${name}:${q.id}`, text: q.text, tag: 'custom' }, name));
    r.followUps.forEach(q => add(q.framework, `${name}:${q.id}`, { key: `${name}:${q.id}`, text: q.text, tag: 'custom · follow-up' }, name));
  }));
  const fws = [...groups.keys()].filter((k): k is string => k !== null).sort(byFrameworkId);
  const all = allFrameworkNames(bank, names);
  const out: OverviewGroup[] = fws.map(fw => ({ framework: fw, label: frameworkLabel(fw, all), items: [] }));
  if (groups.has(null)) out.push({ framework: null, label: 'No framework yet', items: [] });
  out.forEach(g => {
    g.items = [...groups.get(g.framework)!.values()].sort((a, b) =>
      b.learners.length - a.learners.length || (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
  });
  return out;
}

export function overviewText(className: string, track: string, groups: OverviewGroup[]): string {
  const lines = [`Interview picks — ${className} (${track})`, ''];
  groups.forEach(g => {
    lines.push(g.label);
    g.items.forEach(i => lines.push(`- ${i.text}${i.tag ? ` [${i.tag}]` : ''} — ${i.learners.length}: ${i.learners.join(', ')}`));
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}
