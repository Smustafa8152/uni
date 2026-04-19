-- Applicant portal: role for pre-enrollment accounts (no students row)
-- Link applications to Supabase Auth user when submitted from the portal

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'role' AND e.enumlabel = 'applicant'
  ) THEN
    ALTER TYPE public.role ADD VALUE 'applicant';
  END IF;
END$$;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS applicant_user_id uuid;

COMMENT ON COLUMN public.applications.applicant_user_id IS 'Supabase auth user id when the application was created from the applicant portal; used with email for access checks.';

CREATE INDEX IF NOT EXISTS idx_applications_applicant_user_id
  ON public.applications (applicant_user_id)
  WHERE applicant_user_id IS NOT NULL;
