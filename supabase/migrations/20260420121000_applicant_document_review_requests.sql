-- Applicant → Admissions: requests for document resubmission / re-verification with a note

CREATE TABLE IF NOT EXISTS public.application_applicant_requests (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  document_type varchar(50), -- optional: id_photo, transcript, etc.
  request_type text NOT NULL CHECK (request_type IN ('resubmission', 'reverification')),
  note text,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  resolved_at timestamptz,
  resolved_by bigint REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_app_applicant_requests_application_id ON public.application_applicant_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_app_applicant_requests_status ON public.application_applicant_requests(status);
CREATE INDEX IF NOT EXISTS idx_app_applicant_requests_type ON public.application_applicant_requests(request_type);

COMMENT ON TABLE public.application_applicant_requests IS 'Applicant-submitted requests for document resubmission or re-verification, with a note.';

ALTER TABLE public.application_applicant_requests ENABLE ROW LEVEL SECURITY;

-- Applicants can read/insert their own requests (portal only; relies on applications.applicant_user_id)
DROP POLICY IF EXISTS "applicant_requests_select_applicant" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_select_applicant"
  ON public.application_applicant_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_applicant_requests.application_id
        AND a.applicant_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "applicant_requests_insert_applicant" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_insert_applicant"
  ON public.application_applicant_requests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_applicant_requests.application_id
        AND a.applicant_user_id = auth.uid()
    )
  );

-- Staff can read/update requests (admin + instructor, since role enum doesn't include 'college')
DROP POLICY IF EXISTS "applicant_requests_select_staff" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_select_staff"
  ON public.application_applicant_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text AND u.role IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS "applicant_requests_update_staff" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_update_staff"
  ON public.application_applicant_requests FOR UPDATE TO authenticated
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

