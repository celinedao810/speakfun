-- Phase 2: Learner data tables (localStorage → Supabase migration)
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ============================================================
-- 1. ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id              TEXT PRIMARY KEY,
  learner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound           JSONB NOT NULL,
  exercise_type   TEXT NOT NULL CHECK (exercise_type IN ('PHONETIC_DAY', 'ENDING_SOUNDS', 'LINKING_SOUNDS')),
  duration_days   INTEGER NOT NULL DEFAULT 1,
  start_date      TIMESTAMPTZ NOT NULL,
  current_day     INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAILED')),
  last_activity   TIMESTAMPTZ,
  lock_until      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_learner ON public.assignments(learner_id);

-- ============================================================
-- 2. ASSIGNMENT_RECORDS (child of assignments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignment_records (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  assignment_id   TEXT NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  date            TIMESTAMPTZ NOT NULL,
  score           INTEGER NOT NULL,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  exercise_scores JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, day_number)
);

CREATE INDEX idx_records_assignment ON public.assignment_records(assignment_id);

-- ============================================================
-- 3. ACHIEVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id              TEXT PRIMARY KEY,
  learner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound_symbol    TEXT NOT NULL,
  date_earned     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, sound_symbol)
);

CREATE INDEX idx_achievements_learner ON public.achievements(learner_id);

-- ============================================================
-- 4. INTERVIEW_QA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.interview_qa (
  id                TEXT PRIMARY KEY,
  learner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  personal_details  TEXT NOT NULL DEFAULT '',
  polished_answer   TEXT NOT NULL DEFAULT '',
  industry          TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT '',
  seniority         TEXT NOT NULL DEFAULT '',
  date_saved        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interview_qa_learner ON public.interview_qa(learner_id);

-- ============================================================
-- 5. INTERVIEW_SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id              TEXT PRIMARY KEY,
  learner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_name    TEXT,
  role            TEXT NOT NULL DEFAULT '',
  industry        TEXT NOT NULL DEFAULT '',
  seniority       TEXT NOT NULL DEFAULT '',
  cv_text         TEXT,
  jd_text         TEXT,
  mode            TEXT NOT NULL CHECK (mode IN ('STANDARD', 'TAILORED')),
  questions       JSONB NOT NULL DEFAULT '[]',
  date_created    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interview_sessions_learner ON public.interview_sessions(learner_id);

-- ============================================================
-- 6. DRILL_SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.drill_sessions (
  id                TEXT PRIMARY KEY,
  learner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_date      TIMESTAMPTZ NOT NULL,
  attempts          JSONB NOT NULL DEFAULT '[]',
  average_score     REAL NOT NULL DEFAULT 0,
  general_feedback  TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drill_sessions_learner ON public.drill_sessions(learner_id);

-- ============================================================
-- 7. LIVE_INTERVIEW_SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_interview_sessions (
  id                TEXT PRIMARY KEY,
  learner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  qa_ids            TEXT[] NOT NULL DEFAULT '{}',
  turns             JSONB NOT NULL DEFAULT '[]',
  overall_feedback  TEXT,
  average_score     REAL,
  role              TEXT NOT NULL DEFAULT '',
  industry          TEXT NOT NULL DEFAULT '',
  session_date      TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_live_sessions_learner ON public.live_interview_sessions(learner_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_qa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_interview_sessions ENABLE ROW LEVEL SECURITY;

-- Assignments
CREATE POLICY "Users manage own assignments"
  ON public.assignments FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Assignment records (ownership via parent assignment)
CREATE POLICY "Users manage own records"
  ON public.assignment_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_records.assignment_id
      AND a.learner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_records.assignment_id
      AND a.learner_id = auth.uid()
    )
  );

-- Achievements
CREATE POLICY "Users manage own achievements"
  ON public.achievements FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Interview QA
CREATE POLICY "Users manage own interview_qa"
  ON public.interview_qa FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Interview Sessions
CREATE POLICY "Users manage own interview_sessions"
  ON public.interview_sessions FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Drill Sessions
CREATE POLICY "Users manage own drill_sessions"
  ON public.drill_sessions FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

-- Live Interview Sessions
CREATE POLICY "Users manage own live_sessions"
  ON public.live_interview_sessions FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);
