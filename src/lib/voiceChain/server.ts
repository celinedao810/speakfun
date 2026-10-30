import { NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { todayUtc7 } from '@/lib/homework/generateWindow';
import { CRITERION_MAX, VOICE_CHAIN } from './config';
import type { ClaimView, DayStats, MyMessage, ReplyPreview, ScoreBreakdown, VoiceChainFeedback } from './types';
import type { VoiceChainMode } from './config';

export const BUCKET = 'voice-chain';

/** Row shape of public.voice_chain_messages. */
export interface MessageRow {
  id: string;
  chain_id: string;
  parent_id: string | null;
  chain_position: number;
  sender_id: string;
  day: string;
  required_letter: string | null;
  last_letter: string;
  mode: VoiceChainMode | null;
  letter_revealed: boolean;
  audio_path: string | null;
  mime_type: string | null;
  transcript: string | null;
  feedback: VoiceChainFeedback | null;
  duration_seconds: number | string;
  score_coherence: number;
  score_grammar: number;
  score_word_choice: number;
  score_fluency: number;
  score_pronunciation: number;
  score_total: number;
  status: MyMessage['status'];
  answered_by: string | null;
  claimed_by: string | null;
  claim_mode: VoiceChainMode | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  claim_letter_attempts: number;
  claim_letter_ok: boolean;
  claim_letter_revealed: boolean;
  claim_takes: number;
  /** Added in migration 029. */
  claim_plays?: number;
  created_at: string;
  expires_at: string;
  purged_at: string | null;
}

/** Service-role client: Voice Chain tables are only reachable through these routes. */
export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Signed-in user, or a 401 response. */
export async function requireUser(): Promise<{ user: User; error?: undefined } | { user?: undefined; error: NextResponse }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { user };
}

