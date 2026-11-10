// Interview prep: the class's pick list over the track's question bank, shared by the
// lesson hub and the MCP connector. Pure functions.
//
// One bank per track serves the whole interview series. The class being taught picks
// as many questions from it as it wants (the mandatory ones are always on the list),
// can add questions it asks for, and every later session follows the list.

import type {
  BankGroup, BankQuestion, BankRound, Framework, InterviewBank, InterviewPicks, ModelAnswer, RequestedQuestion, Topic,
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

/* ---------------- the class's picks ---------------- */

export const emptyPicks = (track: string): InterviewPicks => ({ track, picks: [], requested: [], updatedAt: null });

/** Mandatory questions are always on the list. */
export function withMandatory(p: InterviewPicks, bank: InterviewBank): InterviewPicks {
  const have = new Set(p.picks.map(x => x.questionId));
  const missing = [...bankIndex(bank).values()].filter(e => e.q.mandatory && !have.has(e.q.id))
    .map(e => ({ questionId: e.q.id, text: e.q.text }));
  return missing.length ? { ...p, picks: [...missing, ...p.picks] } : p;
}

export const isPicked = (p: InterviewPicks | null | undefined, questionId: string) =>
  !!p?.picks.some(x => x.questionId === questionId);

/** Tick or untick a bank question. Mandatory questions stay. */
export function togglePick(p: InterviewPicks, bank: InterviewBank, questionId: string, now: string): InterviewPicks {
  const e = bankIndex(bank).get(questionId);
  if (e?.q.mandatory) return p;
  if (isPicked(p, questionId)) return { ...p, picks: p.picks.filter(x => x.questionId !== questionId), updatedAt: now };
  if (!e) return p;
  return { ...p, picks: [...p.picks, { questionId, text: e.q.text }], updatedAt: now };
}

export function addRequested(p: InterviewPicks, round: string, text: string, framework: string | undefined, now: string): InterviewPicks {
  const used = new Set(p.requested.map(r => r.id));
  let n = p.requested.length + 1;
  while (used.has(`r-${n}`)) n++;
  const r: RequestedQuestion = { id: `r-${n}`, round, text: text.trim() };
  if (framework) r.framework = framework;
  return { ...p, requested: [...p.requested, r], updatedAt: now };
}

export const removeRequested = (p: InterviewPicks, id: string, now: string): InterviewPicks =>
  ({ ...p, requested: p.requested.filter(r => r.id !== id), updatedAt: now });

/** A requested question becomes a bank question (new id in the chosen group) and a normal pick. */
export function promoteToBank(
  bank: InterviewBank, p: InterviewPicks, requestedId: string, roundId: string, groupId: string,
  framework: string | undefined, now: string,
): { bank: InterviewBank; picks: InterviewPicks; questionId: string } | { error: string } {
  const r = p.requested.find(x => x.id === requestedId);
  if (!r) return { error: 'That question is no longer on the list.' };
  const round = bank.rounds.find(x => x.id === roundId);
  const group = round?.groups.find(g => g.id === groupId);
  if (!round || !group) return { error: 'Pick a round and a group.' };
  const fw = framework || r.framework;
  if (!group.framework && !fw) return { error: `"${group.name}" has no framework of its own, so the question needs one.` };
  // an id still on the class's list (its question since removed from the bank) is never reused,
  // or that pick would quietly become the new question
  const idx = bankIndex(bank);
  const taken = (id: string) => idx.has(id) || p.picks.some(x => x.questionId === id);
  const prefix = roundId.charAt(0);
  let n = group.questions.length + 1;
  while (taken(`${prefix}-${groupId}-${n}`)) n++;
  const questionId = `${prefix}-${groupId}-${n}`;
  const q: BankQuestion = { id: questionId, text: r.text };
  if (!group.framework) q.framework = fw;
  return {
    questionId,
    bank: {
      ...bank,
      rounds: bank.rounds.map(x => x.id !== roundId ? x : {
        ...x, groups: x.groups.map(g => g.id !== groupId ? g : { ...g, questions: [...g.questions, q] }),
      }),
    },
    picks: {
      ...p,
      requested: p.requested.filter(x => x.id !== requestedId),
      picks: [...p.picks, { questionId, text: r.text }],
      updatedAt: now,
    },
  };
}

/** Take a question out of the bank. Mandatory questions can't be removed here. */
export function removeFromBank(bank: InterviewBank, questionId: string): InterviewBank | { error: string } {
  const e = bankIndex(bank).get(questionId);
  if (!e) return { error: 'That question is no longer in the bank.' };
  if (e.q.mandatory) return { error: 'Everyone answers this question, so it stays in the bank.' };
  return {
    ...bank,
    rounds: bank.rounds.map(r => ({
      ...r, groups: r.groups.map(g => ({ ...g, questions: g.questions.filter(q => q.id !== questionId) })),
    })),
  };
}

/** Take a question off the class's list, whether or not it's still in the bank. */
export const dropPick = (p: InterviewPicks, questionId: string, now: string): InterviewPicks =>
  ({ ...p, picks: p.picks.filter(x => x.questionId !== questionId), updatedAt: now });

/* ---------------- the resolved list ---------------- */

export interface ListedQuestion {
  id: string;
  text: string;
  framework: string | null;
  mandatory?: boolean;
  requested?: boolean;
  removedFromBank?: boolean;
}

/** The class's questions per round, in bank order, then requested ones; picks of removed questions last. */
export function picksByRound(p: InterviewPicks | null | undefined, bank: InterviewBank): { round: BankRound; questions: ListedQuestion[] }[] {
  const idx = bankIndex(bank);
  const picked = new Set(p?.picks.map(x => x.questionId));
  const removed: ListedQuestion[] = (p?.picks ?? []).filter(x => !idx.has(x.questionId))
    .map(x => ({ id: x.questionId, text: x.text ?? x.questionId, framework: null, removedFromBank: true }));
  return bank.rounds.map((round, i) => ({
    round,
    questions: [
      ...round.groups.flatMap(g => g.questions.filter(q => q.mandatory || picked.has(q.id)).map(q => ({
        id: q.id, text: q.text, framework: frameworkOf(q, g), ...(q.mandatory ? { mandatory: true } : {}),
      }))),
      ...(p?.requested ?? []).filter(r => r.round === round.id)
        .map(r => ({ id: r.id, text: r.text, framework: r.framework ?? null, requested: true })),
      // a removed question's round is unknown; list it with the last round
      ...(i === bank.rounds.length - 1 ? removed : []),
    ],
  }));
}

/** The class's questions a framework answers, for that framework's section and slides. */
export const picksForFramework = (p: InterviewPicks | null | undefined, bank: InterviewBank, fw: string) =>
  picksByRound(p, bank).flatMap(r => r.questions).filter(q => q.framework === fw);

/** A question's model answer: its own in the bank, else (older topics) the framework's answer for its modelQuestion. */
export function modelAnswerOf(questionId: string, bank: InterviewBank | null | undefined, f?: Framework | null): ModelAnswer | null {
  const own = bankIndex(bank).get(questionId)?.q.modelAnswer;
  if (own) return own;
  return f && f.modelQuestion === questionId && f.modelAnswer ? f.modelAnswer : null;
}

export interface FrameworkAnswer { question: ListedQuestion; answer: ModelAnswer | null }

/**
 * A framework's model answers for this class: one per question on the class's list that the
 * framework answers, with null where none is written yet. Only the class's picks: answers to
 * questions the class didn't pick never show.
 */
export const answersForFramework = (p: InterviewPicks | null | undefined, bank: InterviewBank, f: Framework): FrameworkAnswer[] =>
  picksForFramework(p, bank, f.id).map(q => ({ question: q, answer: q.requested ? null : modelAnswerOf(q.id, bank, f) }));

export interface FrameworkGroup { framework: string | null; label: string; questions: ListedQuestion[] }

/** The class's questions grouped by the framework that answers them; untagged ones last. */
export function picksByFramework(p: InterviewPicks | null | undefined, bank: InterviewBank, names: Record<string, string>): FrameworkGroup[] {
  const all = allFrameworkNames(bank, names);
  const qs = picksByRound(p, bank).flatMap(r => r.questions);
  const ids = [...new Set(qs.map(q => q.framework).filter((x): x is string => !!x))].sort(byFrameworkId);
  const out: FrameworkGroup[] = ids.map(id => ({ framework: id, label: frameworkLabel(id, all), questions: qs.filter(q => q.framework === id) }));
  const none = qs.filter(q => !q.framework);
  if (none.length) out.push({ framework: null, label: 'No framework yet', questions: none });
  return out;
}

export function picksText(track: string, groups: FrameworkGroup[]): string {
  const lines = [`Interview questions picked by the class (${track})`, ''];
  groups.forEach(g => {
    lines.push(g.label);
    g.questions.forEach(q => lines.push(`- ${q.text}${q.requested ? ' [requested]' : ''}${q.removedFromBank ? ' [removed from bank]' : ''}`));
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}
