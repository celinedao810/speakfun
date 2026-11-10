"use client";

import React, { useState } from 'react';
import type { BankRound, Framework, InterviewBank, PlanRound, Topic } from '@/lib/lessonHub/types';
import { pitchFramework, segmentFramework } from '@/lib/lessonHub/engine';
import { bankIndex } from '@/lib/lessonHub/interview';
import { Slots, useHub } from './shared';

/* Interview topics on the plan page: the question bank, each framework (flow → steps →
   frames → model answer → build your own) and, in the pitch session, the intake fields.
   The bank shows questions only, never learner data, so it's safe on a shared screen. */

/* ---------------- the class whose picks the links open ---------------- */

const CLASS_KEY = 'e4it:interviewClass';
function loadClass() { try { return localStorage.getItem(CLASS_KEY); } catch { return null; } }
function saveClass(id: string) { try { localStorage.setItem(CLASS_KEY, id); } catch { /* storage blocked */ } }

export const selectionUrl = (classId: string, track: string, tab?: 'overview') =>
  `/teacher/classes/${encodeURIComponent(classId)}/interview?track=${encodeURIComponent(track)}${tab ? `&tab=${tab}` : ''}`;

/** "Open the selection screen" for the class being taught. The choice is remembered in this browser. */
export function SelectionLink({ track, className }: { track: string; className?: string }) {
  const { classes } = useHub();
  const list = classes ?? [];
  const onTrack = list.filter(c => c.track === track);
  const [chosen, setChosen] = useState<string | null>(() => {
    const saved = loadClass();
    if (saved && list.some(c => c.id === saved)) return saved;
    return onTrack.length === 1 ? onTrack[0].id : null;
  });
  if (!list.length) return null;
  const shown = [...onTrack, ...list.filter(c => c.track !== track)];
  return (
    <span className={`ivlink ${className ?? ''}`}>
      <select value={chosen ?? ''} aria-label="Class" onChange={e => { setChosen(e.target.value || null); if (e.target.value) saveClass(e.target.value); }}>
        <option value="">Pick a class…</option>
        {shown.map(c => <option key={c.id} value={c.id}>{c.name}{c.track && c.track !== track ? ` (${c.track})` : ''}</option>)}
      </select>
      {chosen
        ? <a href={selectionUrl(chosen, track)} target="_blank" rel="noopener">Open learners&apos; picks ↗</a>
        : <span className="ivlinkoff">Open learners&apos; picks</span>}
    </span>
  );
}

/* ---------------- pieces shared by the plan page and the slides ---------------- */

export function BankRoundList({ round, slide }: { round: BankRound; slide?: boolean }) {
  const p = slide ? 'sl-' : '';
  return (
    <div className={`${p}ivbank${round.groups.reduce((n, g) => n + g.questions.length, 0) > 8 ? ' cols' : ''}`}>
      {round.groups.map(g => (
        <div key={g.id} className="ivgroup">
          <div className="ivgrouphd">{g.name}{g.framework && <span className="ivfwid">{g.framework}</span>}</div>
          <ul>{g.questions.map(q => (
            <li key={q.id}><Slots text={q.text} />{q.mandatory && <span className="ivmust">everyone</span>}
              {!g.framework && q.framework && <span className="ivfwid">{q.framework}</span>}</li>
          ))}</ul>
        </div>
      ))}
    </div>
  );
}

export const flowSteps = (flow: string) => flow.split(/\s*(?:→|->)\s*/).filter(Boolean);

export function FlowChips({ flow, slide }: { flow: string; slide?: boolean }) {
  return <div className={slide ? 'sl-ivflow' : 'ivflow'}>{flowSteps(flow).map((s, i) => (
    <React.Fragment key={i}>{i > 0 && <span className="ivarrow">→</span>}<span className="ivstep"><b>{i + 1}</b>{s}</span></React.Fragment>
  ))}</div>;
}

export function IntakeFields({ bank, slide }: { bank: InterviewBank; slide?: boolean }) {
  return <ol className={slide ? 'sl-ivintake' : 'ivintake'}>{bank.intake.map(f => (
    <li key={f.key}>{f.label}{f.required === false && <span className="ivopt">optional</span>}</li>
  ))}</ol>;
}

export function modelQuestionText(f: Framework, bank: InterviewBank | undefined) {
  return f.modelQuestion ? bankIndex(bank).get(f.modelQuestion)?.q.text ?? null : null;
}

/* ---------------- plan page ---------------- */

function FrameworkBlock({ t, f }: { t: Topic; f: Framework }) {
  const { hub } = useHub();
  const bank = hub.interviewBanks?.[t.track];
  const mq = modelQuestionText(f, bank);
  const isPitch = pitchFramework(t, hub) === f.id;
  return (
    <div className="ivfw">
      <FlowChips flow={f.flow} />
      {(f.length || f.why) && <p className="how">{f.length && <b>{f.length}. </b>}{f.why}</p>}
      {f.notes?.map((n, i) => <p key={i} className="ivnote">{n}</p>)}
      {isPitch && bank && <div className="ivbox"><div className="ivboxhd">Project intake</div>
        <p className="how">Each learner&apos;s pitch recording fills these on the selection screen, and their technical questions start from it.</p>
        <IntakeFields bank={bank} /></div>}
      {f.steps.map((s, i) => (
        <div key={i} className="move">
          <div className="movehd"><span className="movename">{i + 1}. {s.name}</span>{s.purpose && <span className="movewhy">{s.purpose}</span>}</div>
          {s.frames.map((fr, k) => (
            <div key={k} className="sframe"><div className="s"><Slots text={fr.structure} /></div>
              <div className="exs"><div className="exl">{fr.example}</div>
                {fr.alternative && <div className="exl"><span className="exlabel">or</span>{fr.alternative}</div>}</div></div>
          ))}
        </div>
      ))}
      <div className="ivmodel">
        <div className="ivboxhd">Model answer{f.modelAnswer.persona && ` · ${f.modelAnswer.persona}`}</div>
        {mq && <p className="ivmq">{mq}</p>}
        {f.modelAnswer.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {f.buildOwn && <p className="how"><b>Build your own. </b>{f.buildOwn}</p>}
    </div>
  );
}

export function InterviewRoundBody({ t, r }: { t: Topic; r: PlanRound }) {
  const { hub } = useHub();
  const bank = hub.interviewBanks?.[t.track];
  if (r.uses === 'questionBank') {
    if (!bank) return <p className="how">No question bank for {t.track} yet.</p>;
    return <>
      <SelectionLink track={t.track} />
      {bank.rounds.map(round => (
        <div key={round.id} className="ivround">
          <h5>{round.name} <span>pick {round.pick}</span></h5>
          <BankRoundList round={round} />
        </div>
      ))}
    </>;
  }
  const f = segmentFramework(t, r.uses);
  return f ? <FrameworkBlock t={t} f={f} /> : null;
}
