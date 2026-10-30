import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { contentWordCount, lastLetterOf, startsWithLetter } from '@/lib/voiceChain/letters';
import { scoreVoiceMessage } from '@/lib/voiceChain/scoring';
import {
  BUCKET, computeTotal, errorResponse, getNickname, MessageRow, myMessageView, nicknamesFor, releaseClaim,
  requireUser, serviceClient, signedUrls, todayUtc7,
} from '@/lib/voiceChain/server';
import type { RejectReason, SubmitResponse } from '@/lib/voiceChain/types';

export const maxDuration = 60;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac',
};

const REJECT_MESSAGES: Record<RejectReason, string> = {
  wrong_letter: 'Your answer has to start with the right letter.',
  too_short: `Too short — speak for at least ${VOICE_CHAIN.minSeconds} seconds in full sentences.`,
  inappropriate: 'This recording can’t be shared. Please keep messages friendly and don’t share personal contact details.',
  no_last_word: 'We couldn’t hear a clear last word. Please try again.',
};

/**
 * POST /api/voice-chain/submit { audioBase64, mimeType, durationSeconds, parentId? }
 * Without parentId: starts a new chain (daily limit). With parentId: answers the
 * message the caller has picked up. The take is scored first; rejected takes are
 * never stored. Sent messages can't be edited.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const body = await request.json().catch(() => ({}));
  const { audioBase64, parentId } = body as { audioBase64?: unknown; parentId?: unknown };
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].trim() : '';
  const durationSeconds = Math.min(VOICE_CHAIN.maxSeconds, Math.max(0, Number(body.durationSeconds) || 0));

  if (typeof audioBase64 !== 'string' || !audioBase64 || !EXTENSIONS[mimeType]) {
    return NextResponse.json({ error: 'audioBase64 and a supported audio mimeType are required' }, { status: 400 });
  }
  if (audioBase64.length > VOICE_CHAIN.maxAudioBase64Chars) {
    return NextResponse.json({ error: 'Recording is too large' }, { status: 413 });
  }
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json({ error: 'parentId must be a string' }, { status: 400 });
  }

  try {
    const svc = serviceClient();
    if (!(await getNickname(svc, userId))) {
      return NextResponse.json({ error: 'Set a nickname first' }, { status: 403 });
    }

    // ---- Preconditions ------------------------------------------------------
    let parent: MessageRow | null = null;
    if (parentId) {
      const { data } = await svc
        .from('voice_chain_messages')
        .select('*')
        .eq('id', parentId)
        .eq('claimed_by', userId)
        .eq('status', 'claimed')
        .maybeSingle();
      parent = data as MessageRow | null;
      if (!parent || new Date(parent.claim_expires_at as string).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Time’s up — this message is no longer yours to answer' }, { status: 410 });
      }
      if (!parent.claim_letter_ok && !parent.claim_letter_revealed) {
        return NextResponse.json({ error: 'Pick the starting letter first' }, { status: 409 });
      }
      if (parent.claim_takes >= VOICE_CHAIN.maxTakes) {
        return NextResponse.json({ error: 'No more tries left for this message' }, { status: 409 });
      }
    } else {
      const { count } = await svc
        .from('voice_chain_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', userId)
        .eq('day', todayUtc7())
        .eq('chain_position', 1);
      if ((count ?? 0) >= VOICE_CHAIN.startersPerDay) {
        return NextResponse.json(
          { error: `You can start ${VOICE_CHAIN.startersPerDay} new chains a day. Reply to a message instead!` },
          { status: 429 },
        );
      }
    }

    // ---- Reject helper: rejected takes are not stored, but count for replies -----
    const reject = async (reason: RejectReason, transcript: string, heardWord: string | null = null) => {
      let takesLeft: number | null = null;
      if (parent) {
        const takes = parent.claim_takes + 1;
        await svc.from('voice_chain_messages').update({ claim_takes: takes })
          .eq('id', parent.id).eq('claimed_by', userId).eq('status', 'claimed');
        takesLeft = Math.max(0, VOICE_CHAIN.maxTakes - takes);
        if (takesLeft === 0) await releaseClaim(svc, parent.id, userId);
      }
      const res: SubmitResponse = {
        accepted: false,
        reason,
        error: reason === 'wrong_letter' && parent
          ? `Your answer has to start with “${parent.last_letter.toUpperCase()}” — we heard “${heardWord ?? '…'}”.`
          : REJECT_MESSAGES[reason],
        heardWord,
        transcript,
        takesLeft,
      };
      return NextResponse.json(res);
    };

    if (durationSeconds < VOICE_CHAIN.minSeconds) return reject('too_short', '');

    // ---- Score ----------------------------------------------------------------
    const result = await scoreVoiceMessage({
      audioBase64,
      mimeType,
      previousTranscript: parent?.transcript ?? null,
      requiredLetter: parent?.last_letter ?? null,
    });

    if (result.inappropriate) return reject('inappropriate', '');
    if (contentWordCount(result.transcript) < VOICE_CHAIN.minWords) return reject('too_short', result.transcript);
    if (parent) {
      const check = startsWithLetter(result.transcript, parent.last_letter);
      if (!check.ok) return reject('wrong_letter', result.transcript, check.heardWord);
    }
    const lastLetter = lastLetterOf(result.transcript);
    if (!lastLetter) return reject('no_last_word', result.transcript);

    const mode = parent?.claim_mode ?? null;
    const letterRevealed = parent?.claim_letter_revealed ?? false;
    const total = computeTotal(result.scores, mode, letterRevealed);

    // ---- Store ----------------------------------------------------------------
    const id = randomUUID();
    const audioPath = `${userId}/${id}.${EXTENSIONS[mimeType]}`;
    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(audioPath, Buffer.from(audioBase64, 'base64'), { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const fields = {
      id,
      day: todayUtc7(),
      last_letter: lastLetter,
      audio_path: audioPath,
      mime_type: mimeType,
      transcript: result.transcript,
      feedback: result.feedback,
      duration_seconds: Math.round(durationSeconds * 10) / 10,
      score_coherence: result.scores.coherence,
      score_grammar: result.scores.grammar,
      score_word_choice: result.scores.wordChoice,
      score_fluency: result.scores.fluency,
      score_pronunciation: result.scores.pronunciation,
      score_total: total,
    };

    if (parent) {
      const { data: ok, error } = await svc.rpc('voice_chain_submit_reply', {
        p_parent: parent.id,
        p_user: userId,
        p_reply: fields,
        p_grace_seconds: VOICE_CHAIN.claimGraceSeconds,
      });
      if (error || ok !== true) {
        await svc.storage.from(BUCKET).remove([audioPath]);
        if (error) throw new Error(error.message);
        return NextResponse.json({ error: 'Time’s up — this message is no longer yours to answer' }, { status: 410 });
      }
    } else {
      // Replies get sender_id from the RPC's p_user; a starter has to set it here.
      const { error } = await svc
        .from('voice_chain_messages')
        .insert({ ...fields, sender_id: userId, chain_id: id, chain_position: 1 });
      if (error) {
        await svc.storage.from(BUCKET).remove([audioPath]);
        throw new Error(error.message);
      }
    }

    // ---- Respond with the stored message ------------------------------------------
    const { data: saved, error: readError } = await svc.from('voice_chain_messages').select('*').eq('id', id).single();
    if (readError) throw new Error(readError.message);
    const row = saved as MessageRow;
    const urls = await signedUrls(svc, parent ? [row, parent] : [row]);
    const repliedTo = parent
      ? {
          nickname: (await nicknamesFor(svc, [parent.sender_id])).get(parent.sender_id) ?? 'Someone',
          audioUrl: parent.audio_path ? urls.get(parent.audio_path) ?? null : null,
          durationSeconds: Number(parent.duration_seconds),
        }
      : null;
    const res: SubmitResponse = {
      accepted: true,
      message: myMessageView(row, urls.get(audioPath) ?? null, repliedTo, null),
    };
    return NextResponse.json(res);
  } catch (err) {
    return errorResponse('submit', err);
  }
}
