"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, GitBranch, List, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import type { BankRound, CustomQuestion, InterviewBank, InterviewSelection } from '@/lib/lessonHub/types';
import {
  addCustom, chainFor, flagLabels, flagsFor, frameworkLabel, questionParts, removeCustom, resolveRound,
  roundCount, saveIntake, setSlot, togglePick, type ResolvedQuestion,
} from '@/lib/lessonHub/interview';

export type SaveState = 'saving' | 'saved' | 'error' | undefined;
export interface Learner { id: string; name: string; enrolled: boolean }

interface Props {
  bank: InterviewBank;
  learners: Learner[];
  records: Record<string, InterviewSelection>;
  saveState: Record<string, SaveState>;
  fwNames: Record<string, string>;
  onChange: (learnerId: string, sel: InterviewSelection) => void;
  onPromote: (learnerId: string, customId: string, roundId: string, groupId: string, framework?: string) => Promise<string | null>;
  active: string | null;
  onActive: (learnerId: string) => void;
}

const now = () => new Date().toISOString();

/** The teacher records each learner's picks here (learners don't see this screen in v1). Saves as you go. */
export default function SelectionScreen({ bank, learners, records, saveState, fwNames, onChange, onPromote, active, onActive }: Props) {
  const learner = learners.find(l => l.id === active) ?? learners[0];
  if (!learner) return <p className="text-slate-500">No learners in this class yet.</p>;
  const sel = records[learner.id];

  return (
    <div className="grid gap-5 md:grid-cols-[15rem_1fr] items-start">
      <nav className="bg-white border border-slate-200 rounded-xl overflow-hidden md:sticky md:top-20">
        {learners.map(l => {
          const s = records[l.id];
          const flags = flagLabels(flagsFor(s, bank));
          return (
            <button key={l.id} onClick={() => onActive(l.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 transition ${l.id === learner.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
              <div className="font-medium text-slate-900">{l.name}{!l.enrolled && <span className="text-xs text-slate-400"> (left class)</span>}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {bank.rounds.map(r => `${shortName(r)} ${roundCount(s, bank, r.id)}/${r.pick}`).join(' · ')}
              </div>
              {flags.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{flags.map(f => <Flag key={f}>{f}</Flag>)}</div>}
            </button>
          );
        })}
      </nav>

      <div key={learner.id} className="space-y-5 min-w-0">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{learner.name}</h3>
          <SavedBadge state={saveState[learner.id]} />
        </div>
        {bank.rounds.map(r => (
          <RoundPanel key={r.id} round={r} bank={bank} sel={sel} fwNames={fwNames}
            onChange={s => onChange(learner.id, s)}
            onPromote={(cid, rid, gid, fw) => onPromote(learner.id, cid, rid, gid, fw)} />
        ))}
      </div>
    </div>
  );
}

const shortName = (r: BankRound) => r.name.replace(/\s*round$/i, '');

export function Flag({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'slate' }) {
  return <span className={`text-[11px] leading-none px-1.5 py-1 rounded ${tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{children}</span>;
}

function SavedBadge({ state }: { state: SaveState }) {
  if (state === 'saving') return <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving</span>;
  if (state === 'saved') return <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>;
  if (state === 'error') return <span className="text-xs text-red-600">Not saved — check your connection</span>;
  return null;
}

/* ---------------- one round ---------------- */

function RoundPanel({ round, bank, sel, fwNames, onChange, onPromote }: {
  round: BankRound; bank: InterviewBank; sel: InterviewSelection; fwNames: Record<string, string>;
  onChange: (s: InterviewSelection) => void;
  onPromote: (customId: string, roundId: string, groupId: string, framework?: string) => Promise<string | null>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kind: CustomQuestion['kind']; parentId?: string } | null>(null);
  const [chain, setChain] = useState(false);
  const resolved = resolveRound(sel, bank, round);
  const picked = new Map(sel.picks.map(p => [p.questionId, p]));
  const removed = resolved.questions.filter(q => q.removedFromBank);
  const requested = resolved.questions.filter(q => q.source === 'requested');
  const followUpsOf = (id: string) => resolved.followUps.filter(f => f.parentId === id);
  const pickedIds = new Set(resolved.questions.map(q => q.id));
  const looseFollowUps = resolved.followUps.filter(f => !f.parentId || !pickedIds.has(f.parentId));

  const toggle = (id: string) => {
    const r = togglePick(sel, bank, id, now());
    setMsg(r.error ?? null);
    if (!r.error) onChange(r.sel);
  };
  const del = (id: string) => { setMsg(null); onChange(removeCustom(sel, id, now())); };
  const full = resolved.count >= round.pick;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <header className="flex flex-wrap items-center gap-3 mb-3">
        <h4 className="font-semibold text-slate-900">{round.name}</h4>
        <span className={`text-sm font-mono px-2 py-0.5 rounded ${full ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{resolved.count} / {round.pick}</span>
        {round.usesIntake && (
          <button onClick={() => setChain(c => !c)} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50">
            {chain ? <><List className="w-4 h-4" />List view</> : <><GitBranch className="w-4 h-4" />Chain view</>}
          </button>
        )}
      </header>
      {msg && <div className="mb-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{msg}</div>}

      {round.usesIntake && <IntakeForm bank={bank} sel={sel} onChange={onChange} />}

      {chain && round.usesIntake ? <ChainView round={resolved} sel={sel} bank={bank} /> : <>
        {round.groups.map(g => (
          <div key={g.id} className="mt-4 first:mt-0">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-2">
              {g.name}{g.framework && <span className="font-mono normal-case text-indigo-600">{g.framework}</span>}
            </div>
            <ul className="divide-y divide-slate-100">
              {g.questions.map(q => {
                const p = picked.get(q.id);
                return (
                  <li key={q.id} className="py-2">
                    <label className={`flex items-start gap-2.5 ${q.mandatory ? '' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="mt-1 w-4 h-4 accent-indigo-600" checked={!!p} disabled={q.mandatory} onChange={() => toggle(q.id)} />
                      <span className="text-slate-800 leading-snug">
                        <QuestionText text={q.text} values={p?.slotValues} />
                        {q.mandatory && <span className="ml-2 text-[11px] bg-lime-200 text-lime-900 px-1.5 py-0.5 rounded">everyone</span>}
                        {!g.framework && q.framework && <span className="ml-2 text-xs font-mono text-indigo-600">{q.framework}</span>}
                      </span>
                    </label>
                    {p && q.slots?.length ? (
                      <div className="ml-7 mt-2 flex flex-wrap gap-2">
                        {q.slots.map(s => (
                          <label key={s.name} className="text-xs text-slate-500 flex flex-col gap-0.5">
                            <span>{s.name}{s.fromIntake && <span className="text-slate-400"> · from intake</span>}</span>
                            <input value={p.slotValues?.[s.name] ?? ''} placeholder={s.name}
                              onChange={e => onChange(setSlot(sel, q.id, s.name, e.target.value, now()))}
                              className={`text-sm text-slate-900 border rounded-md px-2 py-1 w-56 outline-none focus:ring-2 focus:ring-indigo-500 ${p.slotValues?.[s.name]?.trim() ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`} />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {p && <FollowUps items={followUpsOf(q.id)} onDelete={del}
                      onAdd={round.usesIntake ? () => setAdding({ kind: 'follow-up', parentId: q.id }) : undefined} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {removed.length > 0 && <Extra title="Removed from bank">
          {removed.map(q => (
            <li key={q.id} className="py-2 flex items-start gap-2">
              <span className="flex-1 text-slate-600">{q.text} <span className="text-xs text-slate-400">(removed from bank)</span></span>
              <IconBtn title="Remove" onClick={() => toggle(q.id)}><Trash2 className="w-4 h-4" /></IconBtn>
            </li>
          ))}
        </Extra>}

        {requested.length > 0 && <Extra title="Requested by the learner">
          {requested.map(q => <RequestedRow key={q.id} q={q} round={round} bank={bank} fwNames={fwNames}
            followUps={followUpsOf(q.id)} onDelete={del} onPromote={onPromote}
            onAddFollowUp={round.usesIntake ? () => setAdding({ kind: 'follow-up', parentId: q.id }) : undefined} />)}
        </Extra>}

        {looseFollowUps.length > 0 && <Extra title={round.usesIntake ? 'Follow-ups without a parent question' : "Teacher's follow-ups"}>
          {looseFollowUps.map(f => <li key={f.id} className="py-2"><FollowUpLine f={f} onDelete={del} /></li>)}
        </Extra>}
      </>}

      {adding
        ? <AddForm round={round} sel={sel} bank={bank} fwNames={fwNames} initial={adding}
            pickable={resolved.questions.filter(q => !q.removedFromBank)}
            onCancel={() => setAdding(null)}
            onAdd={input => {
              const r = addCustom(sel, bank, { round: round.id, ...input });
              if (r.error) return r.error;
              onChange({ ...r.sel, updatedAt: now() }); setAdding(null); setMsg(null); return null;
            }} />
        : <button onClick={() => setAdding({ kind: full ? 'follow-up' : 'requested' })}
            className="mt-4 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"><Plus className="w-4 h-4" />Add a question</button>}
    </section>
  );
}

function Extra({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-5"><div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">{title}</div>
    <ul className="divide-y divide-slate-100">{children}</ul></div>;
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} aria-label={title} onClick={onClick} className="text-slate-400 hover:text-slate-700 p-1 shrink-0">{children}</button>;
}

/** A question with its slots: filled ones as values, empty ones as highlighted [slot]. */
export function QuestionText({ text, values }: { text: string; values?: Record<string, string> }) {
  return <>{questionParts(text, values).map((p, i) => 'text' in p ? <React.Fragment key={i}>{p.text}</React.Fragment>
    : p.value ? <span key={i} className="text-indigo-700">{p.value}</span>
    : <span key={i} className="font-mono text-[0.85em] bg-amber-100 text-amber-900 px-1 rounded">[{p.slot}]</span>)}</>;
}

function FollowUpLine({ f, onDelete }: { f: ResolvedQuestion; onDelete?: (id: string) => void }) {
  return <div className="flex items-start gap-2 text-sm">
    <span className="text-slate-400 shrink-0">↳</span>
    <span className="flex-1 text-slate-700">{f.text}{f.framework && <span className="ml-2 text-xs font-mono text-indigo-600">{f.framework}</span>}
      <span className="ml-2 text-[11px] text-slate-400">follow-up</span></span>
    {onDelete && <IconBtn title="Remove follow-up" onClick={() => onDelete(f.id)}><X className="w-3.5 h-3.5" /></IconBtn>}
  </div>;
}

function FollowUps({ items, onDelete, onAdd }: { items: ResolvedQuestion[]; onDelete: (id: string) => void; onAdd?: () => void }) {
  if (!items.length && !onAdd) return null;
  return <div className="ml-7 mt-1.5 space-y-1">
    {items.map(f => <FollowUpLine key={f.id} f={f} onDelete={onDelete} />)}
    {onAdd && <button onClick={onAdd} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus className="w-3 h-3" />Add follow-up</button>}
  </div>;
}

function RequestedRow({ q, round, bank, fwNames, followUps, onDelete, onPromote, onAddFollowUp }: {
  q: ResolvedQuestion; round: BankRound; bank: InterviewBank; fwNames: Record<string, string>; followUps: ResolvedQuestion[];
  onDelete: (id: string) => void; onAddFollowUp?: () => void;
  onPromote: (customId: string, roundId: string, groupId: string, framework?: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [roundId, setRoundId] = useState(round.id);
  const target = bank.rounds.find(r => r.id === roundId) ?? round;
  const fitting = target.groups.find(g => g.framework && g.framework === q.framework) ?? target.groups[0];
  const [groupId, setGroupId] = useState(fitting?.id ?? '');
  const group = target.groups.find(g => g.id === groupId);
  const [fw, setFw] = useState(q.framework ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!target.groups.some(g => g.id === groupId)) setGroupId(target.groups[0]?.id ?? ''); }, [target, groupId]);

  return <li className="py-2">
    <div className="flex items-start gap-2">
      <span className="flex-1 text-slate-800">{q.text}
        {q.framework && <span className="ml-2 text-xs font-mono text-indigo-600">{q.framework}</span>}
        <span className="ml-2 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">requested</span></span>
      <button onClick={() => setOpen(o => !o)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 shrink-0">
        <Upload className="w-3.5 h-3.5" />Add to bank</button>
      <IconBtn title="Remove" onClick={() => onDelete(q.id)}><Trash2 className="w-4 h-4" /></IconBtn>
    </div>
    {open && <div className="mt-2 ml-1 p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-end gap-3 text-sm">
      <Field label="Round"><select value={roundId} onChange={e => setRoundId(e.target.value)} className={inputCls}>
        {bank.rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label="Group"><select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
        {target.groups.map(g => <option key={g.id} value={g.id}>{g.name}{g.framework ? ` (${g.framework})` : ''}</option>)}</select></Field>
      {group && !group.framework && <Field label="Framework"><FrameworkSelect value={fw} onChange={setFw} bank={bank} fwNames={fwNames} /></Field>}
      <button disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        const e = await onPromote(q.id, roundId, groupId, fw || undefined);
        setBusy(false);
        if (e) setErr(e); else setOpen(false);
      }} className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
        {busy ? 'Adding…' : 'Add to the bank'}</button>
      <p className="basis-full text-xs text-slate-500">It becomes a bank question other learners can pick too, and a normal pick for this learner. The hub keeps the previous version.</p>
      {err && <p className="basis-full text-xs text-red-600">{err}</p>}
    </div>}
    <FollowUps items={followUps} onDelete={onDelete} onAdd={onAddFollowUp} />
  </li>;
}

const inputCls = 'text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-slate-500">{label}{children}</label>;
}

function FrameworkSelect({ value, onChange, bank, fwNames }: { value: string; onChange: (v: string) => void; bank: InterviewBank; fwNames: Record<string, string> }) {
  const ids = useMemo(() => {
    const s = new Set<string>(Object.keys(fwNames));
    bank.rounds.forEach(r => r.groups.forEach(g => { if (g.framework) s.add(g.framework); g.questions.forEach(q => q.framework && s.add(q.framework)); }));
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [bank, fwNames]);
  return <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
    <option value="">No framework yet</option>
    {ids.map(id => <option key={id} value={id}>{frameworkLabel(id, fwNames)}</option>)}
  </select>;
}

function AddForm({ round, sel, bank, fwNames, initial, pickable, onAdd, onCancel }: {
  round: BankRound; sel: InterviewSelection; bank: InterviewBank; fwNames: Record<string, string>;
  initial: { kind: CustomQuestion['kind']; parentId?: string }; pickable: ResolvedQuestion[];
  onAdd: (input: { kind: CustomQuestion['kind']; text: string; framework?: string; parentId?: string }) => string | null;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState(initial.kind);
  const [parentId, setParentId] = useState(initial.parentId ?? '');
  const parentFw = pickable.find(q => q.id === parentId)?.framework ?? '';
  const [fw, setFw] = useState(parentFw);
  const [err, setErr] = useState<string | null>(null);
  const full = roundCount(sel, bank, round.id) >= round.pick;
  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} autoFocus placeholder="The question"
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <Field label="Kind">
          <div className="flex gap-1">
            {(['requested', 'follow-up'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-md border ${kind === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {k === 'requested' ? 'Requested (takes a place)' : 'Follow-up (extra)'}</button>
            ))}
          </div>
        </Field>
        <Field label="Framework (optional)"><FrameworkSelect value={fw} onChange={setFw} bank={bank} fwNames={fwNames} /></Field>
        {kind === 'follow-up' && round.usesIntake && <Field label="Follows">
          <select value={parentId} onChange={e => setParentId(e.target.value)} className={`${inputCls} max-w-xs`}>
            <option value="">The project in general</option>
            {pickable.map(q => <option key={q.id} value={q.id}>{q.text.length > 60 ? q.text.slice(0, 57) + '…' : q.text}</option>)}
          </select></Field>}
      </div>
      {kind === 'requested' && full && <p className="text-xs text-amber-700">{round.name} already has {round.pick} questions — remove one first, or add it as a follow-up.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => setErr(onAdd({ kind, text, framework: fw || undefined, parentId: kind === 'follow-up' && parentId ? parentId : undefined }))}
          className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700">Add</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- intake and chain ---------------- */

function IntakeForm({ bank, sel, onChange }: { bank: InterviewBank; sel: InterviewSelection; onChange: (s: InterviewSelection) => void }) {
  const [draft, setDraft] = useState(sel.intake);
  useEffect(() => { setDraft(sel.intake); }, [sel.intake]);
  const dirty = bank.intake.some(f => (draft[f.key] ?? '').trim() !== (sel.intake[f.key] ?? ''));
  const missing = flagsFor(sel, bank).intakeMissing;
  return (
    <div className="mb-5 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-baseline gap-2 mb-3">
        <span className="font-medium text-slate-800">Project intake</span>
        <span className="text-xs text-slate-500">Fill it from the learner&apos;s project pitch recording. Vietnamese is fine. Saving fills the empty slots below; slots already filled stay as they are.</span>
      </div>
      {sel.intakeChanged && (
        <div className="mb-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4" />Intake changed after picks — check the filled slots below still match the project.
          <button onClick={() => onChange({ ...sel, intakeChanged: false, updatedAt: now() })} className="ml-auto text-xs px-2 py-1 rounded border border-amber-300 hover:bg-amber-100">Checked</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {bank.intake.map(f => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
            <span>{f.label}{f.required === false && <span className="text-slate-400"> · optional</span>}</span>
            <input value={draft[f.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
              className="text-sm text-slate-900 border border-slate-300 rounded-md px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={!dirty} onClick={() => onChange(saveIntake(sel, bank, draft, now()))}
          className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-40">Save intake</button>
        {dirty && <span className="text-xs text-amber-700">Not saved yet</span>}
        {!dirty && missing && <span className="text-xs text-slate-500">Waiting for the pitch recording — questions can be picked meanwhile.</span>}
      </div>
    </div>
  );
}

function ChainView({ round, sel, bank }: { round: ReturnType<typeof resolveRound>; sel: InterviewSelection; bank: InterviewBank }) {
  const c = chainFor(round);
  const intake = bank.intake.map(f => sel.intake[f.key]).filter(Boolean).join(' · ');
  const Node = ({ q, children, last }: { q: ResolvedQuestion; children?: React.ReactNode; last?: boolean }) => (
    <li className={`relative pl-6 ${last ? '' : 'pb-2'}`}>
      <span className="absolute left-1 top-0 bottom-0 border-l border-slate-300" style={last ? { bottom: 'calc(100% - 0.8rem)' } : undefined} />
      <span className="absolute left-1 top-[0.8rem] w-4 border-t border-slate-300" />
      <div className={q.source === 'follow-up' ? 'text-sm text-slate-600 italic' : 'text-slate-800'}>
        {q.source === 'follow-up' && <span className="not-italic text-xs text-slate-400 mr-1">Follow-up:</span>}
        {q.text}
        {q.framework && <span className="ml-2 text-xs font-mono not-italic text-indigo-600">{q.framework}</span>}
        {q.emptySlots && <span className="ml-2"><Flag>slots to fill</Flag></span>}
        {q.source === 'requested' && <span className="ml-2"><Flag tone="slate">requested</Flag></span>}
      </div>
      {children}
    </li>
  );
  const kids = [...c.rootFollowUps.map(f => ({ q: f, followUps: [] as ResolvedQuestion[] })), ...c.children];
  return (
    <div className="text-[15px]">
      <div className="mb-2 text-sm"><span className="font-medium text-slate-700">Intake: </span>
        {intake ? <span className="text-slate-700">{intake}</span> : <Flag>intake missing</Flag>}</div>
      {c.root ? (
        <ul><Node q={c.root} last>
          <ul className="mt-2">{kids.map((k, i) => (
            <Node key={k.q.id} q={k.q} last={i === kids.length - 1}>
              {k.followUps.length > 0 && <ul className="mt-1">{k.followUps.map((f, j) => <Node key={f.id} q={f} last={j === k.followUps.length - 1} />)}</ul>}
            </Node>
          ))}</ul>
        </Node></ul>
      ) : <p className="text-sm text-slate-500">No mandatory question in this round.</p>}
      {c.orphans.length > 0 && <div className="mt-4"><div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Follow-ups without a parent question</div>
        {c.orphans.map(f => <FollowUpLine key={f.id} f={f} />)}</div>}
    </div>
  );
}
