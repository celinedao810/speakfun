import { NextResponse } from 'next/server';
import {
  errorResponse, MessageRow, myMessageView, nicknamesFor, requireUser, serviceClient, signedUrls,
} from '@/lib/voiceChain/server';
import type { ReplyPreview } from '@/lib/voiceChain/types';

/**
 * GET /api/voice-chain/mine — the caller's messages from the last 24h, for review
 * (read-only), each with the message it answered and the reply it received.
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
      ? await svc.from('voice_chain_messages').select('*').in('id', relatedIds)
      : { data: [] };
    const related = new Map(((relatedData ?? []) as MessageRow[]).map(r => [r.id, r]));

    const [urls, names] = await Promise.all([
      signedUrls(svc, [...mine, ...related.values()]),
      nicknamesFor(svc, [...related.values()].map(r => r.sender_id)),
    ]);
    const preview = (r: MessageRow | undefined): ReplyPreview | null =>
      r
        ? {
            nickname: names.get(r.sender_id) ?? 'Someone',
            audioUrl: r.audio_path ? urls.get(r.audio_path) ?? null : null,
            durationSeconds: Number(r.duration_seconds),
          }
        : null;

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
