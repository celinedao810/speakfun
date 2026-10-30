-- Migration 028: Voice Chain
-- A standalone spoken word-chain activity. Users record ≤45s audio messages into
-- one global pool; the first person to pick a message up answers it, starting
-- with the last letter of its last word. Every reply becomes the next open message.
--
-- Everything here is new: no existing table, policy or function is changed.
-- All cross-user reads/writes go through /api/voice-chain/* with the service role;
-- RLS only grants users read access to their own rows.
--
-- Retention: audio + transcript + feedback are purged 24h after a message is
-- created (see /api/cron/voice-chain-cleanup). The row itself is kept so daily
-- stats (time spoken, score) survive.

-- 1. Nicknames (real names never leave public.profiles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_chain_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 3 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_chain_nickname_unique
  ON public.voice_chain_profiles (lower(nickname));

DROP TRIGGER IF EXISTS voice_chain_profiles_updated_at ON public.voice_chain_profiles;
CREATE TRIGGER voice_chain_profiles_updated_at
  BEFORE UPDATE ON public.voice_chain_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.voice_chain_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own voice chain profile" ON public.voice_chain_profiles;
CREATE POLICY "Users read own voice chain profile"
  ON public.voice_chain_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Messages
-- ============================================================================
-- status: open → claimed → answered
--                claimed → open      (given up / claim timed out; claimer is added to skips)
--         open → expired             (24h without a valid reply)
--         claimed → removed          (reported by the recipient)
CREATE TABLE IF NOT EXISTS public.voice_chain_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL,
  parent_id UUID REFERENCES public.voice_chain_messages(id) ON DELETE SET NULL,
  chain_position INTEGER NOT NULL DEFAULT 1,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL,                       -- UTC+7 calendar day the message was sent

  required_letter TEXT,                    -- letter this reply had to start with (null for starters)
  last_letter TEXT NOT NULL,               -- letter the next reply must start with
  mode TEXT CHECK (mode IN ('relaxed', 'realtalk')),  -- mode the reply was recorded in (null for starters)
  letter_revealed BOOLEAN NOT NULL DEFAULT false,

  audio_path TEXT,                         -- null once purged
  mime_type TEXT,
  transcript TEXT,                         -- null once purged
  feedback JSONB,                          -- null once purged
  duration_seconds NUMERIC(5,1) NOT NULL,

  score_coherence SMALLINT NOT NULL DEFAULT 0,
  score_grammar SMALLINT NOT NULL DEFAULT 0,
  score_word_choice SMALLINT NOT NULL DEFAULT 0,
  score_fluency SMALLINT NOT NULL DEFAULT 0,
  score_pronunciation SMALLINT NOT NULL DEFAULT 0,
  score_total SMALLINT NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'answered', 'expired', 'removed')),
  answered_by UUID,                        -- id of the reply message

  claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claim_mode TEXT CHECK (claim_mode IN ('relaxed', 'realtalk')),
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  claim_letter_attempts SMALLINT NOT NULL DEFAULT 0,
  claim_letter_ok BOOLEAN NOT NULL DEFAULT false,
  claim_letter_revealed BOOLEAN NOT NULL DEFAULT false,
  claim_takes SMALLINT NOT NULL DEFAULT 0,
  reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_chain_pool ON public.voice_chain_messages (status, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_chain_sender_day ON public.voice_chain_messages (sender_id, day);
CREATE INDEX IF NOT EXISTS idx_voice_chain_day ON public.voice_chain_messages (day);
CREATE INDEX IF NOT EXISTS idx_voice_chain_parent ON public.voice_chain_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_voice_chain_unpurged ON public.voice_chain_messages (expires_at) WHERE purged_at IS NULL;
-- One active claim per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_chain_one_claim
  ON public.voice_chain_messages (claimed_by) WHERE status = 'claimed';

ALTER TABLE public.voice_chain_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own voice chain messages" ON public.voice_chain_messages;
CREATE POLICY "Users read own voice chain messages"
  ON public.voice_chain_messages FOR SELECT
  USING (auth.uid() = sender_id);

-- 3. Skips: messages a user gave up on (or timed out on) are never offered to them again
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_chain_skips (
  message_id UUID NOT NULL REFERENCES public.voice_chain_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.voice_chain_skips ENABLE ROW LEVEL SECURITY;
-- No user policies: service role only.

-- 4. Daily stats (rows are never deleted, so this survives the 24h purge)
-- ============================================================================
CREATE OR REPLACE VIEW public.voice_chain_daily_stats
WITH (security_invoker = true) AS
SELECT
  sender_id AS user_id,
  day,
  COUNT(*)::INTEGER AS messages_sent,
  COUNT(*) FILTER (WHERE parent_id IS NULL)::INTEGER AS starters_sent,
  COALESCE(SUM(duration_seconds), 0)::NUMERIC(8,1) AS speaking_seconds,
  COALESCE(SUM(score_total), 0)::INTEGER AS total_score
FROM public.voice_chain_messages
WHERE status <> 'removed'
GROUP BY sender_id, day;

-- 5. Functions (service role only)
-- ============================================================================

-- Returns timed-out claims to the pool and expires stale open messages.
-- p_grace_seconds must match VOICE_CHAIN.claimGraceSeconds in src/lib/voiceChain/config.ts.
CREATE OR REPLACE FUNCTION public.voice_chain_release_stale(p_grace_seconds INTEGER DEFAULT 120)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.voice_chain_skips (message_id, user_id)
  SELECT id, claimed_by
  FROM public.voice_chain_messages
  WHERE status = 'claimed'
    AND claimed_by IS NOT NULL
    AND claim_expires_at + make_interval(secs => p_grace_seconds) < now()
  ON CONFLICT DO NOTHING;

  UPDATE public.voice_chain_messages
  SET status = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'open' END,
      claimed_by = NULL, claim_mode = NULL, claimed_at = NULL, claim_expires_at = NULL,
      claim_letter_attempts = 0, claim_letter_ok = false, claim_letter_revealed = false, claim_takes = 0
  WHERE status = 'claimed'
    AND claim_expires_at + make_interval(secs => p_grace_seconds) < now();

  UPDATE public.voice_chain_messages
  SET status = 'expired'
  WHERE status = 'open' AND expires_at <= now();
END;
$$;

-- Claims the oldest message the user may answer (first come, first served).
-- Returns the user's existing claim instead if they already hold one.
CREATE OR REPLACE FUNCTION public.voice_chain_claim_next(
  p_user UUID,
  p_mode TEXT,
  p_claim_seconds INTEGER DEFAULT 300,
  p_grace_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.voice_chain_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.voice_chain_release_stale(p_grace_seconds);

  -- Asking for a new message abandons the user's own timed-out claim right away
  -- (the grace period only exists for a take that is still being scored).
  INSERT INTO public.voice_chain_skips (message_id, user_id)
  SELECT id, p_user FROM public.voice_chain_messages
  WHERE claimed_by = p_user AND status = 'claimed' AND claim_expires_at <= now()
  ON CONFLICT DO NOTHING;

  UPDATE public.voice_chain_messages
  SET status = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'open' END,
      claimed_by = NULL, claim_mode = NULL, claimed_at = NULL, claim_expires_at = NULL,
      claim_letter_attempts = 0, claim_letter_ok = false, claim_letter_revealed = false, claim_takes = 0
  WHERE claimed_by = p_user AND status = 'claimed' AND claim_expires_at <= now();

  SELECT id INTO v_id
  FROM public.voice_chain_messages
  WHERE claimed_by = p_user AND status = 'claimed'
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.voice_chain_messages WHERE id = v_id;
    RETURN;
  END IF;

  SELECT m.id INTO v_id
  FROM public.voice_chain_messages m
  WHERE m.status = 'open'
    -- leave enough lifetime to finish answering
    AND m.expires_at > now() + make_interval(secs => p_claim_seconds + p_grace_seconds)
    AND m.sender_id <> p_user
    AND m.audio_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.voice_chain_skips s
      WHERE s.message_id = m.id AND s.user_id = p_user
    )
  ORDER BY m.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.voice_chain_messages
  SET status = 'claimed',
      claimed_by = p_user,
      claim_mode = p_mode,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => p_claim_seconds),
      claim_letter_attempts = 0,
      claim_letter_ok = false,
      claim_letter_revealed = false,
      claim_takes = 0
  WHERE id = v_id;

  RETURN QUERY SELECT * FROM public.voice_chain_messages WHERE id = v_id;
END;
$$;

-- Atomically marks the claimed parent as answered and inserts the reply as a new
-- open message. required_letter, mode and letter_revealed come from the parent's
-- claim, not from the caller. Returns false if the claim is no longer valid.
CREATE OR REPLACE FUNCTION public.voice_chain_submit_reply(
  p_parent UUID,
  p_user UUID,
  p_reply JSONB,
  p_grace_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH parent AS (
    UPDATE public.voice_chain_messages
    SET status = 'answered',
        answered_by = (p_reply->>'id')::UUID
    WHERE id = p_parent
      AND status = 'claimed'
      AND claimed_by = p_user
      AND claim_expires_at + make_interval(secs => p_grace_seconds) > now()
    RETURNING *
  )
  INSERT INTO public.voice_chain_messages (
    id, chain_id, parent_id, chain_position, sender_id, day,
    required_letter, last_letter, mode, letter_revealed,
    audio_path, mime_type, transcript, feedback, duration_seconds,
    score_coherence, score_grammar, score_word_choice, score_fluency, score_pronunciation, score_total
  )
  SELECT
    (p_reply->>'id')::UUID, parent.chain_id, parent.id, parent.chain_position + 1, p_user, (p_reply->>'day')::DATE,
    parent.last_letter, p_reply->>'last_letter', parent.claim_mode, parent.claim_letter_revealed,
    p_reply->>'audio_path', p_reply->>'mime_type', p_reply->>'transcript', p_reply->'feedback', (p_reply->>'duration_seconds')::NUMERIC,
    (p_reply->>'score_coherence')::SMALLINT, (p_reply->>'score_grammar')::SMALLINT, (p_reply->>'score_word_choice')::SMALLINT,
    (p_reply->>'score_fluency')::SMALLINT, (p_reply->>'score_pronunciation')::SMALLINT, (p_reply->>'score_total')::SMALLINT
  FROM parent;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

-- Weekly leaderboard: totals per sender from p_from (inclusive), nicknames only.
CREATE OR REPLACE FUNCTION public.voice_chain_leaderboard(p_from DATE)
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  messages_sent INTEGER,
  speaking_seconds NUMERIC,
  total_score INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.sender_id,
    vp.nickname,
    COUNT(*)::INTEGER,
    COALESCE(SUM(m.duration_seconds), 0)::NUMERIC,
    COALESCE(SUM(m.score_total), 0)::INTEGER
  FROM public.voice_chain_messages m
  JOIN public.voice_chain_profiles vp ON vp.user_id = m.sender_id
  WHERE m.day >= p_from AND m.status <> 'removed'
  GROUP BY m.sender_id, vp.nickname
  ORDER BY 5 DESC, 4 DESC;
$$;

REVOKE ALL ON FUNCTION public.voice_chain_release_stale(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_chain_claim_next(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_chain_submit_reply(UUID, UUID, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_chain_leaderboard(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_chain_release_stale(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_chain_claim_next(UUID, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_chain_submit_reply(UUID, UUID, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_chain_leaderboard(DATE) TO service_role;

-- 6. Storage: private bucket, service role only (clients get short-lived signed URLs)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-chain', 'voice-chain', false, 5242880,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']
)
ON CONFLICT (id) DO NOTHING;
