-- Allow enrolled students to read applications linked to their email (for Messages in student portal)
-- and use existing application_messages applicant policies (email / applicant_user_id match).

DROP POLICY IF EXISTS "applications_select_own_email_student" ON public.applications;
CREATE POLICY "applications_select_own_email_student"
  ON public.applications FOR SELECT TO authenticated
  USING (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR applicant_user_id = auth.uid()
  );
