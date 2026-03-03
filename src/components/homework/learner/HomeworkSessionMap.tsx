"use client";

import { useState, useEffect } from 'react';
import { LayoutGrid, CheckCircle, XCircle, Clock, Lock, Zap, RotateCcw } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannedSession {
  sessionNumber: number;
  isReview: boolean;
  lessonIndex: number | null; // 0-based index into lesson list; null for review
  cycleSession: number | null; // 1, 2, or 3; null for review
}

type SessionStatus = 'done' | 'partial' | 'missed' | 'active' | 'upcoming' | 'locked';

interface ProgressPair {
  window: HomeworkWindow;
  submission: HomeworkSubmission | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the full ordered list of planned sessions for N lessons. */
function computePlannedSessions(N: number): PlannedSession[] {
  const sessions: PlannedSession[] = [];
  let regularCount = 0;
  let sessionNumber = 1;
  while (regularCount < N * 3) {
    if (sessionNumber % 7 === 0) {
      sessions.push({ sessionNumber, isReview: true, lessonIndex: null, cycleSession: null });
    } else {
      const lessonIndex = Math.floor(regularCount / 3);
      const cycleSession = (regularCount % 3) + 1;
      sessions.push({ sessionNumber, isReview: false, lessonIndex, cycleSession });
      regularCount++;
    }
    sessionNumber++;
  }
  return sessions;
}

function getStatus(
  planned: PlannedSession,
  windowBySession: Map<number, HomeworkWindow>,
  subByWindow: Map<string, HomeworkSubmission | null>,
  readyLessonCount: number,
): SessionStatus {
  const now = new Date();
  const hw = windowBySession.get(planned.sessionNumber);

  if (hw) {
    if (new Date(hw.closesAt) < now) {
      const sub = subByWindow.get(hw.id);
      if (sub?.allCompleted) return 'done';
      if (sub?.startedAt) return 'partial';
      return 'missed';
    }
    return 'active';
  }

  // No window yet — for cycle sessions 2 & 3, the previous session must be closed first
  if (!planned.isReview && planned.cycleSession && planned.cycleSession > 1) {
    const prevWindow = windowBySession.get(planned.sessionNumber - 1);
    if (!prevWindow || new Date(prevWindow.closesAt) >= now) return 'locked';
  }

  if (planned.isReview) {
    return readyLessonCount > 0 ? 'upcoming' : 'locked';
  }
  if (planned.lessonIndex !== null && planned.lessonIndex < readyLessonCount) return 'upcoming';
  return 'locked';
}

// ---------------------------------------------------------------------------
// Session cell
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<SessionStatus, string> = {
  done:     'bg-white border-emerald-300 text-emerald-600 dark:bg-card dark:border-emerald-700 dark:text-emerald-300',
  partial:  'bg-white border-amber-300 text-amber-600 dark:bg-card dark:border-amber-600 dark:text-amber-300',
  missed:   'bg-white border-red-200 text-red-400 dark:bg-card dark:border-red-800 dark:text-red-400',
  active:   'bg-white border-indigo-400 text-indigo-600 dark:bg-card dark:border-indigo-500 dark:text-indigo-300 ring-2 ring-indigo-300 dark:ring-indigo-700',
  upcoming: 'bg-white border-slate-200 text-slate-400 dark:bg-card dark:border-slate-700 dark:text-slate-500',
  locked:   'bg-slate-100 border-slate-200 text-slate-300 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-600',
};

const REVIEW_EXTRA: Record<SessionStatus, string> = {
  done:     'ring-1 ring-emerald-400/50',
  partial:  'ring-1 ring-amber-400/50',
  missed:   'ring-1 ring-red-300/50',
  active:   '',
  upcoming: 'ring-1 ring-slate-200/70 dark:ring-slate-700/50',
  locked:   '',
};

function StatusIcon({ status, size = 10 }: { status: SessionStatus; size?: number }) {
  const cls = `w-${size === 10 ? '[10px]' : '[8px]'} h-${size === 10 ? '[10px]' : '[8px]'}`;
  switch (status) {
    case 'done':     return <CheckCircle className={`${cls} shrink-0`} style={{ width: size, height: size }} />;
    case 'partial':  return <Zap className={`${cls} shrink-0`} style={{ width: size, height: size }} />;
    case 'missed':   return <XCircle className={`${cls} shrink-0`} style={{ width: size, height: size }} />;
    case 'active':   return <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block shrink-0" />;
    case 'upcoming': return <Clock style={{ width: size, height: size }} className="shrink-0" />;
    case 'locked':   return <Lock style={{ width: size, height: size }} className="shrink-0" />;
  }
}

interface CellProps {
  planned: PlannedSession;
  status: SessionStatus;
  lessonName: string | null;
  windowDate: string | null;
}

function SessionCell({ planned, status, lessonName, windowDate }: CellProps) {
  const [hover, setHover] = useState(false);
  const label = planned.isReview ? `R${planned.sessionNumber}` : `S${planned.sessionNumber}`;
  const isLocked = status === 'locked';

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        className={[
          'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 select-none transition-all',
          planned.isReview ? 'rounded-xl' : '',
          STATUS_STYLES[status],
          planned.isReview ? REVIEW_EXTRA[status] : '',
          isLocked ? 'opacity-40' : '',
        ].join(' ')}
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <span className="text-[10px] font-bold leading-none">{label}</span>
        <StatusIcon status={status} size={10} />
        {planned.cycleSession && !planned.isReview && (
          <span className="text-[8px] leading-none opacity-60">{planned.cycleSession}/3</span>
        )}
        {planned.isReview && (
          <RotateCcw style={{ width: 7, height: 7 }} className="opacity-40" />
        )}
      </div>

      {/* Tooltip */}
      {hover && (
        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-36 bg-popover border border-border rounded-lg shadow-lg px-2.5 py-2 pointer-events-none">
          <p className="text-[11px] font-semibold text-foreground">{label}</p>
          {lessonName && <p className="text-[10px] text-muted-foreground truncate">{lessonName}</p>}
          {windowDate && (
            <p className="text-[10px] text-muted-foreground/70">
              {new Date(windowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
          <p className="text-[10px] capitalize mt-0.5" style={{
            color: status === 'done' ? '#10b981' : status === 'partial' ? '#f59e0b' : status === 'missed' ? '#f87171' : status === 'active' ? '#6366f1' : '#94a3b8'
          }}>
            {status === 'upcoming' ? 'Not yet generated' : status === 'locked' ? 'Lesson not ready' : status}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HomeworkSessionMap({ classId }: { classId: string }) {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<ProgressPair[]>([]);
  const [lessons, setLessons] = useState<Record<string, string>>({});
  const [homeworkLessonCount, setHomeworkLessonCount] = useState<number | null>(null);
  const [readyLessonCount, setReadyLessonCount] = useState(0);

  useEffect(() => {
    fetch(`/api/homework/progress?classId=${classId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) {
          setPairs(json.pairs ?? []);
          setLessons(json.lessons ?? {});
          setHomeworkLessonCount(json.homeworkLessonCount ?? null);
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

  if (!homeworkLessonCount) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <LayoutGrid className="w-4 h-4 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Map</span>
        </div>
        <p className="text-sm text-muted-foreground/60">Homework lesson count not configured yet.</p>
      </div>
    );
  }

  const planned = computePlannedSessions(homeworkLessonCount);
  const total = planned.length;
  const reviewCount = planned.filter(p => p.isReview).length;

  const windowBySession = new Map(pairs.map(p => [p.window.sessionNumber, p.window]));
  const subByWindow = new Map(pairs.map(p => [p.window.id, p.submission]));

  // Build cell data
  const cells = planned.map(p => {
    const hw = windowBySession.get(p.sessionNumber);
    const status = getStatus(p, windowBySession, subByWindow, readyLessonCount);
    const lessonName = p.isReview ? 'Review' : (hw?.cycleLessonId ? (lessons[hw.cycleLessonId] ?? null) : null);
    const windowDate = hw?.windowDate ?? null;
    return { planned: p, status, lessonName, windowDate };
  });

  const doneCount = cells.filter(c => c.status === 'done').length;
  const missedCount = cells.filter(c => c.status === 'missed').length;

  // 3 columns when total > 10
  const useColumns = total > 10;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Map</span>
        </div>
        <span className="text-xs text-muted-foreground/60">
          {homeworkLessonCount} lessons · {total - reviewCount} regular + {reviewCount} reviews
        </span>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />{doneCount} done
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <XCircle className="w-3.5 h-3.5" />{missedCount} missed
        </span>
        <span className="text-muted-foreground/50">
          {readyLessonCount}/{homeworkLessonCount} lessons ready
        </span>
      </div>

      {/* Session grid */}
      <div
        className={useColumns ? 'grid gap-1.5' : 'flex flex-wrap gap-1.5'}
        style={useColumns ? { gridTemplateColumns: 'repeat(3, 1fr)' } : undefined}
      >
        {useColumns ? (
          // 3-column layout: split into 3 vertical strips
          (() => {
            const colSize = Math.ceil(total / 3);
            return [0, 1, 2].map(col => (
              <div key={col} className="flex flex-col gap-1.5">
                {cells.slice(col * colSize, (col + 1) * colSize).map(c => (
                  <SessionCell key={c.planned.sessionNumber} {...c} />
                ))}
              </div>
            ));
          })()
        ) : (
          cells.map(c => <SessionCell key={c.planned.sessionNumber} {...c} />)
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />Done</span>
        <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" />Partial</span>
        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" />Missed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Active</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Upcoming</span>
        <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Lesson not ready</span>
        <span className="flex items-center gap-1 text-muted-foreground/40"><RotateCcw className="w-3 h-3" />= Review</span>
      </div>
    </div>
  );
}
