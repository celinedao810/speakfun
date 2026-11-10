"use client";

import React, { useState } from 'react';
import type { BankRound, Framework, InterviewBank, PlanRound, Topic } from '@/lib/lessonHub/types';
import type { FrameworkAnswer } from '@/lib/lessonHub/interview';
import { segmentFramework } from '@/lib/lessonHub/engine';
import {
  allFrameworkNames, answersForFramework, frameworkLabel, frameworkNames, isPicked, picksByFramework, picksByRound,
  picksForFramework, picksText,
} from '@/lib/lessonHub/interview';
import { Slots, useHub } from './shared';

/* Interview topics: the question bank (click a question to put it on the class's list),
   each framework (flow → steps and frames → model answer → build your own) with the
   class's questions it answers, and the pick list view. The class's list is shared by
   every interview session of the track; there's no per-learner data. */

/* ---------------- the bank, clickable ---------------- */

/**
 * A bank round with the class's picks ticked. Click a question to add or remove it (mandatory ones stay).
 * With `editable` (the pick list view only, never on slides) each question also gets "Remove from bank".
 */
export function BankRoundList({ round, track, slide, editable }: { round: BankRound; track: string; slide?: boolean; editable?: boolean }) {
  const { interview } = useHub();
  const remove = interview && editable ? async (id: string, text: string) => {
    if (!confirm(`Remove "${text}" from the ${track} bank?\n\nIt also comes off the class's list. Future classes won't see it. The hub keeps the previous version.`)) return;
    const err = await interview.removeFromBank(track, id);
    if (err) alert(err);
  } : undefined;
  const p = interview?.picks[track];
  const requested = (p?.requested ?? []).filter(r => r.round === round.id);
  const n = round.groups.reduce((k, g) => k + g.questions.length, 0) + requested.length;
  return (
    <div className={`${slide ? 'sl-' : ''}ivbank${n > 8 ? ' cols' : ''}`}>
      {round.groups.map(g => (
        <div key={g.id} className="ivgroup">
          <div className="ivgrouphd">{g.name}{g.framework && <span className="ivfwid">{g.framework}</span>}</div>
          <ul>{g.questions.map(q => <Q key={q.id} text={q.text} on={!!q.mandatory || isPicked(p, q.id)} locked={q.mandatory}
            fw={g.framework ? null : q.framework} onClick={interview ? () => interview.toggle(track, q.id) : undefined}
            onRemove={remove && !q.mandatory ? () => remove(q.id, q.text) : undefined} />)}</ul>
        </div>
      ))}
      {requested.length > 0 && <div className="ivgroup">
        <div className="ivgrouphd">Requested by the class</div>
        <ul>{requested.map(r => <Q key={r.id} text={r.text} on fw={r.framework} />)}</ul>
      </div>}
    </div>
  );
}

function Q({ text, on, locked, fw, onClick, onRemove }: {
  text: string; on: boolean; locked?: boolean; fw?: string | null; onClick?: () => void; onRemove?: () => void;
}) {
  return (
    <li className={`${on ? 'on' : ''}${onClick && !locked ? ' can' : ''}`} onClick={locked ? undefined : onClick}>
      <span className="ivtick" aria-hidden>{on ? '✓' : ''}</span>
      <span className="ivqtext"><Slots text={text} />{locked && <span className="ivmust">everyone</span>}{fw && <span className="ivfwid">{fw}</span>}</span>
      {onRemove && <button type="button" className="ivremove" title="Remove from bank"
        onClick={e => { e.stopPropagation(); onRemove(); }}>Remove</button>}
    </li>
  );
}

export const flowSteps = (flow: string) => flow.split(/\s*(?:→|->)\s*/).filter(Boolean);

export function FlowChips({ flow, slide }: { flow: string; slide?: boolean }) {
  return <div className={slide ? 'sl-ivflow' : 'ivflow'}>{flowSteps(flow).map((s, i) => (
    <React.Fragment key={i}>{i > 0 && <span className="ivarrow">→</span>}<span className="ivstep"><b>{i + 1}</b>{s}</span></React.Fragment>
  ))}</div>;
}

