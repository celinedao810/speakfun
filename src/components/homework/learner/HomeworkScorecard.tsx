"use client";

import React from 'react';
import { Trophy, Star, BookOpen, MessageCircle, CheckCircle, ArrowRight, Home } from 'lucide-react';
import Link from 'next/link';
import { VocabAttemptAudit } from '@/lib/types';

interface ScorecardProps {
  windowId: string;
  classId: string;
  maxPossiblePoints: number;
  ex1Score: number;
  ex2Score: number;
  ex3aScore: number;
  ex3bScore: number;
  totalScore: number;
  vocabAttempts: VocabAttemptAudit[];
  wrongVocabIds: string[];
  wordsCommittedCount: number;
  isReview: boolean;
  onDone: () => void;
}

function Badge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 ${color}`}>
      <div className="text-2xl">{icon}</div>
      <span className="text-xs font-semibold text-center leading-tight">{label}</span>
    </div>
  );
}

function ScoreRow({ icon, label, score, color }: { icon: React.ReactNode; label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`p-1.5 rounded-lg ${color}`}>{icon}</div>
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="text-sm font-bold text-foreground">+{score.toFixed(1)}</span>
    </div>
  );
}

export default function HomeworkScorecard({
  classId,
  maxPossiblePoints,
  ex1Score,
  ex2Score,
  ex3aScore,
  ex3bScore,
  totalScore,
  vocabAttempts,
  wordsCommittedCount,
  isReview,
  onDone,
}: ScorecardProps) {
  const pct = maxPossiblePoints > 0 ? Math.round((totalScore / maxPossiblePoints) * 100) : 0;

  // Badges
  const allCompleted = ex1Score >= 0 && ex2Score >= 0 && ex3aScore >= 0 && ex3bScore >= 0;
  const isHomeworkStar = allCompleted && ex2Score > 0 && ex3aScore + ex3bScore > 0;
  const isTopLearner = pct >= 95 && allCompleted;

  const totalAttempts = vocabAttempts.length;
  const correctAttempts = vocabAttempts.filter(a => a.isCorrectWord).length;

  const hasBadges = isHomeworkStar || isTopLearner;

  return (
    <div className="space-y-6">
      {/* Trophy header */}
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-3">
          <Trophy className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {isReview ? 'Review Complete!' : 'Homework Done!'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Great work on today's exercises</p>
      </div>

      {/* Total score */}
      <div className="bg-gradient-to-br from-primary to-chart-4 rounded-2xl p-6 text-primary-foreground text-center">
        <div className="text-5xl font-black mb-1">{totalScore.toFixed(1)}</div>
        <div className="text-primary-foreground/60 text-sm">
          out of {maxPossiblePoints.toFixed(1)} possible · {pct}%
        </div>
        <div className="mt-4 w-full bg-white/20 rounded-full h-2">
          <div
            className="h-2 bg-white rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Score breakdown */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">Score Breakdown</h3>
        <ScoreRow
          icon={<BookOpen className="w-4 h-4 text-primary" />}
          label="Vocabulary"
          score={ex1Score}
          color="bg-primary/10"
        />
        <ScoreRow
          icon={<MessageCircle className="w-4 h-4 text-primary" />}
          label="Sentence Structure"
          score={ex2Score}
          color="bg-primary/10"
        />
        {(ex3aScore + ex3bScore > 0) && (
          <ScoreRow
            icon={<MessageCircle className="w-4 h-4 text-violet-600" />}
            label="Conversation"
            score={ex3aScore + ex3bScore}
            color="bg-violet-50"
          />
        )}
      </div>

      {/* Vocab stats */}
      {totalAttempts > 0 && (
        <div className="bg-muted rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Vocabulary Progress</h3>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{correctAttempts}/{totalAttempts}</div>
              <div className="text-xs text-muted-foreground/60 mt-0.5">Correct guesses</div>
            </div>
            {wordsCommittedCount > 0 && (
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-lg font-bold text-green-600">{wordsCommittedCount}</span>
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  {wordsCommittedCount === 1 ? 'word' : 'words'} committed to memory!
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badges */}
      {hasBadges && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Badges Earned</h3>
          <div className="grid grid-cols-2 gap-3">
            {isHomeworkStar && (
              <Badge
                icon={<Star className="w-7 h-7 text-amber-500 fill-amber-400" />}
                label="Homework Star"
                color="border-amber-300 bg-amber-50 text-amber-800"
              />
            )}
            {isTopLearner && (
              <Badge
                icon={<Trophy className="w-7 h-7 text-primary fill-primary/40" />}
                label="Top Learner"
                color="border-primary/30 bg-primary/10 text-primary"
              />
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pb-4">
        <button
          onClick={onDone}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition flex items-center justify-center gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          Back to Class
        </button>
        <Link
          href={`/learner/classes/${classId}`}
          className="w-full py-2.5 text-center text-sm text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-1.5"
        >
          <Home className="w-4 h-4" />
          Go to class page
        </Link>
      </div>
    </div>
  );
}
