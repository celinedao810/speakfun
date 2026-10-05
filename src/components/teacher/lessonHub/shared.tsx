"use client";

import React, { createContext, useContext } from 'react';
import type { DialogueLine, Hub, Structure, Topic } from '@/lib/lessonHub/types';
import { splitExample } from '@/lib/lessonHub/engine';

// Display toggles shared by the plan page and present mode.
export interface DlgState {
  hide: string | null;   // role whose lines are replaced by "your line"
  frames: boolean;       // true = frame spans blanked in the dialogue
  hint: boolean;         // frames panel beside dialogue/prompts
  answers: boolean;      // reveal answers in prompts and pronunciation parts
  revealed: number[];    // "Which frame?" answers revealed one at a time (all shown when answers is on)
}

interface HubCtx {
  hub: Hub;
  topic: Topic | null;
  dlg: DlgState;
  setDlg: (patch: Partial<DlgState>) => void;
}

const Ctx = createContext<HubCtx | null>(null);
export const HubProvider = Ctx.Provider;
export function useHub(): HubCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHub outside LessonHub');
  return c;
}

/** Sentence frame with [slots] highlighted. */
export function Slots({ text }: { text: string }) {
  const parts = text.split(/\[([^\]]+)\]/g);
  return <>{parts.map((p, i) => i % 2 ? <span key={i} className="slot">{p}</span> : p)}</>;
}

/** Dialogue line with the frame spans blanked, so learners supply them while reading aloud. */
export function GapLine({ line }: { line: DialogueLine }) {
  const { dlg } = useHub();
  if (!dlg.frames || !line.gaps?.length) return <>{line.text}</>;
  let segs: (string | { gap: string })[] = [line.text];
  for (const g of line.gaps) {
    const i = segs.findIndex(s => typeof s === 'string' && s.includes(g.text));
    if (i < 0) continue;
    const s = segs[i] as string;
    const at = s.indexOf(g.text);
    segs = [...segs.slice(0, i), s.slice(0, at), { gap: g.text }, s.slice(at + g.text.length), ...segs.slice(i + 1)];
  }
  return (
    <>{segs.map((s, i) => typeof s === 'string' ? s
      : <span key={i} className="framegap">{' '.repeat(Math.min(s.gap.length, 26))}</span>)}</>
  );
}

/** Passage with each marked word highlighted and its ending sound shown, when answers are on. */
export function MarkedPassage({ text, marks }: { text: string; marks?: { word: string; sound: string }[] }) {
  const { dlg } = useHub();
  if (!dlg.answers || !marks) return <>{text}</>;
  let segs: (string | { word: string; sound: string })[] = [text];
  for (const m of marks) {
    const re = new RegExp('\\b' + m.word + '\\b');
    const i = segs.findIndex(s => typeof s === 'string' && re.test(s));
    if (i < 0) continue;
    const s = segs[i] as string;
    const hit = re.exec(s)!;
    segs = [...segs.slice(0, i), s.slice(0, hit.index), { word: hit[0], sound: m.sound },
      s.slice(hit.index + hit[0].length), ...segs.slice(i + 1)];
  }
  return (
    <>{segs.map((s, i) => typeof s === 'string' ? s
      : <mark key={i} className="endmark">{s.word}<span className="es">{s.sound}</span></mark>)}</>
  );
}

/** A frame's example, one line per labelled variant. */
export function ExampleLines({ example, className = 'exl' }: { example: string; className?: string }) {
  return <>{splitExample(example).map((e, i) => (
    <div key={i} className={className}>{e.label && <span className="exlabel">{e.label}</span>}{e.text}</div>
  ))}</>;
}

export function HintRows({ structures }: { structures: Structure[] }) {
  return (
    <>{structures.map((f, i) => (
      <div key={i} className="hintrow"><span className="hn">{i + 1}</span><span><Slots text={f.structure} /></span></div>
    ))}</>
  );
}

export function Toggle({ on, onClick, className, children }: {
  on: boolean; onClick: () => void; className?: string; children: React.ReactNode;
}) {
  return <button type="button" className={[className, on ? 'on' : ''].filter(Boolean).join(' ')} onClick={onClick}>{children}</button>;
}

/** YouGlish clips open in a small window beside the slides, not a new tab. */
export function openYouGlish(url: string) {
  const w = 480, h = 420;
  const left = (window.screenX || 0) + (window.outerWidth || 1000);
  const top = window.screenY || 0;
  const win = window.open(url, 'e4it_youglish',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`);
  if (win) win.focus();
}
