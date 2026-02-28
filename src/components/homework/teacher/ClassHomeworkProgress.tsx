"use client";

import React, { useState, useEffect } from 'react';
import { TrendingUp, Loader2, Users } from 'lucide-react';
import { HomeworkWindow, HomeworkSubmission } from '@/lib/types';

interface Enrollment {
  learnerId: string;
  learnerName: string;
}

interface ClassProgressData {
  windows: HomeworkWindow[];
  enrollments: Enrollment[];
  submissions: HomeworkSubmission[];
}

interface LearnerPoint {
  sessionNumber: number;
  label: string;
  isReview: boolean;
  score: number;
  status: 'completed' | 'partial' | 'missed';
}

interface LearnerSeries {
  learnerId: string;
  learnerName: string;
  points: LearnerPoint[];
  completed: number;
  missed: number;
  totalPoints: number;
}

const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

function niceMax(val: number): number {
  if (val <= 0) return 10;
  const step = val <= 20 ? 5 : val <= 50 ? 10 : val <= 200 ? 20 : 50;
  return Math.ceil(val / step) * step;
}

function buildSeries(data: ClassProgressData): { series: LearnerSeries[]; pastWindows: HomeworkWindow[] } {
  const now = new Date();
  const pastWindows = data.windows.filter(w => new Date(w.closesAt) < now);

  const subMap = new Map<string, Map<string, HomeworkSubmission>>();
  for (const sub of data.submissions) {
    if (!subMap.has(sub.learnerId)) subMap.set(sub.learnerId, new Map());
    subMap.get(sub.learnerId)!.set(sub.windowId, sub);
  }

  const series: LearnerSeries[] = data.enrollments.map(e => {
    const learnerSubs = subMap.get(e.learnerId) ?? new Map<string, HomeworkSubmission>();
    const points: LearnerPoint[] = pastWindows.map(w => {
      const sub = learnerSubs.get(w.id);
      const label = w.isReviewSession ? `R${w.sessionNumber}` : `S${w.sessionNumber}`;
      let status: LearnerPoint['status'] = 'missed';
      let score = 0;

      if (sub?.allCompleted) {
        status = 'completed';
        score = sub.totalScore;
      } else if (sub?.startedAt) {
        status = 'partial';
        score = sub.totalScore;
      }

      return { sessionNumber: w.sessionNumber, label, isReview: w.isReviewSession, score, status };
    });

    const completed = points.filter(p => p.status === 'completed').length;
    const missed = points.filter(p => p.status === 'missed').length;
    const totalPoints = points.reduce((sum, p) => sum + p.score, 0);

    return { learnerId: e.learnerId, learnerName: e.learnerName, points, completed, missed, totalPoints };
  });

  return { series, pastWindows };
}

interface MultiTooltipData {
  cx: number; cy: number;
  learnerName: string; label: string; date: string; score: number; status: string;
}

function MultiTooltip({ tip, W }: { tip: MultiTooltipData; W: number }) {
  const TW = 140; const TH = 52; const PAD = 6;
  const tx = tip.cx + TW + 12 > W ? tip.cx - TW - 8 : tip.cx + 8;
  const ty = tip.cy - TH - 6 < 0 ? tip.cy + 8 : tip.cy - TH - 6;
  const statusColor = tip.status === 'completed' ? '#10b981' : tip.status === 'partial' ? '#f59e0b' : '#94a3b8';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={TW} height={TH} rx="5" fill="white"
        stroke="#e2e8f0" strokeWidth="1"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.10))" />
      <text x={tx + PAD} y={ty + 13} fontSize="9" fontWeight="700" fill="#334155">
        {tip.learnerName}
      </text>
      <text x={tx + PAD} y={ty + 26} fontSize="9" fill="#64748b">
        {tip.label} · {tip.date}
      </text>
      <text x={tx + PAD} y={ty + 40} fontSize="10" fontWeight="700" fill={statusColor}>
        {tip.score.toFixed(1)} pts
      </text>
      <text x={tx + PAD} y={ty + 50} fontSize="8" fill="#94a3b8">
        {tip.status}
      </text>
    </g>
  );
}

