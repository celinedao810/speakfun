-- Migration 028: mark items already past their class's current threshold as mastered.
-- is_committed is only recomputed when an item is practised, so after 026 lowered the
-- structure threshold to 5, rows with 5-9 correct stayed "still learning".
UPDATE public.learner_structure_mastery m
  SET is_committed = true, committed_at = now()
  FROM public.class_homework_settings s
  WHERE m.class_id = s.class_id
    AND NOT m.is_committed
    AND m.correct_count >= s.structure_guesses_to_commit;

UPDATE public.learner_vocab_mastery m
  SET is_committed = true, committed_at = now()
  FROM public.class_homework_settings s
  WHERE m.class_id = s.class_id
    AND NOT m.is_committed
    AND m.correct_count >= s.correct_guesses_to_commit;