export function errorResponse(area: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[voice-chain/${area}] Error:`, message);
  return NextResponse.json({ error: message }, { status: 500 });
}

// ---------------------------------------------------------------------------
// Dates (UTC+7, matching the rest of the app)
// ---------------------------------------------------------------------------

export { todayUtc7 };

/** YYYY-MM-DD `days` days before `day`. */
export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the current UTC+7 week. */
export function weekStartUtc7(): string {
  const today = todayUtc7();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDay(today, (weekday + 6) % 7);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function getNickname(svc: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await svc.from('voice_chain_profiles').select('nickname').eq('user_id', userId).maybeSingle();
  return (data?.nickname as string | undefined) ?? null;
}

export async function nicknamesFor(svc: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const { data } = await svc.from('voice_chain_profiles').select('user_id, nickname').in('user_id', ids);
  return new Map((data ?? []).map(r => [r.user_id as string, r.nickname as string]));
}

/** Short-lived signed URLs keyed by storage path. Purged or expired messages get none. */
export async function signedUrls(svc: SupabaseClient, rows: Pick<MessageRow, 'audio_path' | 'expires_at'>[]): Promise<Map<string, string>> {
  const now = Date.now();
  const paths = rows
    .filter(r => r.audio_path && new Date(r.expires_at).getTime() > now)
    .map(r => r.audio_path as string);
  if (paths.length === 0) return new Map();
  const { data } = await svc.storage.from(BUCKET).createSignedUrls(paths, VOICE_CHAIN.signedUrlSeconds);
  const map = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function getTodayStats(svc: SupabaseClient, userId: string): Promise<DayStats> {
  const day = todayUtc7();
  const { data } = await svc
    .from('voice_chain_daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  return data ? toDayStats(data) : emptyDay(day);
}

export function emptyDay(day: string): DayStats {
  return { day, messagesSent: 0, startersSent: 0, speakingSeconds: 0, totalScore: 0 };
}

export function toDayStats(r: Record<string, unknown>): DayStats {
  return {
    day: r.day as string,
    messagesSent: Number(r.messages_sent) || 0,
    startersSent: Number(r.starters_sent) || 0,
    speakingSeconds: Number(r.speaking_seconds) || 0,
    totalScore: Number(r.total_score) || 0,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Sum of criteria, with the mode bonus and letter-reveal penalty, clamped to 0–100. */
export function computeTotal(scores: ScoreBreakdown, mode: VoiceChainMode | null, letterRevealed: boolean): number {
  const raw = scores.coherence + scores.grammar + scores.wordChoice + scores.fluency + scores.pronunciation;
  const bonus = mode ? VOICE_CHAIN.modes[mode].bonus : 1;
  const total = Math.round(raw * bonus) - (letterRevealed ? VOICE_CHAIN.revealPenalty : 0);
  return Math.max(0, Math.min(CRITERION_MAX * 5, total));
}

// ---------------------------------------------------------------------------
// View mapping
// ---------------------------------------------------------------------------

/** Plays the recipient has left for their claimed message. */
export function playsLeft(row: MessageRow): number {
  const mode = row.claim_mode ?? 'relaxed';
  return Math.max(0, VOICE_CHAIN.modes[mode].plays - (row.claim_plays ?? 0));
}

/**
 * True when the user already picked this message up earlier (they left and came back).
 * A brand-new claim was made moments ago and nothing has happened on it yet.
 */
export function isResumedClaim(row: MessageRow): boolean {
  const ageMs = Date.now() - new Date(row.claimed_at ?? Date.now()).getTime();
  return ageMs > 5000 || (row.claim_plays ?? 0) > 0 || row.claim_letter_attempts > 0
    || row.claim_letter_ok || row.claim_letter_revealed || row.claim_takes > 0;
}

export function claimView(row: MessageRow, senderNickname: string, audioUrl: string | null): ClaimView {
  const letterKnown = row.claim_letter_ok || row.claim_letter_revealed;
  return {
    messageId: row.id,
    senderNickname,
    chainPosition: row.chain_position,
    audioUrl,
    durationSeconds: Number(row.duration_seconds),
    mode: row.claim_mode ?? 'relaxed',
    claimExpiresAt: row.claim_expires_at as string,
    letterOk: row.claim_letter_ok,
    letterRevealed: row.claim_letter_revealed,
    letter: letterKnown ? row.last_letter : null,
    letterAttemptsLeft: Math.max(0, VOICE_CHAIN.letterMissesBeforeReveal - row.claim_letter_attempts),
    takesLeft: Math.max(0, VOICE_CHAIN.maxTakes - row.claim_takes),
    playsLeft: playsLeft(row),
    resumed: isResumedClaim(row),
  };
}

/** Builds the ClaimView for a freshly claimed / resumed row (signs the audio URL). */
export async function buildClaimView(svc: SupabaseClient, row: MessageRow): Promise<ClaimView> {
  const [names, urls] = await Promise.all([nicknamesFor(svc, [row.sender_id]), signedUrls(svc, [row])]);
  return claimView(row, names.get(row.sender_id) ?? 'Someone', row.audio_path ? urls.get(row.audio_path) ?? null : null);
}

export function myMessageView(
  row: MessageRow,
  audioUrl: string | null,
  repliedTo: ReplyPreview | null,
  reply: ReplyPreview | null,
): MyMessage {
  return {
    id: row.id,
    isStarter: row.chain_position === 1,
    chainPosition: row.chain_position,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    audioUrl,
    durationSeconds: Number(row.duration_seconds),
    transcript: row.transcript,
    requiredLetter: row.required_letter,
    lastLetter: row.last_letter,
    mode: row.mode,
    letterRevealed: row.letter_revealed,
    scores: {
      coherence: row.score_coherence,
      grammar: row.score_grammar,
      wordChoice: row.score_word_choice,
      fluency: row.score_fluency,
      pronunciation: row.score_pronunciation,
    },
    total: row.score_total,
    feedback: row.feedback,
    repliedTo,
    reply,
  };
}

// ---------------------------------------------------------------------------
// Claims & retention
// ---------------------------------------------------------------------------

export async function releaseStale(svc: SupabaseClient) {
  const { error } = await svc.rpc('voice_chain_release_stale', { p_grace_seconds: VOICE_CHAIN.claimGraceSeconds });
  if (error) console.error('[voice-chain] release_stale failed:', error.message);
}

/** Gives a claim back to the pool and makes sure this user is never offered it again. */
export async function releaseClaim(svc: SupabaseClient, messageId: string, userId: string, status: 'open' | 'removed' = 'open') {
  await svc.from('voice_chain_skips').upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' });
  const { data, error } = await svc
    .from('voice_chain_messages')
    .update({
      status,
      reported_by: status === 'removed' ? userId : null,
      claimed_by: null, claim_mode: null, claimed_at: null, claim_expires_at: null,
      claim_letter_attempts: 0, claim_letter_ok: false, claim_letter_revealed: false, claim_takes: 0, claim_plays: 0,
    })
    .eq('id', messageId)
    .eq('claimed_by', userId)
    .eq('status', 'claimed')
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Deletes audio and clears transcript/feedback for messages past their 24h
 * lifetime. Rows (time + scores) are kept for stats.
 */
export async function purgeExpired(svc: SupabaseClient, limit = 200): Promise<number> {
  await releaseStale(svc);
  const { data, error } = await svc
    .from('voice_chain_messages')
    .select('id, audio_path')
    .is('purged_at', null)
    .lt('expires_at', new Date().toISOString())
    .order('expires_at')
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return 0;

  const paths = rows.map(r => r.audio_path as string | null).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmError } = await svc.storage.from(BUCKET).remove(paths);
    if (rmError) throw new Error(rmError.message);
  }
  const { error: updError } = await svc
    .from('voice_chain_messages')
    .update({ audio_path: null, transcript: null, feedback: null, purged_at: new Date().toISOString() })
    .in('id', rows.map(r => r.id as string));
  if (updError) throw new Error(updError.message);
  return rows.length;
}
