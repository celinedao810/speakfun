-- Migration 030: Voice Chain — 5-point scores
-- Each message is now scored out of 5: five criteria worth 0, 0.5 or 1 each,
-- +0.5 for Real talk and −0.5 when the letter was revealed (total kept within 0–5).
-- Score columns become NUMERIC(3,1) and existing scores are converted from the
-- old 0–20 / 0–100 scale to the nearest half point, so stats, the leaderboard and
-- badges stay consistent. Safe to run more than once (conversion only happens
-- while the columns are still SMALLINT).

-- 1. The stats view depends on score_total, so drop it while the type changes
DROP VIEW IF EXISTS public.voice_chain_daily_stats;

-- 2. Convert the score columns (once)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'voice_chain_messages' AND column_name = 'score_total') = 'smallint' THEN
    ALTER TABLE public.voice_chain_messages
      ALTER COLUMN score_coherence     DROP DEFAULT,
      ALTER COLUMN score_grammar       DROP DEFAULT,
      ALTER COLUMN score_word_choice   DROP DEFAULT,
      ALTER COLUMN score_fluency       DROP DEFAULT,
      ALTER COLUMN score_pronunciation DROP DEFAULT,
      ALTER COLUMN score_total         DROP DEFAULT;
    ALTER TABLE public.voice_chain_messages
      ALTER COLUMN score_coherence     TYPE NUMERIC(3,1) USING round(score_coherence / 20.0 * 2) / 2,
      ALTER COLUMN score_grammar       TYPE NUMERIC(3,1) USING round(score_grammar / 20.0 * 2) / 2,
      ALTER COLUMN score_word_choice   TYPE NUMERIC(3,1) USING round(score_word_choice / 20.0 * 2) / 2,
      ALTER COLUMN score_fluency       TYPE NUMERIC(3,1) USING round(score_fluency / 20.0 * 2) / 2,
      ALTER COLUMN score_pronunciation TYPE NUMERIC(3,1) USING round(score_pronunciation / 20.0 * 2) / 2,
      ALTER COLUMN score_total         TYPE NUMERIC(3,1) USING round(score_total / 20.0 * 2) / 2;
    ALTER TABLE public.voice_chain_messages
      ALTER COLUMN score_coherence     SET DEFAULT 0,
      ALTER COLUMN score_grammar       SET DEFAULT 0,
      ALTER COLUMN score_word_choice   SET DEFAULT 0,
      ALTER COLUMN score_fluency       SET DEFAULT 0,
      ALTER COLUMN score_pronunciation SET DEFAULT 0,
      ALTER COLUMN score_total         SET DEFAULT 0;
  END IF;
END $$;

-- 3. Daily stats with decimal points
CREATE VIEW public.voice_chain_daily_stats
WITH (security_invoker = true) AS
SELECT
  sender_id AS user_id,
  day,
  COUNT(*)::INTEGER AS messages_sent,
  COUNT(*) FILTER (WHERE chain_position = 1)::INTEGER AS starters_sent,
  COALESCE(SUM(duration_seconds), 0)::NUMERIC(8,1) AS speaking_seconds,
  COALESCE(SUM(score_total), 0)::NUMERIC(8,1) AS total_score
FROM public.voice_chain_messages
WHERE status <> 'removed'
GROUP BY sender_id, day;

-- 4. Weekly leaderboard returns decimal totals (return type change needs a drop)
DROP FUNCTION IF EXISTS public.voice_chain_leaderboard(DATE);
CREATE FUNCTION public.voice_chain_leaderboard(p_from DATE)
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  messages_sent INTEGER,
  speaking_seconds NUMERIC,
  total_score NUMERIC
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
    COALESCE(SUM(m.score_total), 0)::NUMERIC
  FROM public.voice_chain_messages m
  JOIN public.voice_chain_profiles vp ON vp.user_id = m.sender_id
  WHERE m.day >= p_from AND m.status <> 'removed'
  GROUP BY m.sender_id, vp.nickname
  ORDER BY 5 DESC, 4 DESC;
$$;

-- 5. Reply insert: scores are half points now (was ::SMALLINT)
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
    (p_reply->>'score_coherence')::NUMERIC, (p_reply->>'score_grammar')::NUMERIC, (p_reply->>'score_word_choice')::NUMERIC,
    (p_reply->>'score_fluency')::NUMERIC, (p_reply->>'score_pronunciation')::NUMERIC, (p_reply->>'score_total')::NUMERIC
  FROM parent;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.voice_chain_leaderboard(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_chain_submit_reply(UUID, UUID, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_chain_leaderboard(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_chain_submit_reply(UUID, UUID, JSONB, INTEGER) TO service_role;
