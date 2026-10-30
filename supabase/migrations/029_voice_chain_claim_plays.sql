-- Migration 029: Voice Chain — count message plays on the server
-- The number of times a recipient has played the message they picked up was only
-- tracked in the browser, so leaving and coming back reset it. claim_plays keeps
-- it with the claim; the two functions below are 028's, now also resetting it.

ALTER TABLE public.voice_chain_messages
  ADD COLUMN IF NOT EXISTS claim_plays SMALLINT NOT NULL DEFAULT 0;

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
      claim_letter_attempts = 0, claim_letter_ok = false, claim_letter_revealed = false, claim_takes = 0, claim_plays = 0
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
      claim_letter_attempts = 0, claim_letter_ok = false, claim_letter_revealed = false, claim_takes = 0, claim_plays = 0
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
      claim_takes = 0, claim_plays = 0
  WHERE id = v_id;

  RETURN QUERY SELECT * FROM public.voice_chain_messages WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.voice_chain_release_stale(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_chain_claim_next(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_chain_release_stale(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_chain_claim_next(UUID, TEXT, INTEGER, INTEGER) TO service_role;
