-- Application messaging + interview/exam invite fields for admissions communication MVP

-- 1) Interview / entrance exam invite details on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS interview_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_timezone text,
  ADD COLUMN IF NOT EXISTS interview_meeting_url text,
  ADD COLUMN IF NOT EXISTS interview_instructions text,
  ADD COLUMN IF NOT EXISTS exam_at timestamptz,
  ADD COLUMN IF NOT EXISTS exam_timezone text,
  ADD COLUMN IF NOT EXISTS exam_location_or_link text,
  ADD COLUMN IF NOT EXISTS exam_instructions text;

COMMENT ON COLUMN public.applications.interview_at IS 'Scheduled online/in-person interview datetime (UTC stored).';
COMMENT ON COLUMN public.applications.interview_meeting_url IS 'Meeting URL for remote interviews.';
COMMENT ON COLUMN public.applications.exam_at IS 'Scheduled entrance exam datetime (UTC stored).';
COMMENT ON COLUMN public.applications.exam_location_or_link IS 'Exam venue or online link.';

-- 2) Staff ↔ applicant message thread per application
CREATE TABLE IF NOT EXISTS public.application_messages (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('staff', 'applicant')),
  body text NOT NULL,
  template_key text,
  created_by bigint REFERENCES public.users(id),
  created_by_auth uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_messages_application_id
  ON public.application_messages(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_messages_unread_staff
  ON public.application_messages(application_id)
  WHERE read_at IS NULL AND sender_role = 'applicant';

COMMENT ON TABLE public.application_messages IS 'Direct messages between admissions staff and applicants for an application.';

ALTER TABLE public.application_messages ENABLE ROW LEVEL SECURITY;

-- Staff (admin + role "user" = college/admissions staff; DB enum has no "college") can read all messages
DROP POLICY IF EXISTS "application_messages_select_staff" ON public.application_messages;
CREATE POLICY "application_messages_select_staff"
  ON public.application_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role IN ('admin', 'user')
    )
  );

DROP POLICY IF EXISTS "application_messages_insert_staff" ON public.application_messages;
CREATE POLICY "application_messages_insert_staff"
  ON public.application_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role IN ('admin', 'user')
    )
  );

DROP POLICY IF EXISTS "application_messages_update_staff" ON public.application_messages;
CREATE POLICY "application_messages_update_staff"
  ON public.application_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role IN ('admin', 'user')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role IN ('admin', 'user')
    )
  );

-- Applicants can read/insert on their own applications
DROP POLICY IF EXISTS "application_messages_select_applicant" ON public.application_messages;
CREATE POLICY "application_messages_select_applicant"
  ON public.application_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_messages.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS "application_messages_insert_applicant" ON public.application_messages;
CREATE POLICY "application_messages_insert_applicant"
  ON public.application_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_role = 'applicant'
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_messages.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS "application_messages_update_applicant" ON public.application_messages;
CREATE POLICY "application_messages_update_applicant"
  ON public.application_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_messages.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_messages.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

-- Allow staff to update interview/exam columns (applications already have staff update policies in older migrations)
