-- ============================================================================
-- Phase 6: Homework Exercise System
-- ============================================================================

-- 1. lesson_extracted_content: Raw AI extraction output per lesson (teacher-triggered)
-- ============================================================================
CREATE TABLE public.lesson_extracted_content (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  lesson_id TEXT NOT NULL UNIQUE REFERENCES public.lessons(id) ON DELETE CASCADE,
  vocabulary JSONB NOT NULL DEFAULT '[]',   -- VocabItem[]
  structures JSONB NOT NULL DEFAULT '[]',   -- StructureItem[]
  dialogues JSONB NOT NULL DEFAULT '[]',    -- DialogueLine[] (raw, no distractors)
  extraction_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (extraction_status IN ('PENDING', 'EXTRACTING', 'DONE', 'ERROR')),
  error_message TEXT,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lesson_extracted_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage extracted content for own lessons"
  ON public.lesson_extracted_content FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = lesson_extracted_content.lesson_id
        AND c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = lesson_extracted_content.lesson_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Learners view extracted content (authenticated)"
  ON public.lesson_extracted_content FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. lesson_exercises: Generated exercise data per lesson
--    vocab_items include clue text; dialogue_lines include AI distractor options
-- ============================================================================
CREATE TABLE public.lesson_exercises (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  lesson_id TEXT NOT NULL UNIQUE REFERENCES public.lessons(id) ON DELETE CASCADE,
  vocab_items JSONB NOT NULL DEFAULT '[]',      -- VocabExerciseItem[]
  structure_items JSONB NOT NULL DEFAULT '[]',  -- StructureExerciseItem[]
  dialogue_lines JSONB NOT NULL DEFAULT '[]',   -- DialogueLine[] (with distractor arrays)
  generation_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (generation_status IN ('PENDING', 'GENERATING', 'DONE', 'ERROR')),
  error_message TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lesson_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage exercises for own lessons"
  ON public.lesson_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = lesson_exercises.lesson_id
        AND c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = lesson_exercises.lesson_id
        AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Learners view exercises (authenticated)"
  ON public.lesson_exercises FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 3. class_homework_settings: Per-class configurable settings
-- ============================================================================
CREATE TABLE public.class_homework_settings (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  class_id TEXT NOT NULL UNIQUE REFERENCES public.classes(id) ON DELETE CASCADE,
  words_per_session INTEGER NOT NULL DEFAULT 10,
  structures_per_session INTEGER NOT NULL DEFAULT 5,
  correct_guesses_to_commit INTEGER NOT NULL DEFAULT 7,
  review_interval_days INTEGER NOT NULL DEFAULT 7,
  review_word_count INTEGER NOT NULL DEFAULT 15,
  review_structure_count INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.class_homework_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage homework settings for own classes"
  ON public.class_homework_settings FOR ALL
  USING (public.is_class_teacher(class_id))
  WITH CHECK (public.is_class_teacher(class_id));

CREATE POLICY "Learners view homework settings for enrolled classes"
  ON public.class_homework_settings FOR SELECT
  USING (public.is_enrolled_in_class(class_id));

-- 4. daily_homework_windows: One window per (class, calendar date)
--    Opens when exercises are generated; closes at 23:59:59 same day.
--    Subsequent-day windows are lazy-created when learner first accesses homework.
-- ============================================================================
CREATE TABLE public.daily_homework_windows (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  -- session_id of the lesson that "introduced" this window's pool
  -- (NULL for lazy-created carry-forward windows when no new lesson that day)
  triggering_session_id TEXT REFERENCES public.class_sessions(id) ON DELETE SET NULL,
  window_date DATE NOT NULL,
  is_review_session BOOLEAN NOT NULL DEFAULT false,
  -- IDs of all lessons whose exercises are included in this window's pool
  lesson_ids_in_pool TEXT[] NOT NULL DEFAULT '{}',
  max_possible_points NUMERIC(8,2) NOT NULL DEFAULT 0,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,   -- 23:59:59 of window_date
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, window_date)
);

ALTER TABLE public.daily_homework_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage homework windows for own classes"
  ON public.daily_homework_windows FOR ALL
  USING (public.is_class_teacher(class_id))
  WITH CHECK (public.is_class_teacher(class_id));

CREATE POLICY "Learners view homework windows for enrolled classes"
  ON public.daily_homework_windows FOR SELECT
  USING (public.is_enrolled_in_class(class_id));

-- Allow learner-side lazy window creation (server API uses service role, but add this for safety)
CREATE POLICY "Authenticated can insert windows"
  ON public.daily_homework_windows FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. learner_vocab_mastery: Per-word spaced repetition tracking per learner per class
-- ============================================================================
CREATE TABLE public.learner_vocab_mastery (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  vocab_item_id TEXT NOT NULL,         -- References VocabExerciseItem.id from JSONB
  lesson_id TEXT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  is_committed BOOLEAN NOT NULL DEFAULT false,   -- true when correct_count >= threshold
  last_seen_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(learner_id, class_id, vocab_item_id)
);

ALTER TABLE public.learner_vocab_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage own vocab mastery"
  ON public.learner_vocab_mastery FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

CREATE POLICY "Teachers view vocab mastery in own classes"
  ON public.learner_vocab_mastery FOR SELECT
  USING (public.is_class_teacher(class_id));

-- 6. daily_homework_submissions: One per (learner, homework window)
-- ============================================================================
CREATE TABLE public.daily_homework_submissions (
  id TEXT PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 9),
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_id TEXT NOT NULL REFERENCES public.daily_homework_windows(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  -- Scores per exercise type
  ex1_score NUMERIC(8,2) NOT NULL DEFAULT 0,   -- Vocabulary guessing
  ex2_score NUMERIC(8,2) NOT NULL DEFAULT 0,   -- Sentence structure
  ex3a_score NUMERIC(8,2) NOT NULL DEFAULT 0,  -- Conversation: next line
  ex3b_score NUMERIC(8,2) NOT NULL DEFAULT 0,  -- Conversation: prior line
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Completion tracking
  ex1_completed BOOLEAN NOT NULL DEFAULT false,
  ex2_completed BOOLEAN NOT NULL DEFAULT false,
  ex3_completed BOOLEAN NOT NULL DEFAULT false,
  all_completed BOOLEAN NOT NULL DEFAULT false,
  -- Wrong vocab IDs to carry forward to next day's pool
  wrong_vocab_ids TEXT[] NOT NULL DEFAULT '{}',
  -- Session state JSON for resume support (persisted during active session)
  session_state JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(learner_id, window_id)
);

ALTER TABLE public.daily_homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners manage own homework submissions"
  ON public.daily_homework_submissions FOR ALL
  USING (auth.uid() = learner_id)
  WITH CHECK (auth.uid() = learner_id);

CREATE POLICY "Teachers view submissions in own classes"
  ON public.daily_homework_submissions FOR SELECT
  USING (public.is_class_teacher(class_id));

-- 7. Leaderboard view: computed from existing tables, no extra storage needed
-- ============================================================================
CREATE OR REPLACE VIEW public.class_leaderboard AS
SELECT
  ce.class_id,
  ce.learner_id,
  p.full_name AS learner_name,
  COUNT(DISTINCT CASE WHEN cs.status = 'COMPLETED' THEN cs.id END) AS sessions_attended,
  COUNT(DISTINCT CASE WHEN dhs.all_completed = true THEN dhs.id END) AS homework_completed,
  COALESCE(SUM(dhs.total_score), 0) AS total_points,
  COUNT(DISTINCT dhs.id) AS total_submissions
FROM public.class_enrollments ce
JOIN public.profiles p ON p.id = ce.learner_id
LEFT JOIN public.class_sessions cs ON cs.class_id = ce.class_id
LEFT JOIN public.daily_homework_windows dhw ON dhw.class_id = ce.class_id
LEFT JOIN public.daily_homework_submissions dhs
  ON dhs.window_id = dhw.id AND dhs.learner_id = ce.learner_id
GROUP BY ce.class_id, ce.learner_id, p.full_name;

-- 8. Indexes for performance
-- ============================================================================
CREATE INDEX idx_lesson_extracted_lesson ON public.lesson_extracted_content(lesson_id);
CREATE INDEX idx_lesson_exercises_lesson ON public.lesson_exercises(lesson_id);
CREATE INDEX idx_hw_windows_class_date ON public.daily_homework_windows(class_id, window_date);
CREATE INDEX idx_hw_windows_session ON public.daily_homework_windows(triggering_session_id);
CREATE INDEX idx_vocab_mastery_learner_class ON public.learner_vocab_mastery(learner_id, class_id);
CREATE INDEX idx_hw_submissions_learner ON public.daily_homework_submissions(learner_id, window_id);
CREATE INDEX idx_hw_submissions_class ON public.daily_homework_submissions(class_id);
CREATE INDEX idx_hw_submissions_window ON public.daily_homework_submissions(window_id);

-- 9. updated_at triggers (reuse existing update_updated_at() function from migration 001)
-- ============================================================================
CREATE TRIGGER update_lesson_extracted_content_updated_at
  BEFORE UPDATE ON public.lesson_extracted_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_lesson_exercises_updated_at
  BEFORE UPDATE ON public.lesson_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_class_homework_settings_updated_at
  BEFORE UPDATE ON public.class_homework_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_learner_vocab_mastery_updated_at
  BEFORE UPDATE ON public.learner_vocab_mastery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_daily_homework_submissions_updated_at
  BEFORE UPDATE ON public.daily_homework_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
