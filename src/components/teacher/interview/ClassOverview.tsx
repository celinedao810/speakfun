"use client";

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { InterviewBank, InterviewSelection } from '@/lib/lessonHub/types';
import { flagLabels, flagsFor, overviewByFramework, overviewText, requiredIntake, roundCount } from '@/lib/lessonHub/interview';
import { Flag, type Learner } from './SelectionScreen';

/** Where the class stands, and every pick grouped by framework: what to prepare model answers for. */
export default function ClassOverview({ className, track, bank, learners, records, fwNames, onOpen }: {
  className: string; track: string; bank: InterviewBank; learners: Learner[];
  records: Record<string, InterviewSelection>; fwNames: Record<string, string>;
  onOpen: (learnerId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const rows = learners.map(l => ({ name: l.name, sel: records[l.id] }));
  const groups = overviewByFramework(rows, bank, fwNames);
  const required = requiredIntake(bank);
  const usesIntake = bank.rounds.some(r => r.usesIntake);

  const copy = async () => {
    await navigator.clipboard.writeText(overviewText(className, track, groups));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Learner</th>
              {usesIntake && <th className="px-4 py-2.5 font-medium">Intake</th>}
              {bank.rounds.map(r => <th key={r.id} className="px-4 py-2.5 font-medium">{r.name.replace(/\s*round$/i, '')}</th>)}
              <th className="px-4 py-2.5 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {learners.map(l => {
              const s = records[l.id];
              const filled = required.filter(f => s.intake[f.key]?.trim()).length;
              const flags = flagLabels(flagsFor(s, bank)).filter(f => f !== 'intake missing');
              return (
                <tr key={l.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(l.id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{l.name}{!l.enrolled && <span className="text-xs text-slate-400"> (left class)</span>}</td>
                  {usesIntake && <td className="px-4 py-2.5">
                    {filled === required.length ? <span className="text-green-700">complete</span>
                      : filled === 0 ? <Flag>missing</Flag> : <Flag>{filled}/{required.length} fields</Flag>}</td>}
                  {bank.rounds.map(r => {
                    const n = roundCount(s, bank, r.id);
                    return <td key={r.id} className={`px-4 py-2.5 font-mono ${n >= r.pick ? 'text-green-700' : 'text-slate-700'}`}>{n}/{r.pick}</td>;
                  })}
                  <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{flags.map(f => <Flag key={f}>{f}</Flag>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">Picked questions by framework</h3>
          <button onClick={copy} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-sm hover:bg-slate-50">
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy as text'}
          </button>
        </div>
        {groups.length === 0 && <p className="text-sm text-slate-500">No picks yet.</p>}
        <div className="space-y-6">
          {groups.map(g => (
            <section key={g.framework ?? 'none'}>
              <h4 className={`text-sm font-semibold mb-2 ${g.framework ? 'text-indigo-700' : 'text-slate-500'}`}>{g.label}</h4>
              <ul className="divide-y divide-slate-100">
                {g.items.map(i => (
                  <li key={i.key} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-sm w-6 text-right text-slate-500">{i.learners.length}</span>
                    <span className="flex-1 min-w-[16rem] text-slate-800">{i.text}
                      {i.tag && <span className="ml-2 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{i.tag}</span>}</span>
                    <span className="text-sm text-slate-500">{i.learners.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
