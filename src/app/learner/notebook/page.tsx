"use client";

import React, { useState, useEffect } from 'react';
import { BookMarked, MessageCircle, BookOpen, ChevronDown, ChevronUp, Loader2, CheckCircle, Search, X } from 'lucide-react';
import { GlobalNotebookResponse, CourseNotebook } from '@/app/api/homework/vocab-notebook/global/route';
import { NotebookEntry } from '@/app/api/homework/vocab-notebook/route';
import { GlobalStructureNotebookResponse, CourseStructureNotebook } from '@/app/api/homework/structure-notebook/global/route';
import { StructureNotebookEntry } from '@/app/api/homework/structure-notebook/route';

export default function NotebookPage() {
  const [vocabData, setVocabData] = useState<GlobalNotebookResponse | null>(null);
  const [structureData, setStructureData] = useState<GlobalStructureNotebookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'vocab' | 'structures'>('vocab');
  const [vocabQuery, setVocabQuery] = useState('');
  const [structureQuery, setStructureQuery] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/homework/vocab-notebook/global')
        .then(r => r.ok ? r.json() : r.json().then((j: { error?: string }) => Promise.reject(j.error ?? 'Failed'))),
      fetch('/api/homework/structure-notebook/global')
        .then(r => r.ok ? r.json() : null),
    ])
      .then(([vocab, structure]) => {
        setVocabData(vocab);
        if (structure) setStructureData(structure);
      })
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

  const hasVocab = vocabData && vocabData.globalTotal > 0;
  const hasStructures = structureData && structureData.globalTotal > 0;

  if (!hasVocab && !hasStructures) {
    return (
      <div className="text-center py-16">
        <BookMarked className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground/60">
          No notebook entries yet. Join a class and complete some homework sessions to start building your notebook.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header card */}
      <div className="bg-card rounded-xl border border-border px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <BookMarked className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">My Notebook</h1>
        </div>

        {/* Vocab stats */}
        {hasVocab && (
          <div className="flex flex-wrap gap-2 mb-3">
            <StatChip value={vocabData.globalTotal} label="total words" variant="default" />
            {vocabData.globalMastered > 0 && (
              <StatChip value={vocabData.globalMastered} label="mastered" variant="mastered" />
            )}
            {vocabData.globalLearning > 0 && (
              <StatChip value={vocabData.globalLearning} label="learning" variant="learning" />
            )}
            {vocabData.globalUntouched > 0 && (
              <StatChip value={vocabData.globalUntouched} label="new" variant="new" />
            )}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('vocab')}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 text-xs font-semibold transition ${
              activeTab === 'vocab'
                ? 'text-primary bg-primary/10 border-r border-border'
                : 'text-muted-foreground hover:text-foreground border-r border-border'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Vocab
            {hasVocab && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'vocab' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {vocabData.globalTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('structures')}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 text-xs font-semibold transition ${
              activeTab === 'structures'
                ? 'text-violet-600 bg-violet-50 dark:bg-violet-950/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Structures
            {hasStructures && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'structures' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' : 'bg-muted text-muted-foreground'}`}>
                {structureData.globalTotal}
              </span>
            )}
          </button>
        </div>

        {/* Search input */}
        {activeTab === 'vocab' && hasVocab && (
          <div className="mt-3 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={vocabQuery}
              onChange={e => setVocabQuery(e.target.value)}
              placeholder="Search vocab…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
            {vocabQuery && (
              <button onClick={() => setVocabQuery('')} className="text-muted-foreground/50 hover:text-muted-foreground transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {activeTab === 'structures' && hasStructures && (
          <div className="mt-3 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={structureQuery}
              onChange={e => setStructureQuery(e.target.value)}
              placeholder="Search structures…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
            {structureQuery && (
              <button onClick={() => setStructureQuery('')} className="text-muted-foreground/50 hover:text-muted-foreground transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'vocab' ? (
        hasVocab ? (
          <>
            {vocabData.courses.map(course => (
              <CourseSection key={course.courseId} course={course} searchQuery={vocabQuery} />
            ))}
            {vocabQuery.trim() !== '' &&
              !vocabData.courses.some(c =>
                c.entries.some(e => e.word.toLowerCase().includes(vocabQuery.trim().toLowerCase()))
              ) && (
              <div className="text-center py-12 text-sm text-muted-foreground/60">
                No results found for &ldquo;{vocabQuery.trim()}&rdquo;
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground/60">No vocab yet.</p>
          </div>
        )
      ) : (
        hasStructures ? (
          <>
            {structureData.courses.map(course => (
              <StructureCourseSection key={course.courseId} course={course} searchQuery={structureQuery} />
            ))}
            {structureQuery.trim() !== '' &&
              !structureData.courses.some(c =>
                c.entries.some(e => e.pattern.toLowerCase().includes(structureQuery.trim().toLowerCase()))
              ) && (
              <div className="text-center py-12 text-sm text-muted-foreground/60">
                No results found for &ldquo;{structureQuery.trim()}&rdquo;
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/60">
              No structures yet. Complete conversation exercises to start tracking mastery.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ─── Search helper ─────────────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-700/50 rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
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

// ─── Vocab Course Section ──────────────────────────────────────────────────────

function CourseSection({ course, searchQuery = '' }: { course: CourseNotebook; searchQuery?: string }) {
  const [open, setOpen] = useState(true);

  const isSearchActive = searchQuery.trim() !== '';
  const effectiveOpen = isSearchActive ? true : open;

  const matchEntry = (entry: { word: string }) =>
    entry.word.toLowerCase().includes(searchQuery.trim().toLowerCase());

  if (isSearchActive && !course.entries.some(matchEntry)) return null;

  const learningEntries = course.entries.filter(
    e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)
  );
  const untouchedEntries = course.entries.filter(
    e => e.correctCount === 0 && e.incorrectCount === 0
  );
  const masteredEntries = course.entries.filter(e => e.isCommitted);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
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
        {effectiveOpen
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        }
      </button>

      {effectiveOpen && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {isSearchActive ? (
            <>
              {course.entries.filter(matchEntry).map(entry => (
                <WordCard
                  key={`${entry.lessonId}:${entry.vocabItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                  highlight={searchQuery.trim()}
                />
              ))}
              {course.entries.filter(e => !matchEntry(e)).map(entry => (
                <div key={`${entry.lessonId}:${entry.vocabItemId}`} className="opacity-40">
                  <WordCard entry={entry} commitThreshold={course.commitThreshold} />
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-4">
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
      )}
    </div>
  );
}

// ─── Structure Course Section ──────────────────────────────────────────────────

function StructureCourseSection({ course, searchQuery = '' }: { course: CourseStructureNotebook; searchQuery?: string }) {
  const [open, setOpen] = useState(true);

  const isSearchActive = searchQuery.trim() !== '';
  const effectiveOpen = isSearchActive ? true : open;

  const matchEntry = (entry: { pattern: string }) =>
    entry.pattern.toLowerCase().includes(searchQuery.trim().toLowerCase());

  if (isSearchActive && !course.entries.some(matchEntry)) return null;

  const learningEntries = course.entries.filter(
    e => !e.isCommitted && (e.correctCount > 0 || e.incorrectCount > 0)
  );
  const untouchedEntries = course.entries.filter(
    e => e.correctCount === 0 && e.incorrectCount === 0
  );
  const masteredEntries = course.entries.filter(e => e.isCommitted);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
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
        {effectiveOpen
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        }
      </button>

      {effectiveOpen && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {isSearchActive ? (
            <>
              {course.entries.filter(matchEntry).map(entry => (
                <StructureCard
                  key={`${entry.lessonId}:${entry.structureItemId}`}
                  entry={entry}
                  commitThreshold={course.commitThreshold}
                  highlight={searchQuery.trim()}
                />
              ))}
              {course.entries.filter(e => !matchEntry(e)).map(entry => (
                <div key={`${entry.lessonId}:${entry.structureItemId}`} className="opacity-40">
                  <StructureCard entry={entry} commitThreshold={course.commitThreshold} />
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-4">
              {learningEntries.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
                    Still Learning ({learningEntries.length})
                  </p>
                  <div className="space-y-3">
                    {learningEntries.map(entry => (
                      <StructureCard
                        key={`${entry.lessonId}:${entry.structureItemId}`}
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
                    <StructureCard
                      key={`${entry.lessonId}:${entry.structureItemId}`}
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
                    <StructureCard
                      key={`${entry.lessonId}:${entry.structureItemId}`}
                      entry={entry}
                      commitThreshold={course.commitThreshold}
                    />
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

function WordCard({ entry, commitThreshold, highlight }: { entry: NotebookEntry; commitThreshold: number; highlight?: string }) {
  const untouched = entry.correctCount === 0 && entry.incorrectCount === 0;
  const progressPct = entry.isCommitted
    ? 100
    : Math.min((entry.correctCount / commitThreshold) * 100, 100);

  return (
    <div className={`rounded-lg border border-border p-4 ${untouched ? 'opacity-60' : 'bg-background'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-foreground text-base">{highlightMatch(entry.word, highlight ?? '')}</span>
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

function StructureCard({ entry, commitThreshold, highlight }: { entry: StructureNotebookEntry; commitThreshold: number; highlight?: string }) {
  const untouched = entry.correctCount === 0 && entry.incorrectCount === 0;
  const progressPct = entry.isCommitted
    ? 100
    : Math.min((entry.correctCount / commitThreshold) * 100, 100);

  return (
    <div className={`rounded-lg border border-border p-4 ${untouched ? 'opacity-60' : 'bg-background'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-sm font-semibold text-foreground">{highlightMatch(entry.pattern, highlight ?? '')}</span>
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
