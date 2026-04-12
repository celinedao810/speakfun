-- Enforce learner-only signups
-- Only allow users to insert profiles with role = 'LEARNER'
-- Existing teacher account is unaffected as it already exists

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Only learners can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'LEARNER');
