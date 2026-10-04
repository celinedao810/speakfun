"use client";

import React, { useEffect } from 'react';
import type { Hub, Topic } from '@/lib/lessonHub/types';
import { allMoves, chunk, chunkInto, isPron, pairRows, sub } from '@/lib/lessonHub/engine';
import { GapLine, HintRows, MarkedPassage, Slots, Toggle, useHub } from './shared';
import { VoicedLegend, YouGlishLink } from './rounds';
import FlowSketch from './FlowSketch';

/* One round becomes one or more slides. Nothing scrolls: anything too long for a
   screen is split across slides instead. Teaching notes (how / say) stay on the
   plan page — slides carry learner content only. */

interface Slide {
  kicker: string;
  title: string;
  part?: [number, number];   // "2/3" when one round spans several slides
  tell?: string;
  body: React.ReactNode;
  hint?: boolean;
  dlgControls?: boolean;
  answers?: boolean;
}

const CHUNK = { vocab: 6, chips: 12, dialogue: 8, dialogueSlides: 2 };
const partOf = (i: number, a: unknown[]): [number, number] | undefined => a.length > 1 ? [i + 1, a.length] : undefined;

function speakingSlides(t: Topic, hub: Hub): Slide[] {
  const S: Slide[] = [];
  S.push({ kicker: `${t.track} · topic ${t.order}`, title: t.title, body: <p className="sl-says">{t.says}</p> });
  const vocab = t.vocabulary || [], structures = t.structures || [];

  hub.plan.forEach(r => {
    const K = r.title, tell = r.tell || r.how;
    const add = (s: Omit<Slide, 'kicker' | 'tell'>) => S.push({ kicker: K, tell, ...s });
    switch (r.uses) {
      case 'context': {
        const ctx = t.context || (t.reading ? t.reading.passage[0] : '');
        add({ title: 'The situation', body: <>
          <p className="sl-prose">{Array.isArray(ctx) ? ctx.join(' ') : ctx}</p>
          <ul className="sl-qs">{(t.leadIn || []).map((q, i) => <li key={i}>{q}</li>)}</ul></> });
        break;
      }
      case 'vocabTable':
        chunk(vocab, CHUNK.vocab).forEach((g, i, a) => add({ title: "Today's words", part: partOf(i, a), body:
          <table className="sl-vocab"><tbody>{g.map((v, k) => (
            <tr key={k}><td className="w">{v.word}<div className="pos">{v.pos}</div></td>
              <td className="d">{v.definition}<div className="ex">{v.example}</div></td></tr>
          ))}</tbody></table> }));
        break;
      case 'vocabulary':
        chunk(vocab, CHUNK.chips).forEach((g, i, a) => add({ title: K, part: partOf(i, a), body:
          <div className="sl-chips">{g.map((v, k) => <span key={k}>{v.word}</span>)}</div> }));
        break;
      case 'structures':
        // one slide, every frame in move order — the sequence is the thing being taught
        add({ title: 'The moves, in order', body:
          <div className="sl-frames all">{allMoves(t).map((m, n) => (
            <div key={n} className="sl-move">
              {m.name && <div className="sl-movehd"><span className="mn">{n + 1}</span>{m.name}</div>}
              {m.frames.map(ix => structures[ix]).filter(Boolean).map((f, k) => (
                <div key={k} className="sl-frame"><div className="s"><Slots text={f.structure} /></div></div>
              ))}
            </div>
          ))}</div> });
        break;
      case 'prompts':
        add({ title: 'Which frame?', hint: true, body:
          <div className="sl-prompts">{structures.map((f, k) => <div key={k}>{f.promptSlots || ''}</div>)}</div> });
        break;
      case 'dialogue': {
        const d = t.dialogue;
        if (!d) break;
        chunkInto(d.lines, Math.min(CHUNK.dialogueSlides, Math.ceil(d.lines.length / CHUNK.dialogue))).forEach((g, i, a) => {
          const lines = <div className="sl-dlg">{g.map((l, k) => (
            <div key={k} className="sl-line">
              {l.part ? <div className="sl-part">{l.part}</div> : <div className="who">{l.role}</div>}
              <div className="say"><GapLine line={l} /></div>
            </div>
          ))}</div>;
          add({ title: 'The conversation', part: partOf(i, a), hint: true, dlgControls: true,
            body: t.flow
              ? <div className="sl-flowwrap"><FlowSketch flow={t.flow} projectName={hub.project.name} /><div>{lines}</div></div>
              : lines });
        });
        break;
      }
      case 'speaking':
        if (!t.speaking) break;
        add({ title: 'Role-play', hint: true, body: <>
          <p className="sl-scenario">{t.speaking.scenario}</p>
          <div className="sl-roles">{t.speaking.roles.map((x, k) => (
            <div key={k} className="sl-role"><div className="rn">{x.name}</div>
              <ul>{x.tasks.map((j, n) => <li key={n}>{j}</li>)}</ul></div>
          ))}</div></> });
        break;
      case 'homework':
        add({ title: 'Homework', body: <p className="sl-prose">{t.homework}</p> });
        break;
    }
  });
  return S;
}

