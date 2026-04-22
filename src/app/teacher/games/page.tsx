"use client";

import React, { useState, useEffect } from 'react';
import { Gamepad2 } from 'lucide-react';
import ReviewGame from '@/components/games/ReviewGame';

export default function TeacherGamesPage() {
  const [vocabPool, setVocabPool] = useState<string[]>([]);
  const [structurePool, setStructurePool] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/teacher/vocab-pool').then(r => r.ok ? r.json() : null),
      fetch('/api/teacher/structure-pool').then(r => r.ok ? r.json() : null),
    ]).then(([vocab, structure]) => {
      if (vocab) setVocabPool(vocab.words ?? []);
      if (structure) setStructurePool(structure.patterns ?? []);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Games</h1>
      </div>
      <div className="bg-card rounded-xl border border-border px-5 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Review What You Have Learnt
        </p>
        <ReviewGame vocabPool={vocabPool} structurePool={structurePool} loading={loading} />
      </div>
    </div>
  );
}
