"use client";

import { useState } from 'react';
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
    correctGuessesToCommit: settings.correctGuessesToCommit,
    structureGuessesToCommit: settings.structureGuessesToCommit,
    reviewWordCount: settings.reviewWordCount,
    reviewStructureCount: settings.reviewStructureCount,
    homeworkEndDate: settings.homeworkEndDate ?? '',
    ex3DurationMins: settings.ex3DurationMins,
    ex3DeductedPointsPerError: settings.ex3DeductedPointsPerError,
  });

  const handleSave = async () => {
    setSaving(true);
    await upsertClassHomeworkSettings(supabase, {
      classId,
      homeworkRestartedAt: settings.homeworkRestartedAt,
      reviewIntervalDays: settings.reviewIntervalDays,
      wordsPerSession: settings.wordsPerSession,
      structuresPerSession: settings.structuresPerSession,
      ...values,
      homeworkEndDate: values.homeworkEndDate || null,
      ex3DurationMins: values.ex3DurationMins,
      ex3DeductedPointsPerError: values.ex3DeductedPointsPerError,
    });
    onSaved({
      ...settings,
      classId,
      ...values,
      homeworkEndDate: values.homeworkEndDate || null,
      ex3DurationMins: values.ex3DurationMins,
      ex3DeductedPointsPerError: values.ex3DeductedPointsPerError,
    });
    setSaving(false);
  };

  const field = (
    label: string,
    key: keyof Omit<typeof values, 'homeworkEndDate'>,
    min: number,
    max: number,
    hint?: string,
    step?: number
  ) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
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

      <div className="grid grid-cols-2 gap-4 mb-4">
        {field('Words per session', 'reviewWordCount', 5, 30, 'Vocabulary words shown in Ex1')}
        {field('Structures per session', 'reviewStructureCount', 1, 10, 'Structures shown in Ex2')}
        {field('Vocab mastery threshold', 'correctGuessesToCommit', 3, 14, 'Correct guesses to commit a word')}
        {field('Structure mastery threshold', 'structureGuessesToCommit', 3, 20, 'Correct turns to commit a structure')}
      </div>

      {/* Ex3 settings */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ex3 · Free Talk</p>
        <div className="grid grid-cols-2 gap-4">
          {field('Duration (mins)', 'ex3DurationMins', 1, 10, 'Recording time limit')}
          {field('Deducted pts / error', 'ex3DeductedPointsPerError', 0, 2, 'Points deducted per error', 0.05)}
        </div>
      </div>

      {/* End date */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Session chain end date</label>
        <input
          type="date"
          value={values.homeworkEndDate}
          onChange={(e) => setValues(v => ({ ...v, homeworkEndDate: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input outline-none focus:ring-2 focus:ring-ring text-foreground"
        />
        <p className="text-xs text-muted-foreground/60 mt-0.5">No new sessions will be created after this date. Leave blank for no end date.</p>
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