function pronSlides(t: Topic): Slide[] {
  const S: Slide[] = [];
  S.push({ kicker: `Pronunciation · session ${t.order}`, title: t.title, body: <p className="sl-says">{t.says}</p> });
  (t.rounds || []).forEach(r => {
    const K = r.title;
    if (r.game) {
      const g = r.game;
      S.push({ kicker: K, title: r.title, tell: r.tell, body:
        <div className="sl-game">
          <div>
            <a className="gbtn" href={g.url} target="_blank" rel="noopener">{g.cta}</a>
            {g.extraUrl && <a className="gbtn sec" href={g.extraUrl} target="_blank" rel="noopener">{g.extraCta}</a>}
          </div>
          {g.note && <div className="gnote">{g.note}</div>}
        </div> });
      return;
    }
    (r.parts || []).forEach(p => {
      const tell = p.tell || r.tell;
      const T = p.label || r.title;
      const add = (s: Omit<Slide, 'kicker' | 'tell'>) => S.push({ kicker: K, tell, ...s });
      switch (p.kind) {
        case 'reveal': {
          let n = 0;
          chunk(p.items, p.perSlide || 6).forEach((g, i, a) => add({ title: T, part: partOf(i, a), answers: true, body: <>
            {p.chips && <div className="sl-cats">{p.chips.map((c, k) => <span key={k} className="ipa">{c}</span>)}</div>}
            <RevealRows items={g} start={(n += g.length) - g.length} promptIpa={p.promptIpa} answerIpa={p.answerIpa} /></> }));
          break;
        }
        case 'pairs':
          chunk(pairRows(p.pairs), 6).forEach((g, i, a) => add({ title: T, part: partOf(i, a), body:
            <table className="sl-pairs"><tbody><tr><th></th><th>Sounds</th><th>A</th><th>B</th></tr>
              {g.map(r2 => <tr key={r2.n}><td className="pn">{r2.n}</td><td className="snd ipa">{r2.sounds}</td><td>{r2.a}</td><td>{r2.b}</td></tr>)}
            </tbody></table> }));
          break;
        case 'rules':
          add({ title: T, body: <>
            {p.sounds && <VoicedLegend sounds={p.sounds} slide />}
            <div className="sl-rules">{p.rules.map((g, k) => (
              <div key={k}><h3>{g.ending}</h3>
                {g.rows.map((r2, j) => <div key={j} className="rr"><span className="rs ipa">{r2.sound}</span>
                  <span className="rx">{r2.after}<i>{r2.ex}</i></span></div>)}</div>
            ))}</div></> });
          break;
        case 'passage':
          add({ title: T, answers: !!p.marks, body: <p className="sl-prose"><MarkedPassage text={p.text} marks={p.marks} /></p> });
          break;
        case 'text':
          add({ title: r.phase === 'after' ? 'Homework' : T, body: <p className="sl-prose">{p.text}</p> });
          break;
        case 'choice':
          chunk(p.items, 12).forEach((g, i, a) => add({ title: T, part: partOf(i, a), answers: true, body:
            <ChoiceRows items={g} offset={p.items.indexOf(g[0])} /> }));
          break;
        case 'twisters':
          add({ title: T, body: <ol className="sl-twisters">{p.items.map((x, k) => (
            <li key={k}>{x.text}<div className="sl-twisteripa ipa">{x.ipa}</div></li>
          ))}</ol> });
          break;
        case 'dictation':
          add({ title: T, body: <>
            <div className="sl-dictboard">{p.chips.map((c, k) => <span key={k} className="ipa">{c}</span>)}</div>
            <ol className="sl-dictwords">{p.items.map((x, k) => <li key={k}>{x.prompt}</li>)}</ol></> });
          break;
      }
    });
  });
  return S;
}

