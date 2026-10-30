import { NextRequest, NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { errorResponse, MessageRow, requireUser, serviceClient } from '@/lib/voiceChain/server';
import type { LetterResponse } from '@/lib/voiceChain/types';

/**
 * POST /api/voice-chain/letter { messageId, letter } | { messageId, giveUp: true }
 * Listening check before recording: the recipient picks the letter they heard.
 * After VOICE_CHAIN.letterMissesBeforeReveal misses (or giving up) the letter is
 * revealed and the reply loses VOICE_CHAIN.revealPenalty points.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const giveUp = body.giveUp === true;
  const letter = typeof body.letter === 'string' ? body.letter.trim().toLowerCase() : '';
  if (typeof body.messageId !== 'string' || (!giveUp && !/^[a-z]$/.test(letter))) {
    return NextResponse.json({ error: 'messageId and a single letter are required' }, { status: 400 });
  }

  try {
    const svc = serviceClient();
    const { data } = await svc
      .from('voice_chain_messages')
      .select('*')
      .eq('id', body.messageId)
      .eq('claimed_by', auth.user.id)
      .eq('status', 'claimed')
      .maybeSingle();
    const row = data as MessageRow | null;
    if (!row || new Date(row.claim_expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This message is no longer yours to answer' }, { status: 410 });
    }

    const respond = (r: MessageRow, correct: boolean) => {
      const known = r.claim_letter_ok || r.claim_letter_revealed;
      const res: LetterResponse = {
        correct,
        letterOk: r.claim_letter_ok,
        letterRevealed: r.claim_letter_revealed,
        letter: known ? r.last_letter : null,
        attemptsLeft: Math.max(0, VOICE_CHAIN.letterMissesBeforeReveal - r.claim_letter_attempts),
      };
      return NextResponse.json(res);
    };

    if (row.claim_letter_ok || row.claim_letter_revealed) return respond(row, row.claim_letter_ok);

    const correct = !giveUp && letter === row.last_letter;
    const attempts = correct ? row.claim_letter_attempts : row.claim_letter_attempts + 1;
    const update = {
      claim_letter_attempts: attempts,
      claim_letter_ok: correct,
      claim_letter_revealed: !correct && (giveUp || attempts >= VOICE_CHAIN.letterMissesBeforeReveal),
    };
    const { error } = await svc
      .from('voice_chain_messages')
      .update(update)
      .eq('id', row.id)
      .eq('claimed_by', auth.user.id)
      .eq('claim_letter_attempts', row.claim_letter_attempts);
    if (error) throw new Error(error.message);

    return respond({ ...row, ...update }, correct);
  } catch (err) {
    return errorResponse('letter', err);
  }
}
