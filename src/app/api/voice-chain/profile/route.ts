import { NextRequest, NextResponse } from 'next/server';
import { VOICE_CHAIN } from '@/lib/voiceChain/config';
import { errorResponse, getNickname, requireUser, serviceClient } from '@/lib/voiceChain/server';

const NICKNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;

/** GET /api/voice-chain/profile — the caller's nickname (null if not set yet). */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ nickname: await getNickname(serviceClient(), auth.user.id) });
  } catch (err) {
    return errorResponse('profile', err);
  }
}

/** PUT /api/voice-chain/profile { nickname } — set or change the anonymous nickname. */
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';
  if (nickname.length < VOICE_CHAIN.nicknameMin || nickname.length > VOICE_CHAIN.nicknameMax) {
    return NextResponse.json(
      { error: `Nickname must be ${VOICE_CHAIN.nicknameMin}–${VOICE_CHAIN.nicknameMax} characters` },
      { status: 400 },
    );
  }
  if (!NICKNAME_RE.test(nickname)) {
    return NextResponse.json({ error: 'Use letters, numbers, spaces, dots, dashes or underscores' }, { status: 400 });
  }

  try {
    const { error } = await serviceClient()
      .from('voice_chain_profiles')
      .upsert({ user_id: auth.user.id, nickname }, { onConflict: 'user_id' });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That nickname is taken' }, { status: 409 });
      throw new Error(error.message);
    }
    return NextResponse.json({ nickname });
  } catch (err) {
    return errorResponse('profile', err);
  }
}