function RevealRows({ items, start, promptIpa, answerIpa }: {
  items: { prompt: string; answer: string }[]; start: number; promptIpa?: boolean; answerIpa?: boolean;
}) {
  const { dlg } = useHub();
  return <div className="sl-reveal">{items.map((x, k) => (
    <div key={k} className="rv"><span className="n">{start + k + 1}</span>
      <span className={`p${promptIpa ? ' ipa' : ''}`}>{x.prompt}</span>
      {dlg.answers && <span className={`a${answerIpa ? ' ipa' : ''}`}>{x.answer}</span>}</div>
  ))}</div>;
}

function ChoiceRows({ items, offset }: {
  items: { word: string; link: string; options: string[]; correct: number }[]; offset: number;
}) {
  const { dlg } = useHub();
  return <div className="sl-choice">{items.map((x, k) => (
    <div key={k} className="cr"><span className="n">{offset + k + 1}</span>
      <YouGlishLink link={x.link}>Listen {'▸'}</YouGlishLink>
      <div className="sl-copts">
        {x.options.map((o, oi) => (
          <span key={oi} className={`sl-copt${dlg.answers && oi === x.correct ? ' right' : ''}`}><b className="sl-coptlet">{String.fromCharCode(65 + oi)}</b>{o}</span>
        ))}
        {dlg.answers && <span className="sl-cword">{x.word}</span>}
      </div>
    </div>
  ))}</div>;
}

export function slidesFor(t: Topic, hub: Hub): Slide[] {
  return isPron(t) ? pronSlides(t) : speakingSlides(t, hub);
}

export default function PresentMode({ t, slide, setSlide, onExit }: {
  t: Topic; slide: number; setSlide: (n: number) => void; onExit: () => void;
}) {
  const { hub, dlg, setDlg } = useHub();
  const S = slidesFor(t, hub);
  const i = Math.max(0, Math.min(slide, S.length - 1));
  const s = S[i];
  const showHint = s.hint && dlg.hint;

  const goTo = (n: number) => { setSlide(Math.max(0, Math.min(n, S.length - 1))); setDlg({ answers: false }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); goTo(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(i - 1); }
      else if (e.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className="present">
      <div className="slchrome">
        <span className="slkick">{sub(s.kicker, hub)}</span>
        <span className="slnum">{i + 1} / {S.length}</span>
        {s.hint && <Toggle on={dlg.hint} onClick={() => setDlg({ hint: !dlg.hint })}>{dlg.hint ? 'Hide frames' : 'Hint'}</Toggle>}
        {s.dlgControls && <>
          <span className="slctlsep"></span>
          <span className="slctllabel">Blanks</span>
          <Toggle on={!dlg.frames} onClick={() => setDlg({ frames: false })}>shown</Toggle>
          <Toggle on={dlg.frames} onClick={() => setDlg({ frames: true })}>hidden</Toggle>
        </>}
        {s.answers && <>
          <span className="slctlsep"></span>
          <span className="slctllabel">Answers</span>
          <Toggle on={!dlg.answers} onClick={() => setDlg({ answers: false })}>hidden</Toggle>
          <Toggle on={dlg.answers} onClick={() => setDlg({ answers: true })}>shown</Toggle>
        </>}
        <button type="button" onClick={onExit}>Exit</button>
      </div>
      <div className={`slbody${showHint ? ' hinted' : ''}`}>
        <div className="slmain">
          <h2 className="sltitle">{s.title}{s.part && <> <span className="slof">{s.part[0]}/{s.part[1]}</span></>}</h2>
          {s.tell && <p className="sltell">{sub(s.tell, hub)}</p>}
          {s.body}
        </div>
        {showHint && <aside className="slhint"><div className="hinthd">Frames from this lesson</div>
          <HintRows structures={t.structures || []} /></aside>}
      </div>
      <div className="slnav">
        <button type="button" disabled={i === 0} onClick={() => goTo(i - 1)}>{'←'}</button>
        <button type="button" disabled={i === S.length - 1} onClick={() => goTo(i + 1)}>{'→'}</button>
      </div>
    </div>
  );
}