/** The framework's model answers for the class's questions (see answersForFramework). */
export function useFrameworkAnswers(track: string, f: Framework): FrameworkAnswer[] {
  const { hub, interview } = useHub();
  const bank = hub.interviewBanks?.[track];
  if (!bank) return f.modelAnswer ? [{ question: { id: f.modelQuestion ?? f.id, text: '', framework: f.id }, answer: f.modelAnswer }] : [];
  return answersForFramework(interview?.picks[track], bank, f);
}

/** The class's questions this framework answers. */
export function ClassQuestions({ track, fw, slide }: { track: string; fw: string; slide?: boolean }) {
  const { hub, interview } = useHub();
  const bank = hub.interviewBanks?.[track];
  if (!bank) return null;
  const qs = picksForFramework(interview?.picks[track], bank, fw);
  if (!qs.length) return null;
  return <div className={slide ? 'sl-ivclass' : 'ivclass'}>
    <div className="ivboxhd">The class&apos;s questions for this framework</div>
    <ul>{qs.map(q => <li key={q.id}><Slots text={q.text} />{q.requested && <span className="ivreq">requested</span>}</li>)}</ul>
  </div>;
}

/** Every step and its frames, on one screen. */
export function FrameworkFrames({ f, slide }: { f: Framework; slide?: boolean }) {
  const n = f.steps.reduce((k, s) => k + s.frames.length, 0);
  if (!slide) return <>{f.steps.map((s, i) => (
    <div key={i} className="move">
      <div className="movehd"><span className="movename">{i + 1}. {s.name}</span>{s.purpose && <span className="movewhy">{s.purpose}</span>}</div>
      {s.frames.map((fr, k) => (
        <div key={k} className="sframe"><div className="s"><Slots text={fr.structure} /></div>
          <div className="exs"><div className="exl">{fr.example}</div>
            {fr.alternative && <div className="exl"><span className="exlabel">or</span>{fr.alternative}</div>}</div></div>
      ))}
    </div>
  ))}</>;
  return <div className={`sl-ivsteps${n > 5 ? ' cols' : ''}`}>{f.steps.map((s, i) => (
    <div key={i} className="sl-ivbstep">
      <div className="sl-movehd"><span className="mn">{i + 1}</span>{s.name}</div>
      {s.frames.map((fr, k) => (
        <div key={k} className="sl-ivframe"><div className="s"><Slots text={fr.structure} /></div>
          <div className="e">{fr.example}</div>
          {fr.alternative && <div className="e"><span className="exlabel">or</span>{fr.alternative}</div>}</div>
      ))}
    </div>
  ))}</div>;
}

/* ---------------- plan page ---------------- */

function FrameworkBlock({ t, f }: { t: Topic; f: Framework }) {
  const answers = useFrameworkAnswers(t.track, f);
  return (
    <div className="ivfw">
      <FlowChips flow={f.flow} />
      {(f.length || f.why) && <p className="how">{f.length && <b>{f.length}. </b>}{f.why}</p>}
      {f.notes?.map((n, i) => <p key={i} className="ivnote">{n}</p>)}
      <ClassQuestions track={t.track} fw={f.id} />
      <FrameworkFrames f={f} />
      {answers.map(({ question: q, answer: a }) => (
        <div key={q.id} className={`ivmodel${a ? '' : ' missing'}`}>
          <div className="ivboxhd">Model answer{a?.persona && ` · ${a.persona}`}</div>
          {q.text && <p className="ivmq"><Slots text={q.text} /></p>}
          {a ? a.paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p className="ivnone">{q.requested
              ? 'Not written yet. Add this question to the bank first (Interview picks), then ask Claude for a model answer.'
              : 'Not written yet. Ask Claude to write one with the SpeakFun connector before this session.'}</p>}
        </div>
      ))}
      {f.buildOwn && <p className="how"><b>Build your own. </b>{f.buildOwn}</p>}
    </div>
  );
}

