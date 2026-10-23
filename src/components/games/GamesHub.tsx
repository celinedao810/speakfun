"use client";

import React, { useEffect, useState } from 'react';
import { Gamepad2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ReviewGame, { StructureCardItem } from '@/components/games/ReviewGame';
import SentenceBuilder from '@/components/games/sentenceBuilder/SentenceBuilder';
import type { GamePool } from '@/lib/games/sentenceBuilder';
import type { GameClass } from '@/app/api/games/classes/route';
import type { GlobalNotebookResponse } from '@/app/api/homework/vocab-notebook/global/route';
import type { GlobalStructureNotebookResponse } from '@/app/api/homework/structure-notebook/global/route';

type GameId = 'builder' | 'review';
const GAMES: { id: GameId; label: string }[] = [
  { id: 'builder', label: 'Sentence Builder' },
  { id: 'review', label: 'Review cards' },
];
const PREFS = 'speakfun:games:prefs';

/*
 * The Games tab for teachers and learners. Every game runs on one class's material, so classes
 * taught at the same time never share a pool. Learners' review cards keep using their own notebook.
 */
export default function GamesHub({ role }: { role: 'teacher' | 'learner' }) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<GameClass[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [game, setGame] = useState<GameId>('builder');
  const [pool, setPool] = useState<GamePool | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);

  useEffect(() => {
    let prefs: { classId?: string; game?: GameId } = {};
    try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { /* storage blocked */ }
    if (prefs.game) setGame(prefs.game);
    fetch('/api/games/classes').then(r => r.ok ? r.json() : { classes: [] }).then(({ classes: all }: { classes: GameClass[] }) => {
      const mine = all.filter(c => c.role === role);
      setClasses(mine);
      setClassId(mine.find(c => c.id === prefs.classId)?.id ?? mine[0]?.id ?? null);
    });
  }, [role]);

  useEffect(() => {
    try { localStorage.setItem(PREFS, JSON.stringify({ classId, game })); } catch { /* storage blocked */ }
  }, [classId, game]);

  useEffect(() => {
    if (!classId) return;
    setPool(null); setPoolError(null);
    fetch(`/api/games/pool?classId=${encodeURIComponent(classId)}`)
      .then(async r => r.ok ? setPool(await r.json()) : setPoolError((await r.json().catch(() => ({}))).error || 'Could not load this class'))
      .catch(() => setPoolError('Could not load this class'));
  }, [classId]);

  const needsClass = game === 'builder' || role === 'teacher';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Games</h1>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {GAMES.map(g => (
            <button key={g.id} type="button" onClick={() => setGame(g.id)}
              className={`px-3 py-1.5 text-sm ${game === g.id ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
              {g.label}
            </button>
          ))}
        </div>
        {needsClass && classes && classes.length > 0 && (
          <label className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-muted-foreground">Class</span>
            <select value={classId ?? ''} onChange={e => setClassId(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border px-5 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          {game === 'builder' ? 'Make sentences from what you have learnt' : 'Review what you have learnt'}
        </p>
        {!needsClass ? <LearnerReview />
          : classes === null || (classId && !pool && !poolError) ? <Loading />
          : !classes.length ? <p className="text-sm text-muted-foreground">
              {role === 'teacher' ? 'Create a class and add a course to it to play games with its lessons.' : 'Join a class to play games with its lessons.'}
            </p>
          : poolError ? <p className="text-sm text-destructive">{poolError}</p>
          : pool && (game === 'builder'
            ? <SentenceBuilder key={pool.classId} pool={pool} storageKey={`speakfun:sentence-builder:v1:${user?.id ?? 'anon'}:${pool.classId}`} />
            : <ReviewGame key={pool.classId} loading={false} vocabPool={pool.vocab.map(v => v.word)}
                structurePool={pool.structures.map(s => ({ pattern: s.pattern, exampleSentence: s.example }))} />)}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>;
}

/** Learners' review cards: the words and structures in their own notebook, as before. */
function LearnerReview() {
  const [vocabPool, setVocabPool] = useState<string[]>([]);
  const [structurePool, setStructurePool] = useState<StructureCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/homework/vocab-notebook/global').then(r => r.ok ? r.json() as Promise<GlobalNotebookResponse> : null),
      fetch('/api/homework/structure-notebook/global').then(r => r.ok ? r.json() as Promise<GlobalStructureNotebookResponse> : null),
    ]).then(([vocab, structure]) => {
      if (vocab) setVocabPool(vocab.courses.flatMap(c => c.entries.map(e => e.word)));
      if (structure) setStructurePool(structure.courses.flatMap(c => c.entries.map(e => ({
        pattern: e.pattern,
        exampleSentence: e.exampleSentence,
      }))));
    }).finally(() => setLoading(false));
  }, []);

  return <ReviewGame vocabPool={vocabPool} structurePool={structurePool} loading={loading} />;
}
