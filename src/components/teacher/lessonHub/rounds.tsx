"use client";

import React, { useState } from 'react';
import type { Dialogue, PlanRound, PronPart, Topic } from '@/lib/lessonHub/types';
import { isPron, pairRows, planFor, sceneList, schedule, share, sub } from '@/lib/lessonHub/engine';
import { GapLine, HintRows, MarkedPassage, Slots, Toggle, openYouGlish, useHub } from './shared';
import FlowSketch from './FlowSketch';

const Bank = ({ items, className }: { items: string[]; className?: string }) => (
  <div className="bank">{items.map((q, i) => <span key={i} className={className}>{q}</span>)}</div>
);

export function ShapeStrip({ t }: { t: Topic }) {
  const sc = sceneList(t);
  if (!sc) return null;
  return <>{sc.map((s, i) => (
    <div key={i} className="shape">
      {s.name && <span className="scenetag">{sc.length > 1 ? `Scene ${i + 1} · ` : ''}{s.name}</span>}
      {s.moves.map((m, j) => <span key={j}>{m.name}</span>)}
    </div>
  ))}</>;
}

export function FramesByMove({ t }: { t: Topic }) {
  const structures = t.structures || [];
  const sc = sceneList(t);
  if (!sc) return <>{structures.map((f, i) => (
    <div key={i} className="sframe"><div className="s"><Slots text={f.structure} /></div>
      <div className="r"><b>{f.intent}.</b> {f.example}</div></div>
  ))}</>;
  return <>{sc.flatMap((s, si) => s.moves.map((m, mi) => (
    <div key={`${si}-${mi}`} className="move">
      <div className="movehd"><span className="movename">{m.name}</span><span className="movewhy">{m.purpose}</span></div>
      {m.frames.map(ix => structures[ix]).filter(Boolean).map((f, k) => (
        <div key={k} className="sframe"><div className="s"><Slots text={f.structure} /></div>
          <div className="r"><b>{f.intent}.</b> {f.example}</div></div>
      ))}
    </div>
  )))}</>;
}

function DlgControls({ d }: { d: Dialogue }) {
  const { dlg, setDlg } = useHub();
  const mono = d.roles.length < 2;   // a monologue: no roles to hide, no speaker column
  return (
    <div className="dlgctl">
      {!mono && <>
        <span className="dlgl">Hide a role</span>
        <Toggle on={dlg.hide === null} onClick={() => setDlg({ hide: null })}>nobody</Toggle>
        {d.roles.map(r => <Toggle key={r} on={dlg.hide === r} onClick={() => setDlg({ hide: r })}>{r}</Toggle>)}
      </>}
      <span className="dlgl" style={mono ? undefined : { marginLeft: '1rem' }}>Frames</span>
      <Toggle on={!dlg.frames} onClick={() => setDlg({ frames: false })}>shown</Toggle>
      <Toggle on={dlg.frames} onClick={() => setDlg({ frames: true })}>hidden</Toggle>
      <Toggle className="hintbtn" on={dlg.hint} onClick={() => setDlg({ hint: !dlg.hint })}>{dlg.hint ? 'Hide hint' : 'Hint'}</Toggle>
    </div>
  );
}

