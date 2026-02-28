"use client";

import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { NotebookEntry } from '@/app/api/homework/vocab-notebook/route';

interface VocabNotebookData {
  entries: NotebookEntry[];
  commitThreshold: number;
  masteredCount: number;
  learningCount: number;
  untouchedCount: number;
}

export default function VocabNotebook({ classId }: { classId: string }) {
  const [data, setData] = useState<VocabNotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/homework/vocab-notebook?classId=${classId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) setData(json); })
      .finally(() => setLoading(false));
  }, [classId]);

  const learningEntries = data?.entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)) ?? [];
  const masteredEntries = data?.entries.filter(e => e.isCommitted) ?? [];
  const untouchedEntries = data?.entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0) ?? [];
  const totalCount = data?.entries.length ?? 0;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header — always visible, acts as toggle */}
      <button
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-muted/30 transition"
        onClick={() => setOpen(o => !o)}
      >
        <BookOpen className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          Vocab Notebook
        </span>

        {!loading && totalCount > 0 && (
          <div className="flex items-center gap-1.5 mr-2">
            {(data?.learningCount ?? 0) > 0 && (
              <span className="text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
                {data!.learningCount} learning
              </span>
            )}
            {(data?.masteredCount ?? 0) > 0 && (
              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                {data!.masteredCount} mastered
              </span>
            )}
            {(data?.untouchedCount ?? 0) > 0 && (
              <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {data!.untouchedCount} new
              </span>
            )}
          </div>
        )}

        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        }
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-border px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-4">
              No vocab words found. Ask your teacher to assign courses and generate exercises.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Still Learning — most actionable, always expanded */}
              {learningEntries.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
                    Still Learning ({learningEntries.length})
                  </p>
                  <div className="space-y-3">
                    {learningEntries.map(entry => (
                      <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data!.commitThreshold} />
                    ))}
                  </div>
                </div>
              )}

              {/* Coming Up — collapsible, expanded by default */}
              {untouchedEntries.length > 0 && (
                <CollapsibleGroup
                  label={`Coming Up (${untouchedEntries.length})`}
                  labelClass="text-muted-foreground/60"
                >
                  {untouchedEntries.map(entry => (
                    <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data!.commitThreshold} />
                  ))}
                </CollapsibleGroup>
              )}

              {/* Mastered — collapsible, expanded by default */}
              {masteredEntries.length > 0 && (
                <CollapsibleGroup
                  label={`Mastered (${masteredEntries.length})`}
                  labelClass="text-emerald-600"
                >
                  {masteredEntries.map(entry => (
                    <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data!.commitThreshold} />
                  ))}
                </CollapsibleGroup>
              )}
            </div>
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
      {/* Word + IPA + badge row */}
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

      {/* Definition */}
      {entry.clue && (
        <p className="text-sm text-muted-foreground mb-1">{entry.clue}</p>
      )}

      {/* Example sentence */}
      {entry.exampleSentence && (
        <p className="text-xs italic text-muted-foreground/70 mb-3">
          &ldquo;{entry.exampleSentence}&rdquo;
        </p>
      )}

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${entry.isCommitted ? 'bg-emerald-500' : untouched ? 'bg-muted' : 'bg-primary'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Progress text */}
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
