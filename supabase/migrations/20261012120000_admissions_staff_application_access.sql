-- Admissions staff are role "user" with the admissions menu.
-- Application checks (documents, requests, payment proof) were limited to admin and instructor, so those actions returned 403.

CREATE OR REPLACE FUNCTION public.auth_is_application_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u."openId" = auth.uid()::text
      AND (
        u.role::text IN ('admin', 'instructor')
        OR (
          u.role::text = 'user'
          AND (
            u.menu_permissions IS NULL
            OR jsonb_typeof(u.menu_permissions) <> 'array'
            OR jsonb_array_length(u.menu_permissions) = 0
            OR u.menu_permissions ? 'admissions'
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_is_application_staff() TO authenticated;

DROP POLICY IF EXISTS "Allow staff update application_documents_verified_fields" ON public.application_documents;
CREATE POLICY "Allow staff update application_documents_verified_fields"
  ON public.application_documents FOR UPDATE TO authenticated
  USING (public.auth_is_application_staff())
  WITH CHECK (public.auth_is_application_staff());

DROP POLICY IF EXISTS "app_doc_requests_select_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_select_staff"
  ON public.application_document_requests FOR SELECT TO authenticated
  USING (public.auth_is_application_staff());

DROP POLICY IF EXISTS "app_doc_requests_insert_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_insert_staff"
  ON public.application_document_requests FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_application_staff());

DROP POLICY IF EXISTS "app_doc_requests_update_staff" ON public.application_document_requests;
CREATE POLICY "app_doc_requests_update_staff"
  ON public.application_document_requests FOR UPDATE TO authenticated
  USING (public.auth_is_application_staff())
  WITH CHECK (public.auth_is_application_staff());

DROP POLICY IF EXISTS "applicant_requests_select_staff" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_select_staff"
  ON public.application_applicant_requests FOR SELECT TO authenticated
  USING (public.auth_is_application_staff());

DROP POLICY IF EXISTS "applicant_requests_update_staff" ON public.application_applicant_requests;
CREATE POLICY "applicant_requests_update_staff"
  ON public.application_applicant_requests FOR UPDATE TO authenticated
  USING (public.auth_is_application_staff())
  WITH CHECK (public.auth_is_application_staff());

DROP POLICY IF EXISTS application_bank_transfers_select_staff ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_select_staff
  ON public.application_bank_transfers FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_is_application_staff());

DROP POLICY IF EXISTS application_bank_transfers_update_staff ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_update_staff
  ON public.application_bank_transfers FOR UPDATE TO authenticated
  USING (public.auth_is_admin() OR public.auth_is_application_staff())
  WITH CHECK (public.auth_is_admin() OR public.auth_is_application_staff());

DROP POLICY IF EXISTS application_fee_payments_select_staff ON public.application_fee_payments;
CREATE POLICY application_fee_payments_select_staff
  ON public.application_fee_payments FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_is_application_staff());

DROP POLICY IF EXISTS registration_fee_payments_select_staff ON public.registration_fee_payments;
CREATE POLICY registration_fee_payments_select_staff
  ON public.registration_fee_payments FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_is_application_staff());
