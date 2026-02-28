"use client";

import React, { useState, useEffect } from 'react';
import { TrendingUp, CheckCircle, XCircle, Star, Loader2 } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';

interface ProgressPair {
  window: HomeworkWindow;
  submission: HomeworkSubmission | null;
}

interface ChartPoint {
  sessionNumber: number;
  label: string; // "S1", "R7", etc.
  dateLabel: string; // "Feb 24"
  isReview: boolean;
  score: number; // actual points (0 for missed)
  status: 'completed' | 'partial' | 'missed';
  lessonName: string | null;
}

function fmtDate(windowDate: string): string {
  return new Date(windowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildChartPoints(pairs: ProgressPair[], lessons: Record<string, string>): ChartPoint[] {
  const now = new Date();
  return pairs
    .filter(({ window: hw }) => new Date(hw.closesAt) < now)
    .map(({ window: hw, submission }) => {
      const label = hw.isReviewSession ? `R${hw.sessionNumber}` : `S${hw.sessionNumber}`;
      let status: ChartPoint['status'];
      let score = 0;

      if (submission?.allCompleted) {
        status = 'completed';
        score = submission.totalScore;
      } else if (submission?.startedAt) {
        status = 'partial';
        score = submission.totalScore;
      } else {
        status = 'missed';
        score = 0;
      }

      const lessonName = hw.isReviewSession
        ? 'Review'
        : (hw.cycleLessonId ? (lessons[hw.cycleLessonId] ?? null) : null);

      return { sessionNumber: hw.sessionNumber, label, dateLabel: fmtDate(hw.windowDate), isReview: hw.isReviewSession, score, status, lessonName };
    });
}

function niceMax(val: number): number {
  if (val <= 0) return 10;
  const step = val <= 20 ? 5 : val <= 50 ? 10 : val <= 200 ? 20 : 50;
  return Math.ceil(val / step) * step;
}

interface TooltipData {
  cx: number; cy: number;
  label: string; date: string; score: number; status: string; lessonName: string | null;
}

function Tooltip({ tip, W }: { tip: TooltipData; W: number }) {
  const hasLesson = !!tip.lessonName;
  const TW = 160; const TH = hasLesson ? 58 : 44; const PAD = 6;
  const tx = tip.cx + TW + 12 > W ? tip.cx - TW - 8 : tip.cx + 8;
  const ty = tip.cy - TH - 6 < 0 ? tip.cy + 8 : tip.cy - TH - 6;
  const statusColor = tip.status === 'completed' ? '#10b981' : tip.status === 'partial' ? '#f59e0b' : '#94a3b8';
  // Truncate lesson name to fit tooltip
  const lessonLabel = tip.lessonName && tip.lessonName.length > 22
    ? tip.lessonName.slice(0, 21) + '…'
    : tip.lessonName;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={TW} height={TH} rx="5" fill="white"
        stroke="#e2e8f0" strokeWidth="1"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.10))" />
      <text x={tx + PAD} y={ty + 14} fontSize="9" fontWeight="600" fill="#334155">
        {tip.label} · {tip.date}
      </text>
      {hasLesson && (
        <text x={tx + PAD} y={ty + 26} fontSize="8" fill="#6366f1">
          {lessonLabel}
        </text>
      )}
      <text x={tx + PAD} y={ty + (hasLesson ? 40 : 28)} fontSize="10" fontWeight="700" fill={statusColor}>
        {tip.score.toFixed(1)} pts
      </text>
      <text x={tx + PAD} y={ty + (hasLesson ? 52 : 40)} fontSize="8" fill="#94a3b8" style={{ textTransform: 'capitalize' }}>
        {tip.status}
      </text>
    </g>
  );
}

function LineChart({ points }: { points: ChartPoint[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-slate-400">
        Not enough data yet.
      </div>
    );
  }

  const COL_W = 44; // px per session column
  const H = 155;
  const PAD_L = 32; const PAD_R = 16; const PAD_T = 10; const PAD_B = 35;
  const n = points.length;
  // Expand width as sessions grow; minimum 560px
  const W = Math.max(560, PAD_L + PAD_R + n * COL_W);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const maxScore = niceMax(Math.max(...points.map(p => p.score)));

  const xFor = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (score: number) => PAD_T + ((maxScore - score) / maxScore) * innerH;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const polyline = points.map((p, i) => `${xFor(i)},${yFor(p.score)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {gridSteps.map(frac => {
        const val = Math.round(maxScore * frac);
        const y = yFor(val);
        return (
          <g key={frac}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
              stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              {val}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {points.map((p, i) => {
        const cx = xFor(i);
        const cy = yFor(p.score);
        const r = p.isReview ? 5 : 3.5;
        const fill =
          p.status === 'completed' ? '#10b981' :
          p.status === 'partial'   ? '#f59e0b' :
          '#cbd5e1';
        return (
          <g key={p.sessionNumber}>
            <circle
              cx={cx} cy={cy} r={r} fill={fill} stroke="white" strokeWidth="1.5"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({ cx, cy, label: p.label, date: p.dateLabel, score: p.score, status: p.status, lessonName: p.lessonName })}
              onMouseLeave={() => setTooltip(null)}
            />
            {/* Larger invisible hit area */}
            <circle cx={cx} cy={cy} r={10} fill="transparent"
              onMouseEnter={() => setTooltip({ cx, cy, label: p.label, date: p.dateLabel, score: p.score, status: p.status, lessonName: p.lessonName })}
              onMouseLeave={() => setTooltip(null)}
            />
            {/* X-axis: session label + date */}
            <text x={cx} y={H - 22} textAnchor="middle" fontSize="9" fontWeight="600" fill="#64748b">
              {p.label}
            </text>
            <text x={cx} y={H - 11} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {p.dateLabel}
            </text>
          </g>
        );
      })}

      {/* Tooltip */}
      {tooltip && <Tooltip tip={tooltip} W={W} />}
    </svg>
  );
}

export default function HomeworkProgress({ classId }: { classId: string }) {
  const [pairs, setPairs] = useState<ProgressPair[]>([]);
  const [lessons, setLessons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/homework/progress?classId=${classId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) {
          setPairs(json.pairs ?? []);
          setLessons(json.lessons ?? {});
        }
      })
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Homework Progress</span>
        </div>
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
        </div>
      </div>
    );
  }

  const points = buildChartPoints(pairs, lessons);

  if (points.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Homework Progress</span>
        </div>
        <p className="text-sm text-muted-foreground/60">No completed sessions yet.</p>
      </div>
    );
  }

  const completed = points.filter(p => p.status === 'completed').length;
  const missed = points.filter(p => p.status === 'missed').length;
  const totalPoints = points.reduce((sum, p) => sum + p.score, 0);

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Homework Progress</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
          <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-emerald-700">{completed}</p>
          <p className="text-xs text-emerald-600">Completed</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center">
          <XCircle className="w-4 h-4 text-red-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-red-500">{missed}</p>
          <p className="text-xs text-red-400">Missed</p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 text-center">
          <Star className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-indigo-700">{totalPoints.toFixed(1)}</p>
          <p className="text-xs text-indigo-500">Total pts</p>
        </div>
      </div>

      {/* Chart — horizontally scrollable when many sessions */}
      <div className="mt-1 overflow-x-auto -mx-5 px-5">
        <LineChart points={points} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground/70 justify-center">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Partial</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />Missed</span>
        <span className="flex items-center gap-1.5 text-muted-foreground/50">R = Review session</span>
      </div>
    </div>
  );
}
