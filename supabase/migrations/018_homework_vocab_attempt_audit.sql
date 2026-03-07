-- Migration 018: Persist per-attempt vocab scoring audit data for homework submissions

CREATE TABLE IF NOT EXISTS public.homework_vocab_attempt_audits (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  submission_id TEXT NOT NULL REFERENCES public.daily_homework_submissions(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  window_id TEXT NOT NULL REFERENCES public.daily_homework_windows(id) ON DELETE CASCADE,

  attempt_index INTEGER NOT NULL,
  vocab_item_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  target_word TEXT NOT NULL,
  recognized_word TEXT NOT NULL DEFAULT '',
  is_correct_word BOOLEAN NOT NULL DEFAULT false,
  pronunciation_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  points_earned NUMERIC(8,2) NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',

  timed_mode BOOLEAN NOT NULL DEFAULT false,
  time_taken_ms INTEGER,
  timed_out BOOLEAN NOT NULL DEFAULT false,
  attempt_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(submission_id, attempt_index)
);

ALTER TABLE public.homework_vocab_attempt_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage own vocab attempt audits"
  ON public.homework_vocab_attempt_audits FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

CREATE POLICY "Teachers view vocab attempt audits in own classes"
  ON public.homework_vocab_attempt_audits FOR SELECT
  USING (public.is_class_teacher(class_id));

CREATE INDEX IF NOT EXISTS idx_vocab_audits_submission
  ON public.homework_vocab_attempt_audits(submission_id, attempt_index);
CREATE INDEX IF NOT EXISTS idx_vocab_audits_learner
  ON public.homework_vocab_attempt_audits(learner_id, class_id, window_id);
CREATE INDEX IF NOT EXISTS idx_vocab_audits_window
  ON public.homework_vocab_attempt_audits(window_id);