function MultiLineChart({
  series,
  pastWindows,
}: {
  series: LearnerSeries[];
  pastWindows: HomeworkWindow[];
}) {
  const [hoveredLearner, setHoveredLearner] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<MultiTooltipData | null>(null);

  if (pastWindows.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-slate-400">
        Not enough sessions to chart yet.
      </div>
    );
  }

  const W = 580; const H = 195;
  const PAD_L = 32; const PAD_R = 12; const PAD_T = 10; const PAD_B = 35;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = pastWindows.length;

  const allScores = series.flatMap(s => s.points.map(p => p.score));
  const maxScore = niceMax(Math.max(...allScores, 1));

  const xFor = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (score: number) => PAD_T + ((maxScore - score) / maxScore) * innerH;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {/* Grid */}
      {gridSteps.map(frac => {
        const val = Math.round(maxScore * frac);
        const y = yFor(val);
        return (
          <g key={frac}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{val}</text>
          </g>
        );
      })}

      {/* Per-learner lines */}
      {series.map((s, si) => {
        const color = PALETTE[si % PALETTE.length];
        const isHovered = hoveredLearner === s.learnerId;
        const isDimmed = hoveredLearner !== null && !isHovered;
        const pts = s.points.map((p, i) => `${xFor(i)},${yFor(p.score)}`).join(' ');

        return (
          <g
            key={s.learnerId}
            style={{ opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.15s', cursor: 'pointer' }}
            onMouseEnter={() => setHoveredLearner(s.learnerId)}
            onMouseLeave={() => { setHoveredLearner(null); setTooltip(null); }}
          >
            <polyline
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={isHovered ? 2.5 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p, i) => {
              const cx = xFor(i);
              const cy = yFor(p.score);
              const dateLabel = new Date(pastWindows[i].windowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const sessionLabel = pastWindows[i].isReviewSession ? `R${pastWindows[i].sessionNumber}` : `S${pastWindows[i].sessionNumber}`;
              return (
                <g key={i}>
                  <circle
                    cx={cx} cy={cy}
                    r={p.isReview ? 4.5 : isHovered ? 3.5 : 2.5}
                    fill={p.status === 'missed' ? '#e2e8f0' : color}
                    stroke="white" strokeWidth="1.2"
                    onMouseEnter={() => setTooltip({ cx, cy, learnerName: s.learnerName, label: sessionLabel, date: dateLabel, score: p.score, status: p.status })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {/* Larger invisible hit area */}
                  <circle cx={cx} cy={cy} r={10} fill="transparent"
                    onMouseEnter={() => setTooltip({ cx, cy, learnerName: s.learnerName, label: sessionLabel, date: dateLabel, score: p.score, status: p.status })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* X-axis labels — session label + date, show selectively to avoid clutter */}
      {pastWindows
        .map((w, i) => ({ w, i }))
        .filter(({ i }) => i === 0 || i === n - 1 || n <= 8 || i % Math.ceil(n / 6) === 0)
        .map(({ w, i }) => {
          const sessionLabel = w.isReviewSession ? `R${w.sessionNumber}` : `S${w.sessionNumber}`;
          const dateLabel = new Date(w.windowDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <g key={w.sessionNumber}>
              <text x={xFor(i)} y={H - 22} textAnchor="middle" fontSize="9" fontWeight="600" fill="#64748b">
                {sessionLabel}
              </text>
              <text x={xFor(i)} y={H - 11} textAnchor="middle" fontSize="8" fill="#94a3b8">
                {dateLabel}
              </text>
            </g>
          );
        })}

      {/* Tooltip */}
      {tooltip && <MultiTooltip tip={tooltip} W={W} />}
    </svg>
  );
}

export default function ClassHomeworkProgress({ classId }: { classId: string }) {
  const [data, setData] = useState<ClassProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/homework/progress?classId=${classId}&all=true`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) setData(json); })
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 bg-white rounded-xl border border-slate-200">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    );
  }

  if (!data || data.windows.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
        <TrendingUp className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No homework sessions yet.</p>
      </div>
    );
  }

  const { series, pastWindows } = buildSeries(data);

  if (pastWindows.length === 0) {
    return (
      <div className="text-center py-8 bg-white rounded-xl border border-slate-200">
        <p className="text-sm text-slate-400">No closed sessions yet — check back after the first session expires.</p>
      </div>
    );
  }

  const sortedSeries = [...series].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Score Trends</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          <Users className="w-3.5 h-3.5" />
          {series.length} learner{series.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Chart */}
      <MultiLineChart series={series} pastWindows={pastWindows} />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-5">
        {series.map((s, si) => (
          <div key={s.learnerId} className="flex items-center gap-1.5">
            <span
              className="inline-block w-5 h-0.5 rounded-full"
              style={{ backgroundColor: PALETTE[si % PALETTE.length] }}
            />
            <span className="text-xs text-slate-600">{s.learnerName}</span>
          </div>
        ))}
      </div>

      {/* Summary table */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Per-Learner Summary</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left py-1.5 font-medium pr-4">Learner</th>
                <th className="text-right py-1.5 font-medium pr-3">Completed</th>
                <th className="text-right py-1.5 font-medium pr-3">Missed</th>
                <th className="text-right py-1.5 font-medium">Total pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedSeries.map((s, si) => {
                const originalIndex = series.findIndex(x => x.learnerId === s.learnerId);
                return (
                  <tr key={s.learnerId} className="hover:bg-slate-50 transition">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PALETTE[originalIndex % PALETTE.length] }}
                        />
                        <span className="text-slate-700 truncate max-w-[140px]">{s.learnerName}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 pr-3 text-emerald-600 font-medium tabular-nums">{s.completed}</td>
                    <td className="text-right py-2 pr-3 text-red-400 tabular-nums">{s.missed}</td>
                    <td className="text-right py-2 font-semibold text-indigo-600 tabular-nums">
                      {s.totalPoints.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
