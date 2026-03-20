"use client";

import React, { useState } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';
import { ClassHomeworkSettings } from '@/lib/types';
import { upsertClassHomeworkSettings } from '@/lib/supabase/queries/homework';
import { supabase } from '@/lib/supabase/client';

interface HomeworkSettingsPanelProps {
  classId: string;
  settings: ClassHomeworkSettings;
  onSaved: (settings: ClassHomeworkSettings) => void;
}

export default function HomeworkSettingsPanel({ classId, settings, onSaved }: HomeworkSettingsPanelProps) {
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    wordsPerSession: settings.wordsPerSession,
    structuresPerSession: settings.structuresPerSession,
    correctGuessesToCommit: settings.correctGuessesToCommit,
    structureGuessesToCommit: settings.structureGuessesToCommit,
    reviewIntervalDays: settings.reviewIntervalDays,
    reviewWordCount: settings.reviewWordCount,
    reviewStructureCount: settings.reviewStructureCount,
  });

  const handleSave = async () => {
    setSaving(true);
    await upsertClassHomeworkSettings(supabase, { classId, homeworkRestartedAt: settings.homeworkRestartedAt, ...values });
    onSaved({ ...settings, classId, ...values });
    setSaving(false);
  };

  const field = (
    label: string,
    key: keyof typeof values,
    min: number,
    max: number,
    hint?: string
  ) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={values[key]}
        onChange={(e) => setValues(v => ({ ...v, [key]: Number(e.target.value) }))}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input outline-none focus:ring-2 focus:ring-ring text-foreground"
      />
      {hint && <p className="text-xs text-muted-foreground/60 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Homework Settings</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        {field('Words per session', 'wordsPerSession', 5, 30, 'Vocab words shown daily')}
        {field('Structures per session', 'structuresPerSession', 1, 10, 'Sentence structures daily')}
        {field('Vocab mastery threshold', 'correctGuessesToCommit', 3, 14, 'Correct guesses to commit vocab')}
        {field('Structure mastery threshold', 'structureGuessesToCommit', 3, 20, 'Correct turns to commit structure')}
        {field('Review every N days', 'reviewIntervalDays', 3, 30, 'Calendar days between reviews')}
        {field('Review word count', 'reviewWordCount', 5, 30, 'Words in review session')}
        {field('Review structure count', 'reviewStructureCount', 1, 10, 'Structures in review Ex2')}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Settings
      </button>
    </div>
  );
}
