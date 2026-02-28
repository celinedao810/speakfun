"use client";

import React, { useState, useEffect } from 'react';
import { BookMarked, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { GlobalNotebookResponse, CourseNotebook } from '@/app/api/homework/vocab-notebook/global/route';
import { NotebookEntry } from '@/app/api/homework/vocab-notebook/route';

export default function NotebookPage() {
  const [data, setData] = useState<GlobalNotebookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/homework/vocab-notebook/global')
      .then(r => r.ok ? r.json() : r.json().then((j: { error?: string }) => Promise.reject(j.error ?? 'Failed')))
      .then(setData)
      .catch((e: unknown) => setError(typeof e === 'string' ? e : 'Failed to load notebook'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-sm text-destructive">{error}</div>
    );
  }

  if (!data || data.globalTotal === 0) {
    return (
      <div className="text-center py-16">
        <BookMarked className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground/60">
          No vocab yet. Join a class and complete some homework sessions to start building your notebook.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Global stats bar */}
      <div className="bg-card rounded-xl border border-border px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <BookMarked className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">My Vocab Notebook</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip value={data.globalTotal} label="total words" variant="default" />
          {data.globalMastered > 0 && (
            <StatChip value={data.globalMastered} label="mastered" variant="mastered" />
          )}
          {data.globalLearning > 0 && (
            <StatChip value={data.globalLearning} label="learning" variant="learning" />
          )}
          {data.globalUntouched > 0 && (
            <StatChip value={data.globalUntouched} label="new" variant="new" />
          )}
        </div>
      </div>

      {/* Per-course sections */}
      {data.courses.map(course => (
        <CourseSection key={course.courseId} course={course} />
      ))}
    </div>
  );
}

function StatChip({
  value,
  label,
  variant,
}: {
  value: number;
  label: string;
  variant: 'default' | 'mastered' | 'learning' | 'new';
}) {
  const styles = {
    default: 'bg-muted text-foreground',
    mastered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    learning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    new: 'bg-muted text-muted-foreground',
  }[variant];

  return (
    <span className={`text-sm font-medium px-3 py-1 rounded-full ${styles}`}>
      {value} {label}
    </span>
  );
}

function CourseSection({ course }: { course: CourseNotebook }) {
  const [open, setOpen] = useState(true);

  const learningEntries = course.entries.filter(
    e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)
  );
  const untouchedEntries = course.entries.filter(
    e => e.correctCount === 0 && e.incorrectCount === 0
  );
  const masteredEntries = course.entries.filter(e => e.isCommitted);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Course header */}
      <button
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-muted/30 transition"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-foreground flex-1">{course.courseName}</span>
        <div className="flex items-center gap-1.5 mr-2">
          {course.learningCount > 0 && (
            <span className="text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
              {course.learningCount} learning
            </span>
          )}
          {course.masteredCount > 0 && (
            <span className="text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              {course.masteredCount} mastered
            </span>
          )}
          {course.untouchedCount > 0 && (
            <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {course.untouchedCount} new
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        }
      </button>

      {/* Course entries */}
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {learningEntries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
                Still Learning ({learningEntries.length})
              </p>
              <div className="space-y-3">
                {learningEntries.map(entry => (
                  <WordCard
                    key={`${entry.lessonId}:${entry.vocabItemId}`}
                    entry={entry}
                    commitThreshold={course.commitThreshold}
                  />
                ))}
              </div>
            </div>
          )}

          {untouchedEntries.length > 0 && (
            <CollapsibleGroup
              label={`Coming Up (${untouchedEntries.length})`}
              labelClass="text-muted-foreground/60"
            >
              {untouchedEntries.map(entry => (
                <WordCard
                  key={`${entry.lessonId}:${entry.vocabItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
            </CollapsibleGroup>
          )}

          {masteredEntries.length > 0 && (
            <CollapsibleGroup
              label={`Mastered (${masteredEntries.length})`}
              labelClass="text-emerald-600"
            >
              {masteredEntries.map(entry => (
                <WordCard
                  key={`${entry.lessonId}:${entry.vocabItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                />
              ))}
            </CollapsibleGroup>
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleGroup({
  label,
  labelClass,
  children,
}: {
  label: string;
  labelClass: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="flex items-center gap-1.5 w-full text-left mb-3 group"
        onClick={() => setOpen(o => !o)}
      >
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{label}</p>
        {open
          ? <ChevronUp className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition" />
          : <ChevronDown className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition" />
        }
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function WordCard({ entry, commitThreshold }: { entry: NotebookEntry; commitThreshold: number }) {
  const untouched = entry.correctCount === 0 && entry.incorrectCount === 0;
  const progressPct = entry.isCommitted
    ? 100
    : Math.min((entry.correctCount / commitThreshold) * 100, 100);

  return (
    <div className={`rounded-lg border border-border p-4 ${untouched ? 'opacity-60' : 'bg-background'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-foreground text-base">{entry.word}</span>
          {entry.ipa && (
            <span className="font-mono text-xs text-muted-foreground">{entry.ipa}</span>
          )}
        </div>
        {entry.isCommitted && (
          <span className="flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full shrink-0">
            <CheckCircle className="w-3 h-3" />
            Mastered
          </span>
        )}
      </div>

      {entry.clue && (
        <p className="text-sm text-muted-foreground mb-1">{entry.clue}</p>
      )}

      {entry.exampleSentence && (
        <p className="text-xs italic text-muted-foreground/70 mb-3">
          &ldquo;{entry.exampleSentence}&rdquo;
        </p>
      )}

      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${entry.isCommitted ? 'bg-emerald-500' : untouched ? 'bg-muted' : 'bg-primary'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        {entry.isCommitted ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            {entry.correctCount} correct — committed to memory
          </span>
        ) : untouched ? (
          <span className="text-muted-foreground/50">Not yet practiced</span>
        ) : (
          <>
            <span className="text-primary font-medium">
              {entry.correctCount}/{commitThreshold} correct
            </span>
            {entry.incorrectCount > 0 && (
              <span className="text-destructive/60">
                · {entry.incorrectCount} incorrect
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
