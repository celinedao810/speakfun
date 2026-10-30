"use client";

import React, { useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { vcPut } from '@/lib/voiceChain/client';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { primaryBtn, secondaryBtn } from './shared';

interface NicknameFormProps {
  current: string | null;
  onSaved: (nickname: string) => void;
  onCancel?: () => void;
}

/** Anonymous nickname — the only name other players ever see. */
export default function NicknameForm({ current, onSaved, onCancel }: NicknameFormProps) {
  const [value, setValue] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { nickname } = await vcPut<{ nickname: string }>('profile', { nickname: value });
      onSaved(nickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save nickname');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-2">
        <UserRound className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{current ? 'Change your nickname' : 'Choose a nickname'}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Other players only ever see this nickname — never your real name.
        {current && ' Your scores, stats and leaderboard place stay with your account when you change it.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={VOICE_CHAIN.nicknameMax}
          placeholder="e.g. NightOwl42"
          className="flex-1 min-w-[12rem] rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <button type="submit" className={primaryBtn} disabled={saving || value.trim().length < VOICE_CHAIN.nicknameMin}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
        </button>
        {onCancel && <button type="button" className={secondaryBtn} onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
