"use client";

import { useState, useEffect } from 'react';
import { LayoutGrid, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';

interface ProgressPair {
  window: HomeworkWindow;
  submission: HomeworkSubmission | null;
}

type SessionStatus = 'done' | 'partial' | 'missed' | 'active';

function getStatus(pair: ProgressPair): SessionStatus {
  const now = new Date();
  const { window: hw, submission } = pair;
  const isOpen = now < new Date(hw.closesAt);

  if (submission?.allCompleted) return 'done';
  if (!isOpen) {
    return submission?.startedAt ? 'partial' : 'missed';
  }
  return submission?.startedAt ? 'partial' : 'active';
}

const STATUS_STYLES: Record<SessionStatus, string> = {
  done:    'bg-white border-emerald-300 text-emerald-600 dark:bg-card dark:border-emerald-700 dark:text-emerald-300',
  partial: 'bg-white border-amber-300 text-amber-600 dark:bg-card dark:border-amber-600 dark:text-amber-300',
  missed:  'bg-white border-red-200 text-red-400 dark:bg-card dark:border-red-800 dark:text-red-400',
  active:  'bg-white border-indigo-400 text-indigo-600 dark:bg-card dark:border-indigo-500 dark:text-indigo-300 ring-2 ring-indigo-300 dark:ring-indigo-700',
};

function StatusIcon({ status }: { status: SessionStatus }) {
  const size = 10;
  switch (status) {
    case 'done':    return <CheckCircle style={{ width: size, height: size }} />;
    case 'partial': return <Zap style={{ width: size, height: size }} />;
    case 'missed':  return <XCircle style={{ width: size, height: size }} />;
    case 'active':  return <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block shrink-0" />;
  }
}

function SessionCell({ pair, status }: { pair: ProgressPair; status: SessionStatus }) {
  const [hover, setHover] = useState(false);
  const hw = pair.window;
  const label = `S${hw.sessionNumber}`;

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        className={[
          'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 select-none transition-all',
          STATUS_STYLES[status],
        ].join(' ')}
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <span className="text-[10px] font-bold leading-none">{label}</span>
        <StatusIcon status={status} />
      </div>

      {hover && (
        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-36 bg-popover border border-border rounded-lg shadow-lg px-2.5 py-2 pointer-events-none">
          <p className="text-[11px] font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground/70">
            {new Date(hw.windowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-[10px] capitalize mt-0.5" style={{
            color: status === 'done' ? '#10b981' : status === 'partial' ? '#f59e0b' : status === 'missed' ? '#f87171' : '#6366f1'
          }}>
            {status === 'active' ? 'In progress' : status}
          </p>
          {pair.submission?.totalScore != null && pair.submission.totalScore > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{pair.submission.totalScore.toFixed(1)} pts</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function HomeworkSessionMap({ classId }: { classId: string }) {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<ProgressPair[]>([]);
  const [readyLessonCount, setReadyLessonCount] = useState(0);

  useEffect(() => {
    fetch(`/api/homework/progress?classId=${classId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) {
          setPairs(json.pairs ?? []);
          setReadyLessonCount(json.readyLessonCount ?? 0);
        }
      })
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Map</span>
        </div>
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <LayoutGrid className="w-4 h-4 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Map</span>
        </div>
        <p className="text-sm text-muted-foreground/60">
          {readyLessonCount > 0 ? 'No sessions yet — check back after 6am.' : 'No lesson exercises ready yet.'}
        </p>
      </div>
    );
  }

  const cells = pairs.map(p => ({ pair: p, status: getStatus(p) }));
  const doneCount = cells.filter(c => c.status === 'done').length;
  const missedCount = cells.filter(c => c.status === 'missed').length;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Map</span>
        </div>
        <span className="text-xs text-muted-foreground/60">{pairs.length} sessions</span>
      </div>

      <div className="flex gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />{doneCount} done
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <XCircle className="w-3.5 h-3.5" />{missedCount} missed
        </span>
        <span className="flex items-center gap-1 text-muted-foreground/50">
          <Clock className="w-3.5 h-3.5" />{readyLessonCount} lessons ready
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cells.map(c => <SessionCell key={c.pair.window.id} {...c} />)}
      </div>

      <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />Done</span>
        <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" />Partial</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" />Missed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Active</span>
      </div>
    </div>
  );
}
