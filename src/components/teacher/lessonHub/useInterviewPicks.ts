"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchHub, saveHubKey } from '@/lib/supabase/queries/lessonHub';
import { clearInterviewPicks, fetchInterviewPicks, saveInterviewPicks } from '@/lib/supabase/queries/interviewPicks';
import {
  addRequested, bankIndex, dropPick, emptyPicks, isPicked, promoteToBank, removeFromBank, removeRequested, togglePick, withMandatory,
} from '@/lib/lessonHub/interview';
import { validateBanks } from '@/lib/lessonHub/schema';
import type { Hub, InterviewPicks } from '@/lib/lessonHub/types';
import type { InterviewApi } from './shared';

const SAVE_DELAY = 500;
const now = () => new Date().toISOString();

/** The class's interview pick lists (one per track), saved as they change. */
export function useInterviewPicks(teacherId: string | undefined, hub: Hub | null, setHub: (h: Hub) => void) {
  const [raw, setRaw] = useState<Record<string, InterviewPicks>>({});
  const [saving, setSaving] = useState<InterviewApi['saving']>({});
  const pending = useRef<Record<string, InterviewPicks>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latest = useRef(raw);
  latest.current = raw;

  /** Reload from SpeakFun, keeping any track with a save still on its way. */
  const reload = useCallback(async () => {
    if (!teacherId) return;
    const fresh = await fetchInterviewPicks(supabase, teacherId);
    setRaw(cur => {
      const next = { ...fresh };
      Object.keys(pending.current).forEach(tr => { if (cur[tr]) next[tr] = cur[tr]; });
      return next;
    });
  }, [teacherId]);

  useEffect(() => { reload().catch(() => { /* the hub page shows load errors */ }); }, [reload]);

  const flush = useCallback(async (track: string) => {
    const p = pending.current[track];
    if (!p || !teacherId) return;
    delete pending.current[track];
    setSaving(s => ({ ...s, [track]: 'saving' }));
    try {
      await saveInterviewPicks(supabase, teacherId, p);
      setSaving(s => ({ ...s, [track]: pending.current[track] ? 'saving' : 'saved' }));
    } catch {
      pending.current[track] ??= p;
      setSaving(s => ({ ...s, [track]: 'error' }));
    }
  }, [teacherId]);

  const change = useCallback((track: string, fn: (p: InterviewPicks) => InterviewPicks) => {
    const bank = hub?.interviewBanks?.[track];
    if (!bank) return;
    const cur = withMandatory(latest.current[track] ?? emptyPicks(track), bank);
    const next = fn(cur);
    if (next === cur) return;
    latest.current = { ...latest.current, [track]: next };
    setRaw(latest.current);
    pending.current[track] = next;
    setSaving(s => ({ ...s, [track]: 'saving' }));
    clearTimeout(timers.current[track]);
    timers.current[track] = setTimeout(() => flush(track), SAVE_DELAY);
  }, [hub, flush]);

  // a save still waiting when the page goes away: warn, and send it on unmount
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    const t = timers.current;
    return () => {
      window.removeEventListener('beforeunload', warn);
      Object.keys(pending.current).forEach(tr => { clearTimeout(t[tr]); void flush(tr); });
    };
  }, [flush]);

  const api = useMemo<InterviewApi | undefined>(() => {
    const banks = hub?.interviewBanks;
    if (!banks || !teacherId) return undefined;
    const picks: Record<string, InterviewPicks> = {};
    Object.entries(banks).forEach(([tr, bank]) => { picks[tr] = withMandatory(raw[tr] ?? emptyPicks(tr), bank); });
    return {
      picks, saving,
      toggle: (tr, id) => change(tr, p => togglePick(p, banks[tr], id, now())),
      addRequested: (tr, round, text, fw) => { if (text.trim()) change(tr, p => addRequested(p, round, text, fw, now())); },
      removeRequested: (tr, id) => change(tr, p => removeRequested(p, id, now())),
      promote: async (tr, requestedId, roundId, groupId, fw) => {
        try {
          // start from the hub as saved now, so a bank edit made from Claude in the meantime is kept
          const fresh = await fetchHub(supabase, teacherId);
          const bank = fresh?.interviewBanks?.[tr];
          if (!fresh || !bank) return 'The question bank is gone — reload the page.';
          const cur = withMandatory(latest.current[tr] ?? emptyPicks(tr), bank);
          const res = promoteToBank(bank, cur, requestedId, roundId, groupId, fw, now());
          if ('error' in res) return res.error;
          const nextBanks = { ...fresh.interviewBanks, [tr]: res.bank };
          const errs = validateBanks(nextBanks, fresh.tracks);
          if (errs.length) return errs[0];
          const text = cur.requested.find(r => r.id === requestedId)?.text ?? '';
          setHub(await saveHubKey(supabase, teacherId, 'interviewBanks', nextBanks, 'web',
            `Added "${text.slice(0, 60)}" to the ${tr} bank as ${res.questionId}`));
          latest.current = { ...latest.current, [tr]: res.picks };
          setRaw(latest.current);
          pending.current[tr] = res.picks;
          clearTimeout(timers.current[tr]);
          await flush(tr);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },
      removeFromBank: async (tr, questionId) => {
        try {
          const fresh = await fetchHub(supabase, teacherId);
          const bank = fresh?.interviewBanks?.[tr];
          if (!fresh || !bank) return 'The question bank is gone — reload the page.';
          const text = bankIndex(bank).get(questionId)?.q.text ?? questionId;
          const next = removeFromBank(bank, questionId);
          if ('error' in next) return next.error;
          const nextBanks = { ...fresh.interviewBanks, [tr]: next };
          const errs = validateBanks(nextBanks, fresh.tracks);
          if (errs.length) return errs[0];
          setHub(await saveHubKey(supabase, teacherId, 'interviewBanks', nextBanks, 'web',
            `Removed ${questionId} ("${text.slice(0, 60)}") from the ${tr} bank`));
          if (isPicked(latest.current[tr], questionId)) change(tr, p => dropPick(p, questionId, now()));
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },
      clear: async tr => {
        clearTimeout(timers.current[tr]);
        delete pending.current[tr];
        await clearInterviewPicks(supabase, teacherId, tr);
        latest.current = { ...latest.current, [tr]: emptyPicks(tr) };
        setRaw(latest.current);
        setSaving(s => ({ ...s, [tr]: undefined }));
      },
    };
  }, [hub, teacherId, raw, saving, change, flush, setHub]);

  return { interview: api, reloadPicks: reload };
}
