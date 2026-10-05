// Pure lesson-hub logic, ported from the hub HTML script.

import type { Group, Hub, Move, PlanRound, Scene, Topic } from './types';

/** Speaking topics share the hub's plan. Pronunciation sessions carry their own rounds. */
export const isPron = (t: Topic | null | undefined) => !!(t && t.rounds);
export const planFor = (t: Topic | null | undefined, hub: Hub): PlanRound[] =>
  (t && t.rounds) ? t.rounds : hub.plan;

/**
 * Phases in teaching order. Postgres JSONB doesn't keep object key order ("after"
 * sorts before "class"), so the order comes from the plan's rounds, which are an
 * array; phases without rounds follow.
 */
export function phaseOrder(plan: PlanRound[], hub: Hub): string[] {
  const order: string[] = [];
  for (const r of plan) if (!order.includes(r.phase)) order.push(r.phase);
  for (const k of Object.keys(hub.phases)) if (!order.includes(k)) order.push(k);
  return order.filter(k => k in hub.phases);
}

export const sub = (s: string, hub: Hub) => String(s).replace(/\{project\}/g, hub.project.name);

/** Share of the round's minutes one learner spends talking. */
export const share = (g: Group, hub: Hub) =>
  g === 'whole' ? 1 / (hub.course.classSize || 6) : (hub.grouping[g] ?? 0);

export const talkTime = (plan: PlanRound[], hub: Hub) =>
  plan.filter(r => r.phase === 'class').reduce((t, r) => t + r.min * share(r.group, hub), 0);

/** Start minute of each in-class round, keyed by its index in the plan. */
export function schedule(plan: PlanRound[]): Record<number, number> {
  let at = 0;
  const map: Record<number, number> = {};
  plan.forEach((r, i) => { if (r.phase === 'class') { map[i] = at; at += r.min; } });
  return map;
}

export function sceneList(t: Topic): Scene[] | null {
  if (t.scenes) return t.scenes;
  if (t.moves) return [{ name: null, setting: null, moves: t.moves }];
  return null;
}

export function allMoves(t: Topic): Move[] {
  const sc = sceneList(t);
  if (sc) return sc.flatMap(s => s.moves);
  return [{ name: '', purpose: '', frames: (t.structures || []).map((_, i) => i) }];
}

/** Even split: 16 lines at 5 per slide becomes 4+4+4+4, not 5+5+5+1. */
export function chunk<T>(a: T[], max: number): T[][] {
  if (a.length <= max) return [a.slice()];
  return chunkInto(a, Math.ceil(a.length / max));
}

export function chunkInto<T>(a: T[], parts: number): T[][] {
  parts = Math.max(1, Math.min(parts, a.length));
  const out: T[][] = [];
  let i = 0;
  for (let p = 0; p < parts; p++) {
    const take = Math.ceil((a.length - i) / (parts - p));
    out.push(a.slice(i, i + take));
    i += take;
  }
  return out;
}

export function pairRows(pairs: { sounds: string; words: [string, string][] }[]) {
  let n = 0;
  return pairs.flatMap(p => p.words.map((w, j) => ({ n: ++n, sounds: j === 0 ? p.sounds : '', a: w[0], b: w[1] })));
}

/** Where the class timer says you should be: the latest round that has started. */
export function dueRound(plan: PlanRound[], sec: number) {
  const at = schedule(plan);
  const mins = sec / 60;
  let dueIdx: number | null = null;
  plan.forEach((r, i) => { if (r.phase === 'class' && mins >= at[i]) dueIdx = i; });
  if (dueIdx === null || !sec) return null;
  const r = plan[dueIdx];
  const over = mins - (at[dueIdx] + r.min);
  return { index: dueIdx as number, at: at[dueIdx], over, title: r.title };
}

export const fmtClock = (s: number) =>
  String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

/**
 * Split an example into labelled variants, e.g. "On track: … Taking longer: …".
 * A label is a short capitalised phrase and a colon that starts a sentence. It only counts
 * when one also appears after a sentence end, so an example that merely opens with a colon
 * ("Just a quick heads-up: staging will be down…") stays one sentence.
 */
const LABEL = /([A-Z][A-Za-z0-9'’/ -]{0,28}):\s+/;
export function splitExample(example: string): { label: string | null; text: string }[] {
  // non-capturing here: a capture group inside split() would add the label as an extra piece
  const midLabel = new RegExp(`(?<=[.!?]["”’']?)\\s+(?=${LABEL.source.replace('(', '(?:')})`, 'g');
  const pieces = example.split(midLabel);
  if (pieces.length < 2) return [{ label: null, text: example }];
  return pieces.map(p => {
    const m = new RegExp(`^${LABEL.source}`).exec(p);
    return m ? { label: m[1], text: p.slice(m[0].length) } : { label: null, text: p };
  });
}

/**
 * Split a dialogue into present-mode pages. A page holds up to DIALOGUE_PAGE.lines lines and
 * about DIALOGUE_PAGE.chars characters, so a few long lines count like many short ones.
 * When a split is needed, it falls between scenes where it can; otherwise the lines are
 * divided evenly (16 lines at 10 per page becomes 8+8, not 10+6).
 */
export const DIALOGUE_PAGE = { lines: 16, chars: 1600 };

export function dialoguePages<T extends { text: string; scene?: number }>(lines: T[]): T[][] {
  const chars = (g: T[]) => g.reduce((n, l) => n + l.text.length, 0);
  const fits = (g: T[]) => g.length <= DIALOGUE_PAGE.lines && chars(g) <= DIALOGUE_PAGE.chars;
  const evenly = (g: T[]) => chunkInto(g, Math.max(
    Math.ceil(g.length / DIALOGUE_PAGE.lines), Math.ceil(chars(g) / DIALOGUE_PAGE.chars), 1));
  if (fits(lines)) return [lines];

  const scenes: T[][] = [];
  lines.forEach((l, i) => {
    if (i === 0 || l.scene !== lines[i - 1].scene) scenes.push([]);
    scenes[scenes.length - 1].push(l);
  });
  if (scenes.length < 2) return evenly(lines);

  // pack whole scenes onto pages; a scene too long for one page is divided evenly
  const pages: T[][] = [];
  let cur: T[] = [];
  for (const sc of scenes) {
    if (fits([...cur, ...sc])) { cur = [...cur, ...sc]; continue; }
    if (cur.length) pages.push(cur);
    cur = sc;
  }
  if (cur.length) pages.push(cur);
  return pages.flatMap(p => fits(p) ? [p] : evenly(p));
}