export function DialogueBlock({ t, d }: { t: Topic; d: Dialogue }) {
  const { hub, dlg } = useHub();
  const mono = d.roles.length < 2;
  return (
    <>
      <p className="prose" style={{ marginBottom: '.8rem' }}>{d.context}</p>
      {t.flow && <FlowSketch flow={t.flow} projectName={hub.project.name} />}
      <DlgControls d={d} />
      <div className={`dlgwrap${dlg.hint ? ' hinted' : ''}`}>
        <div className={`dlg${mono ? ' mono' : ''}`}>
          {d.lines.map((l, i) => {
            const hidden = dlg.hide === l.role;
            const newScene = l.scene && (i === 0 || d.lines[i - 1].scene !== l.scene);
            return (
              <React.Fragment key={i}>
                {newScene && <div className="dscene">Scene {l.scene}</div>}
                <div className={`dline${hidden ? ' gone' : ''}`}>
                  {l.part && <div className="dpart">{l.part}</div>}
                  <div className="who2">{l.role}</div>
                  <div className="say2">{hidden ? <span className="yourline">your line</span> : <GapLine line={l} />}</div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {dlg.hint && <aside className="hintpanel"><div className="hinthd">Frames from this lesson</div>
          <HintRows structures={t.structures || []} /></aside>}
      </div>
    </>
  );
}

function Prompts({ t }: { t: Topic }) {
  const { dlg, setDlg } = useHub();
  const structures = t.structures || [];
  return (
    <>
      <div className="dlgctl"><span className="dlgl">Answers</span>
        <Toggle on={!dlg.answers} onClick={() => setDlg({ answers: false })}>hidden</Toggle>
        <Toggle on={dlg.answers} onClick={() => setDlg({ answers: true })}>shown</Toggle>
        <Toggle className="hintbtn" on={dlg.hint} onClick={() => setDlg({ hint: !dlg.hint })}>{dlg.hint ? 'Hide hint' : 'Hint'}</Toggle>
      </div>
      <div className={`dlgwrap${dlg.hint ? ' hinted' : ''}`}>
        <div>{structures.map((f, i) => (
          <div key={i} className="prompt">
            <span className="pnum">{i + 1}</span>
            <span className="pslots">{f.promptSlots || ''}</span>
            {dlg.answers && <span className="pans">{f.example}</span>}
          </div>
        ))}</div>
        {dlg.hint && <aside className="hintpanel"><div className="hinthd">Frames from this lesson</div>
          <HintRows structures={structures} /></aside>}
      </div>
    </>
  );
}

function VocabTable({ t, style }: { t: Topic; style?: React.CSSProperties }) {
  return (
    <table className="vocab" style={style}><tbody>
      {(t.vocabulary || []).map((v, i) => (
        <tr key={i}><td className="w">{v.word}</td><td className="pos">{v.pos}</td>
          <td className="d">{v.definition}</td><td className="ex">{v.example}</td></tr>
      ))}
    </tbody></table>
  );
}

function RoleCards({ t }: { t: Topic }) {
  const sp = t.speaking!;
  return (
    <>
      <p className="how" style={{ marginTop: '.4rem' }}>{sp.scenario}</p>
      <div className="rolecards">{sp.roles.map((x, i) => (
        <div key={i} className="rolecard"><div className="rolename">{x.name}</div>
          <ul>{x.tasks.map((j, k) => <li key={k}>{j}</li>)}</ul></div>
      ))}</div>
    </>
  );
}

/* ---------------- pronunciation rounds ----------------
   A round is a list of parts. Kinds: reveal (prompt, answer shown on demand), pairs
   (numbered minimal pairs), rules, passage (optionally with endings marked), text,
   choice (listen and pick), twisters, dictation. */
export const hasAnswers = (p: PronPart) =>
  p.kind === 'reveal' || p.kind === 'choice' || p.kind === 'dictation' || (p.kind === 'passage' && !!p.marks);

function AnswersCtl() {
  const { dlg, setDlg } = useHub();
  return (
    <div className="dlgctl"><span className="dlgl">Answers</span>
      <Toggle on={!dlg.answers} onClick={() => setDlg({ answers: false })}>hidden</Toggle>
      <Toggle on={dlg.answers} onClick={() => setDlg({ answers: true })}>shown</Toggle>
    </div>
  );
}

export function VoicedLegend({ sounds, slide }: { sounds: { unvoiced: string[]; voiced: string[] }; slide?: boolean }) {
  const p = slide ? 'sl-' : '';
  return (
    <div className={`${p}vulegend`}>
      <div className={`${p}vurow`}><span className={`${p}vulabel`}>Unvoiced</span>{sounds.unvoiced.map((s, i) => <span key={i} className={`${p}vuchip ipa`}>{s}</span>)}</div>
      <div className={`${p}vurow`}><span className={`${p}vulabel`}>Voiced</span>{sounds.voiced.map((s, i) => <span key={i} className={`${p}vuchip ipa`}>{s}</span>)}</div>
    </div>
  );
}

export function YouGlishLink({ link, children }: { link: string; children: React.ReactNode }) {
  return <a className="clisten" href={link} onClick={e => { e.preventDefault(); openYouGlish(link); }}>{children}</a>;
}

function PronPartView({ p }: { p: PronPart }) {
  const { dlg } = useHub();
  const label = p.label ? <div className="partlabel">{p.label}</div> : null;
  switch (p.kind) {
    case 'reveal': return <>{label}
      {p.chips && <Bank items={p.chips} className="ipa" />}
      <div className="reveal">{p.items.map((x, i) => (
        <div key={i} className="rv"><span className="pnum">{i + 1}</span>
          <span className={`rvp${p.promptIpa ? ' ipa' : ''}`}>{x.prompt}</span>
          {dlg.answers && <span className={`rva${p.answerIpa ? ' ipa' : ''}`}>{x.answer}</span>}</div>
      ))}</div></>;
    case 'pairs': return <>{label}
      <table className="pairs"><tbody><tr><th></th><th>Sounds</th><th>A</th><th>B</th></tr>
        {pairRows(p.pairs).map(r => (
          <tr key={r.n}><td className="pn">{r.n}</td><td className="snd ipa">{r.sounds}</td><td>{r.a}</td><td>{r.b}</td></tr>
        ))}</tbody></table></>;
    case 'rules': return <>{label}
      {p.sounds && <VoicedLegend sounds={p.sounds} />}
      <div className="rules2">{p.rules.map((g, i) => (
        <div key={i}><h5>{g.ending}</h5>
          {g.rows.map((r, j) => <div key={j} className="rr"><span className="rs ipa">{r.sound}</span>
            <span className="rx">{r.after} <i>— {r.ex}</i></span></div>)}</div>
      ))}</div></>;
    case 'passage': return <>{label}<div className="prose" style={{ marginTop: '.4rem' }}><p><MarkedPassage text={p.text} marks={p.marks} /></p></div></>;
    case 'text': return <>{label}<p className="how" style={{ marginTop: '.2rem' }}>{p.text}</p></>;
    case 'choice': return <>{label}{p.items.map((x, i) => (
      <div key={i} className="choice-row">
        <span className="cn">{i + 1}</span>
        <YouGlishLink link={x.link}>Listen ▸</YouGlishLink>
        <div className="copts">
          {x.options.map((o, oi) => (
            <span key={oi} className={`copt${dlg.answers && oi === x.correct ? ' right' : ''}`}><b className="coptlet">{String.fromCharCode(65 + oi)}</b>{o}</span>
          ))}
          {dlg.answers && x.note && <span className="cnote">{x.note}</span>}
          {dlg.answers && <span className="cword">{x.word}</span>}
        </div>
      </div>
    ))}</>;
    case 'twisters': return <>{label}<div className="twisters"><ol>{p.items.map((x, i) => (
      <li key={i}>{x.text}<div className="twisteripa ipa">{x.ipa}</div></li>
    ))}</ol></div></>;
    case 'dictation': return <>{label}
      <div className="bank" style={{ marginBottom: '.6rem' }}>{p.chips.map((c, i) => <span key={i} className="ipa">{c}</span>)}</div>
      <div className="reveal">{p.items.map((x, i) => (
        <div key={i} className="rv"><span className="pnum">{i + 1}</span><span className="rvp">{x.prompt}</span>
          {dlg.answers && <span className="rva ipa">{x.answer}</span>}</div>
      ))}</div></>;
  }
}

function PronBody({ r }: { r: PlanRound }) {
  if (r.game) {
    const g = r.game;
    return (
      <div className="gamebox">
        <a className="gbtn" href={g.url} target="_blank" rel="noopener">{g.cta}</a>
        {g.extraUrl && <> <a className="gbtn sec" href={g.extraUrl} target="_blank" rel="noopener">{g.extraCta}</a></>}
        {g.note && <div className="gnote">{g.note}</div>}
      </div>
    );
  }
  const parts = r.parts || [];
  return <>{parts.some(hasAnswers) && <AnswersCtl />}{parts.map((p, i) => <PronPartView key={i} p={p} />)}</>;
}

function RoundBody({ t, r }: { t: Topic; r: PlanRound }) {
  if (r.parts || r.game) return <PronBody r={r} />;
  switch (r.uses) {
    case 'leadIn': return <Bank items={t.leadIn || []} />;
    case 'prep': return <>
      <Bank items={(t.vocabulary || []).map(v => v.word)} />
      {(t.structures || []).map((f, i) => (
        <div key={i} className="sframe" style={{ margin: '.7rem 0 0' }}>
          <div className="s"><Slots text={f.structure} /></div><div className="r">{f.intent}</div></div>
      ))}</>;
    case 'vocabTable': return <VocabTable t={t} style={{ marginTop: '.8rem' }} />;
    case 'vocabulary': return <Bank items={(t.vocabulary || []).map(v => v.word)} />;
    case 'structures': return <FramesByMove t={t} />;
    case 'context': {
      // older topics predate the context field — fall back to the first reading paragraph
      const ctx = t.context || (t.reading ? t.reading.passage[0] : '');
      return <>
        <div className="prose ctxpassage">{(Array.isArray(ctx) ? ctx : [ctx]).filter(Boolean).map((x, i) => <p key={i}>{x}</p>)}</div>
        <Bank items={t.leadIn || []} />
      </>;
    }
    case 'reading': return t.reading ? <div className="prose" style={{ marginTop: '.6rem' }}><p>{t.reading.passage[0]}</p></div> : null;
    case 'speaking': return t.speaking ? <RoleCards t={t} /> : null;
    case 'dialogue': return t.dialogue ? <DialogueBlock t={t} d={t.dialogue} /> : null;
    case 'prompts': return <Prompts t={t} />;
    case 'homework': return <p className="how" style={{ marginTop: '.2rem' }}>{t.homework}</p>;
  }
  return null;
}

export function PlanPhases({ t }: { t: Topic }) {
  const { hub } = useHub();
  const P = planFor(t, hub);
  return <>{Object.keys(hub.phases).map(ph => (
    <div key={ph} className="phase">
      <h3>{hub.phases[ph].title}</h3>
      {hub.phases[ph].blurb && <p className="ph">{sub(hub.phases[ph].blurb!, hub)}</p>}
      {P.map((r, i) => [r, i] as const).filter(([r]) => r.phase === ph).map(([r, i]) => {
        const each = r.min * share(r.group, hub);
        const label = r.group === 'teacher' ? 'listening' : r.group === 'solo' ? 'on your own' : 'whole class';
        const ctxLabel = r.ctxLabel || (r.ctx === 'shared' ? hub.project.name : 'your project');
        return (
          <div key={i} className={`round${r.group === 'teacher' ? ' teacherled' : ''}`} id={`r${i}`}>
            <div className="clock"><b>{r.min}{'′'}</b>{label}
              {ph === 'class' && <span className="talk">{each ? `~${each.toFixed(0)}′ talking` : '0′ talking'}</span>}</div>
            <div>
              <h4>{r.title} {r.ctx && <span className={`ctx ${r.ctx}`}>{ctxLabel}</span>}</h4>
              {r.how && <p className="how">{sub(r.how, hub)}</p>}
              {r.say && <p className="say">{'“'}{r.say}{'”'}</p>}
              <RoundBody t={t} r={r} />
            </div>
          </div>
        );
      })}
    </div>
  ))}</>;
}

export function Rail({ t, active, dueAt, onGoto }: {
  t: Topic; active: string | null; dueAt: number | null; onGoto: (id: string) => void;
}) {
  const { hub } = useHub();
  const P = planFor(t, hub);
  const at = schedule(P);
  return (
    <div className="rail" id="rail">
      {Object.keys(hub.phases).map(ph => (
        <React.Fragment key={ph}>
          <div className="railgroup">{hub.phases[ph].title.split(',')[0]}</div>
          {P.map((r, i) => [r, i] as const).filter(([r]) => r.phase === ph).map(([r, i]) => {
            const cls = [active === `r${i}` ? 'on' : '', r.phase === 'class' && dueAt === at[i] ? 'due' : ''].filter(Boolean).join(' ');
            return (
              <a key={i} data-goto={`r${i}`} className={cls || undefined} onClick={() => onGoto(`r${i}`)}>
                <span className="at">{r.phase === 'class' ? at[i] : r.min}{'′'}</span>
                <span>{r.title}</span>
              </a>
            );
          })}
        </React.Fragment>
      ))}
      {isPron(t) && t.soundNotes && <>
        <div className="railgroup">Notes</div>
        <a data-goto="notes" className={active === 'notes' ? 'on' : undefined} onClick={() => onGoto('notes')}>
          <span className="at"></span><span>Sound notes</span></a>
      </>}
    </div>
  );
}

const noteKey = (k: string) => 'e4it:note:' + k;
function loadNote(key: string) { try { return localStorage.getItem(noteKey(key)) || ''; } catch { return ''; } }
function saveNote(key: string, v: string) { try { localStorage.setItem(noteKey(key), v); } catch { /* storage blocked */ } }

function NoteField({ k }: { k: string }) {
  const [v, setV] = useState(() => loadNote(k));
  return <textarea rows={1} placeholder="Learners who need this" value={v}
    onChange={e => { setV(e.target.value); saveNote(k, e.target.value); }} />;
}

export function SoundNotes({ t }: { t: Topic }) {
  if (!t.soundNotes) return null;
  return (
    <div className="phase" id="notes"><h3>Sound notes</h3>
      <p className="ph">Who needs which sound, for your reminders in later sessions. Saved in this browser only.</p>
      {t.soundNotes.map((s, i) => (
        <div key={i} className="noterow"><span className="nl ipa">{s}</span><NoteField k={`${t.id}:${i}`} /></div>
      ))}
    </div>
  );
}
