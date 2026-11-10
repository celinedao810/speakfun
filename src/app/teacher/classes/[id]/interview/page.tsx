"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ListChecks, Loader2, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchClass, fetchEnrollments, updateClass } from '@/lib/supabase/queries/classes';
import { fetchHub, fetchTopics, saveHubKey } from '@/lib/supabase/queries/lessonHub';
import { fetchInterviewSelections, saveInterviewSelection } from '@/lib/supabase/queries/interviewSelections';
import { validateBanks } from '@/lib/lessonHub/schema';
import { allFrameworkNames, emptySelection, frameworkNames, promoteToBank, withMandatory } from '@/lib/lessonHub/interview';
import type { Hub, InterviewSelection, Topic } from '@/lib/lessonHub/types';
import type { Class } from '@/lib/types';
import SelectionScreen, { type Learner, type SaveState } from '@/components/teacher/interview/SelectionScreen';
import ClassOverview from '@/components/teacher/interview/ClassOverview';

type Tab = 'picks' | 'overview';
const SAVE_DELAY = 600;

/** Interview prep for one class: each learner's picks (selection screen) and the whole class by framework (overview). */
export default function InterviewPrepPage() {
  const { id: classId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [cls, setCls] = useState<Class | null>(null);
  const [hub, setHub] = useState<Hub | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [track, setTrack] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, InterviewSelection>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [tab, setTab] = useState<Tab>('picks');
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // pending saves: the latest record per learner, written after a short pause
  const pending = useRef<Record<string, InterviewSelection>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const banks = hub?.interviewBanks ?? {};
  const bank = track ? banks[track] : undefined;

  // ---- load ----
  useEffect(() => {
    if (!user) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') === 'overview') setTab('overview');
    (async () => {
      try {
        const [c, enr, h, t] = await Promise.all([
          fetchClass(supabase, classId), fetchEnrollments(supabase, classId),
          fetchHub(supabase, user.id), fetchTopics(supabase, user.id),
        ]);
        if (!c) { setError('Class not found.'); return; }
        setCls(c); setHub(h); setTopics(t.map(x => x.data));
        setLearners(enr.map(e => ({ id: e.learner_id, name: e.learner_name || 'Unknown', enrolled: true })));
        const available = Object.keys(h?.interviewBanks ?? {});
        const wanted = q.get('track') || c.track || available[0] || null;
        const tr = wanted && available.includes(wanted) ? wanted : available[0] ?? null;
        setTrack(tr);
        // the class follows this track from now on (list_classes and the lesson hub links read it)
        if (tr && !c.track) { await updateClass(supabase, classId, { track: tr }); setCls({ ...c, track: tr }); }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, classId]);

  // ---- picks for the track ----
  const enrolledKey = learners.filter(l => l.enrolled).map(l => l.id).join(',');
  useEffect(() => {
    if (!user || !track || !bank) return;
    (async () => {
      try {
        const sels = await fetchInterviewSelections(supabase, user.id, { track, classId });
        const enrolled = enrolledKey ? enrolledKey.split(',') : [];
        const recs: Record<string, InterviewSelection> = {};
        enrolled.forEach(id => { recs[id] = withMandatory(sels.find(s => s.learnerId === id) ?? emptySelection(classId, id, track), bank); });
        // learners who left the class keep their picks
        const gone = sels.filter(s => !enrolled.includes(s.learnerId));
        gone.forEach(s => { recs[s.learnerId] = withMandatory(s, bank); });
        if (gone.length) {
          const { data } = await supabase.from('profiles').select('id, full_name').in('id', gone.map(s => s.learnerId));
          setLearners(ls => [...ls.filter(l => l.enrolled), ...gone.map(s => ({
            id: s.learnerId, enrolled: false,
            name: (data ?? []).find(p => p.id === s.learnerId)?.full_name || 'Unknown',
          }))]);
        }
        setRecords(recs);
        setActive(a => a && recs[a] ? a : enrolled[0] ?? null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // bank is read once per track; edits to it come back through setHub with the same track
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, track, classId, enrolledKey, !!bank]);

  // ---- autosave ----
  const flush = useCallback(async (learnerId: string) => {
    const sel = pending.current[learnerId];
    if (!sel || !user) return;
    delete pending.current[learnerId];
    setSaveState(s => ({ ...s, [learnerId]: 'saving' }));
    try {
      await saveInterviewSelection(supabase, user.id, sel);
      setSaveState(s => ({ ...s, [learnerId]: pending.current[learnerId] ? 'saving' : 'saved' }));
    } catch {
      pending.current[learnerId] ??= sel;   // keep it for the next try
      setSaveState(s => ({ ...s, [learnerId]: 'error' }));
    }
  }, [user]);

  const onChange = useCallback((learnerId: string, sel: InterviewSelection) => {
    setRecords(r => ({ ...r, [learnerId]: sel }));
    pending.current[learnerId] = sel;
    setSaveState(s => ({ ...s, [learnerId]: 'saving' }));
    clearTimeout(timers.current[learnerId]);
    timers.current[learnerId] = setTimeout(() => flush(learnerId), SAVE_DELAY);
  }, [flush]);

  // don't lose a save that's still waiting when the page goes away
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    const t = timers.current;
    return () => {
      window.removeEventListener('beforeunload', warn);
      Object.keys(pending.current).forEach(id => { clearTimeout(t[id]); void flush(id); });
    };
  }, [flush]);

  // ---- add to bank ----
  const onPromote = async (learnerId: string, customId: string, roundId: string, groupId: string, framework?: string) => {
    if (!user || !track) return 'No track.';
    try {
      // start from the hub as saved now, so a bank edit made from Claude in the meantime is kept
      const fresh = await fetchHub(supabase, user.id);
      const freshBank = fresh?.interviewBanks?.[track];
      if (!fresh || !freshBank) return 'The question bank is gone — reload the page.';
      const res = promoteToBank(freshBank, records[learnerId], customId, roundId, groupId, framework, new Date().toISOString());
      if ('error' in res) return res.error;
      const nextBanks = { ...fresh.interviewBanks, [track]: res.bank };
      const errs = validateBanks(nextBanks, fresh.tracks);
      if (errs.length) return errs[0];
      const text = records[learnerId].custom.find(c => c.id === customId)?.text ?? '';
      const saved = await saveHubKey(supabase, user.id, 'interviewBanks', nextBanks, 'web',
        `Added "${text.slice(0, 60)}" to the ${track} bank as ${res.questionId}`);
      setHub(saved);
      onChange(learnerId, res.sel);
      clearTimeout(timers.current[learnerId]);
      await flush(learnerId);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const changeTrack = async (tr: string) => {
    setTrack(tr); setRecords({});
    if (cls && cls.track !== tr) { await updateClass(supabase, classId, { track: tr }); setCls({ ...cls, track: tr }); }
  };

  const fwNames = useMemo(() => allFrameworkNames(bank, track ? frameworkNames(topics, track) : {}), [bank, topics, track]);
  const ready = bank && learners.every(l => records[l.id]);

  if (!user) return null;
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const tabBtn = (t: Tab, label: string, Icon: typeof Users) => (
    <button onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      <Icon className="w-4 h-4" />{label}</button>
  );

  return (
    <div className="text-[15px]">
      <Link href={`/teacher/classes/${classId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition">
        <ArrowLeft className="w-4 h-4" />Back to {cls?.name ?? 'class'}
      </Link>
      <div className="flex flex-wrap items-baseline gap-3 mb-1">
        <h2 className="text-xl font-bold text-slate-900">Interview prep · {cls?.name}</h2>
        {Object.keys(banks).length > 0 && track && (
          <label className="text-sm text-slate-500 flex items-center gap-2">Track
            <select value={track} onChange={e => changeTrack(e.target.value)} className="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white">
              {Object.keys(banks).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">Teacher-only: learners don&apos;t see this page. Changes save as you go.</p>

      {error && <div className="mb-4 bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>}
      {!error && !bank && (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          No interview question bank yet. Ask Claude to save one with the SpeakFun connector (update_hub, key interviewBanks).
        </div>
      )}

      {bank && <>
        <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
          {tabBtn('picks', 'Learners’ picks', ListChecks)}
          {tabBtn('overview', 'Class overview', Users)}
        </div>
        {!ready ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          : tab === 'picks'
          ? <SelectionScreen bank={bank} learners={learners} records={records} saveState={saveState} fwNames={fwNames}
              onChange={onChange} onPromote={onPromote} active={active} onActive={setActive} />
          : <ClassOverview className={cls?.name ?? ''} track={track!} bank={bank} learners={learners} records={records} fwNames={fwNames}
              onOpen={id => { setActive(id); setTab('picks'); }} />}
      </>}
    </div>
  );
}
