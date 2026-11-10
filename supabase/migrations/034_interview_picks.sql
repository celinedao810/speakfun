-- ============================================================================
-- Migration 034: Interview picks, one list per track
-- Replaces 033's per-class, per-learner records. The class being taught shares
-- one list of picked questions per track, kept in the lesson hub (not tied to
-- SpeakFun classes or learner accounts). Every interview session follows it;
-- the teacher clears it when the series ends, ready for the next class.
-- The question bank itself stays in lesson_hubs.data.interviewBanks.
-- ============================================================================

DROP TABLE IF EXISTS public.interview_selections;
ALTER TABLE public.classes DROP COLUMN IF EXISTS track;

CREATE TABLE IF NOT EXISTS public.interview_picks (
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  track      TEXT NOT NULL,
  picks      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{questionId, text?}] bank questions the class picked
  requested  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id, round, text, framework?}] asked for, not in the bank yet
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (teacher_id, track)
);

ALTER TABLE public.interview_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teachers_own_interview_picks" ON public.interview_picks FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
