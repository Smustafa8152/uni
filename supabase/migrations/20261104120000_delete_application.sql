-- Staff can remove an application. Linked documents, messages, and payments
-- cascade. Invoice.application_id is cleared. Student records stay.

CREATE OR REPLACE FUNCTION public.can_manage_application(p_application_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_app public.applications%ROWTYPE;
BEGIN
  IF NOT public.auth_is_application_staff() THEN
    RETURN false;
  END IF;

  SELECT * INTO v_user
  FROM public.users
  WHERE "openId" = auth.uid()::text;

  IF v_user.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF v_app.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_user.role::text = 'admin' OR v_user.college_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_app.college_id IS NOT DISTINCT FROM v_user.college_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_application_delete(p_application_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
BEGIN
  IF NOT public.can_manage_application(p_application_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'id', v_app.id,
    'application_number', v_app.application_number,
    'email', v_app.email,
    'status_code', v_app.status_code,
    'first_name', v_app.first_name,
    'middle_name', v_app.middle_name,
    'last_name', v_app.last_name,
    'first_name_ar', v_app.first_name_ar,
    'middle_name_ar', v_app.middle_name_ar,
    'last_name_ar', v_app.last_name_ar,
    'documents', (SELECT count(*)::int FROM public.application_documents WHERE application_id = p_application_id),
    'messages', (SELECT count(*)::int FROM public.application_messages WHERE application_id = p_application_id),
    'document_requests', (SELECT count(*)::int FROM public.application_document_requests WHERE application_id = p_application_id),
    'applicant_requests', (SELECT count(*)::int FROM public.application_applicant_requests WHERE application_id = p_application_id),
    'application_fee_payments', (SELECT count(*)::int FROM public.application_fee_payments WHERE application_id = p_application_id),
    'registration_fee_payments', (SELECT count(*)::int FROM public.registration_fee_payments WHERE application_id = p_application_id),
    'bank_transfers', (SELECT count(*)::int FROM public.application_bank_transfers WHERE application_id = p_application_id),
    'invoices', (SELECT count(*)::int FROM public.invoices WHERE application_id = p_application_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_application(p_application_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_application(p_application_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.applications WHERE id = p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_application(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_application_delete(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_application(bigint) TO authenticated;
