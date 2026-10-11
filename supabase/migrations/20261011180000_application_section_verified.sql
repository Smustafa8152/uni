-- Staff can mark each applicant information card verified.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS section_verified jsonb NOT NULL DEFAULT '{}'::jsonb;
