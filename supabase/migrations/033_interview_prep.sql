-- ============================================================================
-- Migration 033: Interview prep
-- Interview topics live in lesson_topics like any other topic; their question bank
-- lives in the hub (lesson_hubs.data.interviewBanks). What's new here:
--   1. classes.track: which lesson-hub track a class follows (e.g. "Developer").
--   2. lesson_hub_revisions + put_lesson_hub_key: a hub section is saved atomically
--      and the hub as it was is kept, so a bank change can be undone. The teacher
--      portal ("Add to bank") and Claude (update_hub) both write through it.
--   3. interview_selections: per class × learner × track, the learner's project
--      intake, picked questions and teacher-added questions. Teacher-only in v1.
-- ============================================================================

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS track TEXT;

-- ---------------------------------------------------------------------------
-- Hub revisions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lesson_hub_revisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,   -- the hub as it was BEFORE the write
  source     TEXT NOT NULL CHECK (source IN ('mcp', 'web', 'import')),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_hub_revisions_teacher_idx
  ON public.lesson_hub_revisions (teacher_id, created_at DESC);

ALTER TABLE public.lesson_hub_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teachers_own_hub_revisions" ON public.lesson_hub_revisions FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- Replace one top-level hub key. The caller validates the resulting hub first.
-- Runs as the caller, so from the teacher portal RLS limits it to the teacher's own hub.
CREATE OR REPLACE FUNCTION public.put_lesson_hub_key(
  p_teacher UUID,
  p_key TEXT,
  p_value JSONB,
  p_source TEXT,
  p_note TEXT
) RETURNS JSONB AS $$
DECLARE
  cur JSONB;
  merged JSONB;
BEGIN
  SELECT data INTO cur FROM public.lesson_hubs WHERE teacher_id = p_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hub for this teacher' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lesson_hub_revisions (teacher_id, data, source, note)
    VALUES (p_teacher, cur, p_source, p_note);
  merged := cur || jsonb_build_object(p_key, p_value);
  UPDATE public.lesson_hubs SET data = merged WHERE teacher_id = p_teacher;
  RETURN merged;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Learner selections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.interview_selections (
  teacher_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id          TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  learner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  track             TEXT NOT NULL,
  intake            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {project, roleStack, scale, part, feature}
  intake_updated_at TIMESTAMPTZ,
  intake_changed    BOOLEAN NOT NULL DEFAULT FALSE,       -- intake edited after slots were filled from it
  picks             JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{questionId, slotValues?, pickedAt?, round?, text?}]
  custom            JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id, round, kind, text, framework?, parentId?}]
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, learner_id, track)
);

CREATE INDEX IF NOT EXISTS interview_selections_teacher_idx
  ON public.interview_selections (teacher_id, track);

ALTER TABLE public.interview_selections ENABLE ROW LEVEL SECURITY;
-- Teacher-only: learners don't see the selection screen in v1.
CREATE POLICY "teachers_manage_interview_selections" ON public.interview_selections FOR ALL
  USING (teacher_id = auth.uid() AND public.is_class_teacher(class_id))
  WITH CHECK (teacher_id = auth.uid() AND public.is_class_teacher(class_id));
