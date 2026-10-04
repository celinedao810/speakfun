-- ============================================================================
-- Migration 025: E4IT Lesson Hub
-- One hub (course, project, plan template, rules) per teacher, one row per topic,
-- and a revision snapshot on every write so any edit can be undone.
-- Edited from the teacher portal and from Claude through the MCP connector.
-- ============================================================================

CREATE TABLE public.lesson_hubs (
  teacher_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,   -- {course, project, planTemplates, phases, grouping, tracks, soon, rules}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.lesson_topics (
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,    -- e.g. "dev-03"
  track      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  title      TEXT NOT NULL,
  data       JSONB NOT NULL,   -- the full topic object
  version    INT  NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (teacher_id, id)
);

CREATE TABLE public.lesson_topic_revisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL,
  data       JSONB NOT NULL,   -- the topic as it was BEFORE the write
  version    INT  NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('mcp', 'web', 'import')),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX lesson_topic_revisions_topic_idx
  ON public.lesson_topic_revisions (teacher_id, topic_id, created_at DESC);

ALTER TABLE public.lesson_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_topic_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_own_hub" ON public.lesson_hubs FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "teachers_own_topics" ON public.lesson_topics FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "teachers_own_topic_revisions" ON public.lesson_topic_revisions FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

CREATE OR REPLACE FUNCTION update_lesson_hub_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lesson_hubs_updated_at
  BEFORE UPDATE ON public.lesson_hubs
  FOR EACH ROW EXECUTE FUNCTION update_lesson_hub_updated_at();
CREATE TRIGGER set_lesson_topics_updated_at
  BEFORE UPDATE ON public.lesson_topics
  FOR EACH ROW EXECUTE FUNCTION update_lesson_hub_updated_at();

-- Merge top-level keys of p_patch into a topic. Two sessions editing different
-- keys (say dialogue and vocabulary) can't overwrite each other. When
-- p_expected_version is given and doesn't match, nothing is written.
-- The caller validates the merged topic before calling.
CREATE OR REPLACE FUNCTION public.patch_lesson_topic(
  p_teacher UUID,
  p_id TEXT,
  p_patch JSONB,
  p_expected_version INT,
  p_source TEXT,
  p_note TEXT
) RETURNS public.lesson_topics AS $$
DECLARE
  cur public.lesson_topics;
  merged JSONB;
BEGIN
  SELECT * INTO cur FROM public.lesson_topics
    WHERE teacher_id = p_teacher AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Topic % not found', p_id USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_version IS NOT NULL AND cur.version <> p_expected_version THEN
    RAISE EXCEPTION 'Version conflict on %: expected %, current %', p_id, p_expected_version, cur.version
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lesson_topic_revisions (teacher_id, topic_id, data, version, source, note)
    VALUES (p_teacher, p_id, cur.data, cur.version, p_source, p_note);

  merged := cur.data || p_patch;
  UPDATE public.lesson_topics SET
    data = merged,
    track = COALESCE(merged->>'track', cur.track),
    sort_order = COALESCE((merged->>'order')::INT, cur.sort_order),
    title = COALESCE(merged->>'title', cur.title),
    version = cur.version + 1
  WHERE teacher_id = p_teacher AND id = p_id
  RETURNING * INTO cur;
  RETURN cur;
END;
$$ LANGUAGE plpgsql;

-- Insert a topic, or replace it whole (import, restore). The old version is
-- snapshotted first when the topic already exists.
CREATE OR REPLACE FUNCTION public.put_lesson_topic(
  p_teacher UUID,
  p_id TEXT,
  p_data JSONB,
  p_source TEXT,
  p_note TEXT
) RETURNS public.lesson_topics AS $$
DECLARE
  cur public.lesson_topics;
BEGIN
  SELECT * INTO cur FROM public.lesson_topics
    WHERE teacher_id = p_teacher AND id = p_id FOR UPDATE;
  IF FOUND THEN
    INSERT INTO public.lesson_topic_revisions (teacher_id, topic_id, data, version, source, note)
      VALUES (p_teacher, p_id, cur.data, cur.version, p_source, p_note);
    UPDATE public.lesson_topics SET
      data = p_data,
      track = p_data->>'track',
      sort_order = COALESCE((p_data->>'order')::INT, 0),
      title = p_data->>'title',
      version = cur.version + 1
    WHERE teacher_id = p_teacher AND id = p_id
    RETURNING * INTO cur;
  ELSE
    INSERT INTO public.lesson_topics (teacher_id, id, track, sort_order, title, data)
      VALUES (p_teacher, p_id, p_data->>'track', COALESCE((p_data->>'order')::INT, 0), p_data->>'title', p_data)
      RETURNING * INTO cur;
  END IF;
  RETURN cur;
END;
$$ LANGUAGE plpgsql;
