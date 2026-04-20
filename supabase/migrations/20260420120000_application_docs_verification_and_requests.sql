-- Admin document verification + applicant document requests (admissions workflow)

-- 1) Add verification columns to application_documents
ALTER TABLE public.application_documents
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by bigint REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS verification_notes text;

COMMENT ON COLUMN public.application_documents.verified_at IS 'When admissions staff verified this document.';
COMMENT ON COLUMN public.application_documents.verified_by IS 'public.users.id of the staff member who verified this document.';
COMMENT ON COLUMN public.application_documents.verification_notes IS 'Optional notes about verification (missing pages, unclear scan, etc.).';

-- 2) Requests for additional documents/info (free text)
CREATE TABLE IF NOT EXISTS public.application_document_requests (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requested_by bigint REFERENCES public.users(id),
  message text NOT NULL,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  status text DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_app_doc_requests_application_id ON public.application_document_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_app_doc_requests_status ON public.application_document_requests(status);

COMMENT ON TABLE public.application_document_requests IS 'Admissions requests for additional documents/info from applicants.';

-- 3) RLS policies
ALTER TABLE public.application_document_requests ENABLE ROW LEVEL SECURITY;

-- Applicants can read requests for their own applications (portal only; relies on applicant_user_id)
DROP POLICY IF EXISTS "app_doc_requests_select_applicant" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_select_applicant"
  ON public.application_document_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_document_requests.application_id
        AND a.applicant_user_id = auth.uid()
    )
  );

-- Staff can read/insert/update requests (admin, college)
DROP POLICY IF EXISTS "app_doc_requests_select_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_select_staff"
  ON public.application_document_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "app_doc_requests_insert_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_insert_staff"
  ON public.application_document_requests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "app_doc_requests_update_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_update_staff"
  ON public.application_document_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  );

-- 4) Tighten application_documents update policy:
-- Allow anon/authenticated to update ONLY when the row is still unverified and they keep verification columns NULL.
-- Allow staff to update verification columns.
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public update application_documents" ON public.application_documents;
DROP POLICY IF EXISTS "Allow anon update application_documents" ON public.application_documents;
DROP POLICY IF EXISTS "Allow authenticated update application_documents" ON public.application_documents;

CREATE POLICY "Allow anon update application_documents_unverified"
  ON public.application_documents FOR UPDATE TO anon
  USING (verified_at IS NULL AND verified_by IS NULL)
  WITH CHECK (verified_at IS NULL AND verified_by IS NULL);

CREATE POLICY "Allow authenticated update application_documents_unverified"
  ON public.application_documents FOR UPDATE TO authenticated
  USING (verified_at IS NULL AND verified_by IS NULL)
  WITH CHECK (verified_at IS NULL AND verified_by IS NULL);

CREATE POLICY "Allow staff update application_documents_verified_fields"
  ON public.application_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  );

