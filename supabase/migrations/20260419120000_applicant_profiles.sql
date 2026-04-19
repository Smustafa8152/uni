-- Applicant portal: extended profile (names, ID, contact, photo path) keyed by public.users.id

CREATE TABLE IF NOT EXISTS public.applicant_profiles (
  user_id integer PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  first_name text,
  father_name text,
  grandfather_name text,
  last_name text,
  national_id text,
  date_of_birth date,
  gender text,
  nationality text,
  phone text,
  address text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.applicant_profiles IS 'Pre-enrollment applicant details; one row per users row where role is applicant.';

CREATE INDEX IF NOT EXISTS idx_applicant_profiles_national_id ON public.applicant_profiles (national_id)
  WHERE national_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_applicant_profiles_updated_at ON public.applicant_profiles;
CREATE TRIGGER tr_applicant_profiles_updated_at
  BEFORE UPDATE ON public.applicant_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.applicant_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY applicant_profiles_select_own
  ON public.applicant_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = applicant_profiles.user_id
        AND u."openId" = (SELECT auth.uid()::text)
        AND u.role = 'applicant'
    )
  );

CREATE POLICY applicant_profiles_insert_own
  ON public.applicant_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = applicant_profiles.user_id
        AND u."openId" = (SELECT auth.uid()::text)
        AND u.role = 'applicant'
    )
  );

CREATE POLICY applicant_profiles_update_own
  ON public.applicant_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = applicant_profiles.user_id
        AND u."openId" = (SELECT auth.uid()::text)
        AND u.role = 'applicant'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = applicant_profiles.user_id
        AND u."openId" = (SELECT auth.uid()::text)
        AND u.role = 'applicant'
    )
  );
