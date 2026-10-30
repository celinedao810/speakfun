/**
 * Voice Chain tunables. Every timing, limit and scoring rule lives here.
 * claimSeconds / claimGraceSeconds are passed to the SQL functions in
 * supabase/migrations/028_voice_chain.sql, so changing them here is enough.
 */

export type VoiceChainMode = 'relaxed' | 'realtalk';

export interface ModeSettings {
  label: string;
  description: string;
  /** Total times the message can be played, including the first listen. */
  plays: number;
  /** Seconds allowed to pick the letter (null = no limit). */
  letterSeconds: number | null;
  /** Countdown after the letter is confirmed; recording then starts on its own. */
  thinkSeconds: number;
  /** Points added to the message total (still capped at MESSAGE_MAX). */
  bonus: number;
}

export const VOICE_CHAIN = {
  maxSeconds: 45,
  /** Recordings shorter than this, or with fewer words, are rejected and not stored. */
  minSeconds: 10,
  minWords: 5,

  startersPerDay: 2,

  /** How long a picked-up message stays reserved for the recipient. */
  claimSeconds: 2 * 60,
  /** Extra time after the claim ends during which a submitted take is still accepted (AI scoring time). */
  claimGraceSeconds: 2 * 60,
  /** Recording attempts per picked-up message (rejected takes count). */
  maxTakes: 3,

  /** Wrong letter guesses before the letter is revealed. */
  letterMissesBeforeReveal: 2,
  /** Points taken off when the letter had to be revealed. */
  revealPenalty: 0.5,

  retentionHours: 24,
  signedUrlSeconds: 10 * 60,
  /** Links to your own recordings on My progress last longer, so the page can stay open. */
  ownAudioUrlSeconds: 60 * 60,
  /** Largest accepted base64 payload (~3 MB of audio). */
  maxAudioBase64Chars: 4_000_000,

  leaderboardSize: 20,

  nicknameMin: 3,
  nicknameMax: 20,

  modes: {
    relaxed: {
      label: 'Relaxed',
      description: '1 replay, no time limit on the letter, 15s to think.',
      plays: 2,
      letterSeconds: null,
      thinkSeconds: 15,
      bonus: 0,
    },
    realtalk: {
      label: 'Real talk',
      description: '1 replay, 10s to pick the letter, 3s to think. +0.5 bonus point.',
      plays: 2,
      letterSeconds: 10,
      thinkSeconds: 3,
      bonus: 0.5,
    },
  } satisfies Record<VoiceChainMode, ModeSettings>,
} as const;

export const SCORE_CRITERIA = [
  { key: 'coherence', label: 'Coherence' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'wordChoice', label: 'Word choice' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'pronunciation', label: 'Pronunciation' },
] as const;

/** Each criterion scores 0, 0.5 or 1; five criteria → a message is worth 0–5. */
export const CRITERION_MAX = 1;
export const MESSAGE_MAX = 5;

export function isMode(value: unknown): value is VoiceChainMode {
  return value === 'relaxed' || value === 'realtalk';
}
