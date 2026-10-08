-- Admissions can reject an uploaded document with a reason; the applicant then uploads a new file.

ALTER TABLE public.application_documents
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by bigint REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.application_documents.rejected_at IS 'When admissions rejected this file. Cleared when the applicant uploads a new file or staff verify it.';
COMMENT ON COLUMN public.application_documents.rejected_by IS 'public.users.id of the staff member who rejected this file.';
COMMENT ON COLUMN public.application_documents.rejection_reason IS 'Reason shown to the applicant and sent by email.';