export function InterviewRoundBody({ t, r }: { t: Topic; r: PlanRound }) {
  const { hub, interview, openPicks } = useHub();
  const bank = hub.interviewBanks?.[t.track];
  if (r.uses === 'questionBank') {
    if (!bank) return <p className="how">No question bank for {t.track} yet.</p>;
    return <>
      <p className="how">Click a question to put it on the class&apos;s list; every interview session follows it.
        {openPicks && <> <button type="button" className="ivlinkbtn" onClick={() => openPicks(t.track)}>Open the pick list</button> to add a question a learner asks for.</>}</p>
      {bank.rounds.map(round => (
        <div key={round.id} className="ivround">
          <h5>{round.name} <span>{picksByRound(interview?.picks[t.track], bank).find(x => x.round.id === round.id)?.questions.length ?? 0} on the list</span></h5>
          <BankRoundList round={round} track={t.track} />
        </div>
      ))}
    </>;
  }
  const f = segmentFramework(t, r.uses);
  return f ? <FrameworkBlock t={t} f={f} /> : null;
}

/* ---------------- the pick list view ---------------- */

export function PicksView({ topics, track, setTrack, back }: {
  topics: Topic[]; track: string; setTrack: (t: string) => void; back: () => void;
}) {
  const { hub, interview } = useHub();
  const tracks = Object.keys(hub.interviewBanks ?? {});
  const bank = hub.interviewBanks?.[track];
  const [copied, setCopied] = useState(false);
  if (!bank || !interview) return <>
    <button type="button" className="back" onClick={back}>Back to topics</button>
    <p className="note">No interview question bank yet. Ask Claude to save one with the SpeakFun connector.</p>
  </>;
  const p = interview.picks[track];
  const names = allFrameworkNames(bank, frameworkNames(topics, track));
  const groups = picksByFramework(p, bank, names);
  const rounds = picksByRound(p, bank);
  const state = interview.saving[track];

  const copy = async () => {
    await navigator.clipboard.writeText(picksText(track, groups));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const clear = async () => {
    if (!confirm(`Clear the ${track} pick list? The question bank stays as it is.`)) return;
    await interview.clear(track);
  };

  return (
    <>
      <button type="button" className="back" onClick={back}>Back to topics</button>
      <div className="thead">
        <div className="kicker">Interview prep · {track}</div>
        <h2>The class&apos;s questions</h2>
        <p className="says">Tick what the class picks from the bank; every interview session follows this list.
          When the series is over, clear it for the next class. The bank stays.</p>
        <div className="facts">
          {rounds.map(r => <span key={r.round.id}>{r.questions.length} {r.round.name.replace(/\s*round$/i, '').toLowerCase()}</span>)}
          <span className="ivsaved">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved — check your connection' : ''}</span>
        </div>
      </div>
      {tracks.length > 1 && <div className="tabs">{tracks.map(x => <button type="button" key={x} className={x === track ? 'on' : ''} onClick={() => setTrack(x)}>{x}</button>)}</div>}

      {bank.rounds.map(round => (
        <div key={round.id} className="msec">
          <h3>{round.name}</h3>
          <BankRoundList round={round} track={track} editable />
          <RequestedEditor track={track} round={round} bank={bank} names={names} />
        </div>
      ))}

      {rounds.some(r => r.questions.some(q => q.removedFromBank)) && <div className="msec"><h3>Removed from the bank</h3>
        <ul className="ivplain">{rounds.flatMap(r => r.questions).filter(q => q.removedFromBank).map(q => (
          <li key={q.id}>{q.text} <button type="button" className="ivlinkbtn" onClick={() => interview.toggle(track, q.id)}>Take off the list</button></li>
        ))}</ul></div>}

      <div className="msec">
        <h3>By framework <button type="button" className="ivbtn" onClick={copy}>{copied ? 'Copied' : 'Copy as text'}</button></h3>
        {groups.map(g => (
          <div key={g.framework ?? 'none'} className="ivbyfw">
            <div className="ivgrouphd">{g.label}</div>
            <ul>{g.questions.map(q => <li key={q.id}><Slots text={q.text} />{q.requested && <span className="ivreq">requested</span>}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="msec">
        <h3>When the series is over</h3>
        <p className="how">Clearing empties this list so the next class starts fresh. Questions you added to the bank stay in it.</p>
        <button type="button" className="ivbtn danger" onClick={clear}>Clear the pick list</button>
      </div>
    </>
  );
}

function FrameworkSelect({ value, onChange, names }: { value: string; onChange: (v: string) => void; names: Record<string, string> }) {
  return <select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">No framework yet</option>
    {Object.keys(names).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(id => <option key={id} value={id}>{frameworkLabel(id, names)}</option>)}
  </select>;
}

/** Questions a learner asked for: add one, remove one, or move it into the bank. */
function RequestedEditor({ track, round, bank, names }: { track: string; round: BankRound; bank: InterviewBank; names: Record<string, string> }) {
  const { interview } = useHub();
  const [text, setText] = useState('');
  const [fw, setFw] = useState('');
  const requested = (interview?.picks[track]?.requested ?? []).filter(r => r.round === round.id);
  if (!interview) return null;
  return (
    <div className="ivreqed">
      {requested.map(r => <PromoteRow key={r.id} track={track} r={r} round={round} bank={bank} names={names} />)}
      <div className="ivadd">
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`A question a learner asked for (${round.name.toLowerCase()})`}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { interview.addRequested(track, round.id, text, fw || undefined); setText(''); } }} />
        <FrameworkSelect value={fw} onChange={setFw} names={names} />
        <button type="button" className="ivbtn" disabled={!text.trim()}
          onClick={() => { interview.addRequested(track, round.id, text, fw || undefined); setText(''); }}>Add</button>
      </div>
    </div>
  );
}

function PromoteRow({ track, r, round, bank, names }: {
  track: string; r: { id: string; text: string; framework?: string }; round: BankRound; bank: InterviewBank; names: Record<string, string>;
}) {
  const { interview } = useHub();
  const [open, setOpen] = useState(false);
  const fitting = round.groups.find(g => g.framework && g.framework === r.framework) ?? round.groups[0];
  const [groupId, setGroupId] = useState(fitting?.id ?? '');
  const [fw, setFw] = useState(r.framework ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const group = round.groups.find(g => g.id === groupId);
  if (!interview) return null;
  return (
    <div className="ivreqrow">
      <div className="ivreqline">
        <span className="ivreq">requested</span><span className="ivreqtext">{r.text}</span>
        {r.framework && <span className="ivfwid">{r.framework}</span>}
        <button type="button" className="ivlinkbtn" onClick={() => setOpen(o => !o)}>Add to bank</button>
        <button type="button" className="ivlinkbtn muted" onClick={() => interview.removeRequested(track, r.id)}>Remove</button>
      </div>
      {open && <div className="ivpromote">
        <label>Group <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          {round.groups.map(g => <option key={g.id} value={g.id}>{g.name}{g.framework ? ` (${g.framework})` : ''}</option>)}</select></label>
        {group && !group.framework && <label>Framework <FrameworkSelect value={fw} onChange={setFw} names={names} /></label>}
        <button type="button" className="ivbtn" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          const e = await interview.promote(track, r.id, round.id, groupId, fw || undefined);
          setBusy(false);
          if (e) setErr(e); else setOpen(false);
        }}>{busy ? 'Adding…' : 'Add to the bank'}</button>
        <span className="ivhint">Future classes can pick it too. The hub keeps the previous version.</span>
        {err && <span className="iverr">{err}</span>}
      </div>}
    </div>
  );
}
