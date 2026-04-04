"use client";

import React, { useState, useEffect } from 'react';
import { BookOpen, MessageCircle, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { NotebookEntry } from '@/app/api/homework/vocab-notebook/route';
import { StructureNotebookEntry } from '@/app/api/homework/structure-notebook/route';

interface VocabNotebookData {
  entries: NotebookEntry[];
  commitThreshold: number;
  masteredCount: number;
  learningCount: number;
  untouchedCount: number;
}

interface StructureNotebookData {
  entries: StructureNotebookEntry[];
  commitThreshold: number;
  masteredCount: number;
  learningCount: number;
  untouchedCount: number;
}

export default function HomeworkNotebook({ classId }: { classId: string }) {
  const [vocabData, setVocabData] = useState<VocabNotebookData | null>(null);
  const [structureData, setStructureData] = useState<StructureNotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'structures'>('vocab');

  useEffect(() => {
    Promise.all([
      fetch(`/api/homework/vocab-notebook?classId=${classId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/homework/structure-notebook?classId=${classId}`).then(r => r.ok ? r.json() : null),
    ]).then(([vocab, structure]) => {
      if (vocab) setVocabData(vocab);
      if (structure) setStructureData(structure);
    }).finally(() => setLoading(false));
  }, [classId]);

  const totalVocabMastered = vocabData?.masteredCount ?? 0;
  const totalStructMastered = structureData?.masteredCount ?? 0;
  const totalStructItems = structureData?.entries.length ?? 0;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header — always visible, acts as toggle */}
      <button
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-muted/30 transition"
        onClick={() => setOpen(o => !o)}
      >
        <BookOpen className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          My Notebook
        </span>

        {!loading && (
          <div className="flex items-center gap-1.5 mr-2">
            {(vocabData?.entries.length ?? 0) > 0 && (
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {vocabData!.entries.length} words
              </span>
            )}
            {totalStructItems > 0 && (
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                · {totalStructItems} structures
              </span>
            )}
            {(totalVocabMastered + totalStructMastered) > 0 && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                · {totalVocabMastered + totalStructMastered} mastered
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
        <div className="border-t border-border">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('vocab')}
              className={`flex items-center gap-1.5 flex-1 justify-center py-3 text-xs font-semibold transition ${
                activeTab === 'vocab'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Vocab
              {totalVocabMastered > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {totalVocabMastered}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('structures')}
              className={`flex items-center gap-1.5 flex-1 justify-center py-3 text-xs font-semibold transition ${
                activeTab === 'structures'
                  ? 'text-violet-600 border-b-2 border-violet-500 bg-violet-50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Structures
              {totalStructMastered > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {totalStructMastered}
                </span>
              )}
            </button>
          </div>

          <div className="px-5 py-4">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
              </div>
            ) : activeTab === 'vocab' ? (
              <VocabTab data={vocabData} />
            ) : (
              <StructuresTab data={structureData} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vocab Tab ───────────────────────────────────────────────────────────────

function VocabTab({ data }: { data: VocabNotebookData | null }) {
  if (!data || data.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/60 text-center py-4">
        No vocab words found. Ask your teacher to assign courses and generate exercises.
      </p>
    );
  }

  const learningEntries = data.entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0));
  const masteredEntries = data.entries.filter(e => e.isCommitted);
  const untouchedEntries = data.entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0);

  return (
    <div className="space-y-4">
      {learningEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
            Still Learning ({learningEntries.length})
          </p>
          <div className="space-y-3">
            {learningEntries.map(entry => (
              <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
            ))}
          </div>
        </div>
      )}
      {untouchedEntries.length > 0 && (
        <CollapsibleGroup label={`Coming Up (${untouchedEntries.length})`} labelClass="text-muted-foreground/60">
          {untouchedEntries.map(entry => (
            <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
          ))}
        </CollapsibleGroup>
      )}
      {masteredEntries.length > 0 && (
        <CollapsibleGroup label={`Mastered (${masteredEntries.length})`} labelClass="text-emerald-600">
          {masteredEntries.map(entry => (
            <WordCard key={`${entry.lessonId}:${entry.vocabItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
          ))}
        </CollapsibleGroup>
      )}
    </div>
  );
}

// ─── Structures Tab ───────────────────────────────────────────────────────────

function StructuresTab({ data }: { data: StructureNotebookData | null }) {
  if (!data || data.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/60 text-center py-4">
        No structures found. Complete conversation exercises to start tracking mastery.
      </p>
    );
  }

  const learningEntries = data.entries.filter(e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0));
  const masteredEntries = data.entries.filter(e => e.isCommitted);
  const untouchedEntries = data.entries.filter(e => e.correctCount === 0 && e.incorrectCount === 0);

  return (
    <div className="space-y-4">
      {learningEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
            Still Learning ({learningEntries.length})
          </p>
          <div className="space-y-3">
            {learningEntries.map(entry => (
              <StructureCard key={`${entry.lessonId}:${entry.structureItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
            ))}
          </div>
        </div>
      )}
      {untouchedEntries.length > 0 && (
        <CollapsibleGroup label={`Coming Up (${untouchedEntries.length})`} labelClass="text-muted-foreground/60">
          {untouchedEntries.map(entry => (
            <StructureCard key={`${entry.lessonId}:${entry.structureItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
          ))}
        </CollapsibleGroup>
      )}
      {masteredEntries.length > 0 && (
        <CollapsibleGroup label={`Mastered (${masteredEntries.length})`} labelClass="text-emerald-600">
          {masteredEntries.map(entry => (
            <StructureCard key={`${entry.lessonId}:${entry.structureItemId}`} entry={entry} commitThreshold={data.commitThreshold} />
          ))}
        </CollapsibleGroup>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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

function StructureCard({ entry, commitThreshold }: { entry: StructureNotebookEntry; commitThreshold: number }) {
  const untouched = entry.correctCount === 0 && entry.incorrectCount === 0;
  const progressPct = entry.isCommitted
    ? 100
    : Math.min((entry.correctCount / commitThreshold) * 100, 100);

  return (
    <div className={`rounded-lg border border-border p-4 ${untouched ? 'opacity-60' : 'bg-background'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-sm font-semibold text-foreground">{entry.pattern}</span>
        {entry.isCommitted && (
          <span className="flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full shrink-0">
            <CheckCircle className="w-3 h-3" />
            Mastered
          </span>
        )}
      </div>
      {entry.explanation && (
        <p className="text-sm text-muted-foreground mb-3">{entry.explanation}</p>
      )}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${entry.isCommitted ? 'bg-emerald-500' : untouched ? 'bg-muted' : 'bg-violet-500'}`}
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
            <span className="text-violet-600 font-medium">
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
