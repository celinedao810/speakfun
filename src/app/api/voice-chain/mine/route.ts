import { NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import {
  errorResponse, MessageRow, myMessageView, nicknamesFor, requireUser, serviceClient, signedUrls,
} from '@/lib/voiceChain/server';
import type { ReplyPreview } from '@/lib/voiceChain/types';

/**
 * GET /api/voice-chain/mine — the caller's messages from the last 24h, for review
 * (read-only), each with who it answered and who replied (nicknames only).
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const svc = serviceClient();
    const { data, error } = await svc
      .from('voice_chain_messages')
      .select('*')
      .eq('sender_id', auth.user.id)
      .is('purged_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const mine = (data ?? []) as MessageRow[];

    const relatedIds = [
      ...mine.map(m => m.parent_id),
      ...mine.map(m => m.answered_by),
    ].filter((id): id is string => !!id);
    const { data: relatedData } = relatedIds.length
      ? await svc.from('voice_chain_messages').select('id, sender_id, duration_seconds').in('id', relatedIds)
      : { data: [] };
    type Related = Pick<MessageRow, 'id' | 'sender_id' | 'duration_seconds'>;
    const related = new Map(((relatedData ?? []) as Related[]).map(r => [r.id, r]));

    // Only the caller's own recordings get audio URLs; related messages show the nickname only.
    const [urls, names] = await Promise.all([
      signedUrls(svc, mine, VOICE_CHAIN.ownAudioUrlSeconds),
      nicknamesFor(svc, [...related.values()].map(r => r.sender_id)),
    ]);
    const preview = (r: Related | undefined): ReplyPreview | null =>
      r ? { nickname: names.get(r.sender_id) ?? 'Someone', durationSeconds: Number(r.duration_seconds) } : null;

    const messages = mine.map(m =>
      myMessageView(
        m,
        m.audio_path ? urls.get(m.audio_path) ?? null : null,
        preview(m.parent_id ? related.get(m.parent_id) : undefined),
        preview(m.answered_by ? related.get(m.answered_by) : undefined),
      ),
    );
    return NextResponse.json({ messages });
  } catch (err) {
    return errorResponse('mine', err);
  }
}
