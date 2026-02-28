-- RPC function for learners to join a class by code
-- Uses SECURITY DEFINER to bypass RLS (learner can't SELECT classes before enrolling)
CREATE OR REPLACE FUNCTION public.join_class_by_code(p_class_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_class_id TEXT;
  v_class_name TEXT;
  v_enrollment_id TEXT;
  v_learner_id UUID := auth.uid();
BEGIN
  -- Look up class by code (bypasses RLS)
  SELECT id, name INTO v_class_id, v_class_name
  FROM public.classes
  WHERE class_code = upper(p_class_code);

  IF v_class_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid class code');
  END IF;

  -- Check if already enrolled
  IF EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = v_class_id AND learner_id = v_learner_id
  ) THEN
    RETURN json_build_object('error', 'You are already enrolled in this class');
  END IF;

  -- Insert enrollment
  INSERT INTO public.class_enrollments (class_id, learner_id)
  VALUES (v_class_id, v_learner_id)
  RETURNING id INTO v_enrollment_id;

  RETURN json_build_object(
    'data', json_build_object(
      'enrollment_id', v_enrollment_id,
      'class_id', v_class_id,
      'class_name', v_class_name
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
