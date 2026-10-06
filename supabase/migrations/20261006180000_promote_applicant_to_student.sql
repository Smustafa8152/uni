-- Promote an applicant login to student without changing the password.
-- Staff only. One email stays one student account.

CREATE OR REPLACE FUNCTION public.promote_applicant_to_student(
  p_email text,
  p_college_id bigint DEFAULT NULL,
  p_applicant_auth_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_user_id int;
  target_role text;
  student_row_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'not_authenticated');
  END IF;

  SELECT role INTO caller_role
  FROM public.users
  WHERE "openId" = auth.uid()::text
  LIMIT 1;

  IF caller_role IS NULL OR caller_role NOT IN ('admin', 'user') THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'forbidden');
  END IF;

  IF p_applicant_auth_id IS NOT NULL AND btrim(p_applicant_auth_id) <> '' THEN
    SELECT id, role INTO target_user_id, target_role
    FROM public.users
    WHERE "openId" = btrim(p_applicant_auth_id)
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL AND p_email IS NOT NULL AND btrim(p_email) <> '' THEN
    SELECT id, role INTO target_user_id, target_role
    FROM public.users
    WHERE lower(email) = lower(btrim(p_email))
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'no_user');
  END IF;

  IF coalesce(target_role, '') NOT IN ('applicant', 'student') THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'role_not_applicant', 'role', target_role);
  END IF;

  UPDATE public.users
  SET role = 'student',
      college_id = COALESCE(p_college_id, college_id)
  WHERE id = target_user_id
    AND role::text = 'applicant';

  IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
    SELECT id INTO student_row_id
    FROM public.students
    WHERE lower(email) = lower(btrim(p_email))
    LIMIT 1;
  END IF;

  IF student_row_id IS NOT NULL THEN
    UPDATE public.students
    SET user_id = target_user_id
    WHERE id = student_row_id
      AND (user_id IS NULL OR user_id <> target_user_id);
  END IF;

  RETURN jsonb_build_object(
    'promoted', true,
    'user_id', target_user_id,
    'student_id', student_row_id
  );
END;
$$;

COMMENT ON FUNCTION public.promote_applicant_to_student(text, bigint, text) IS
  'Staff-only. Sets the applicant login to student and links the student row. Does not change the password.';

REVOKE ALL ON FUNCTION public.promote_applicant_to_student(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_applicant_to_student(text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_applicant_to_student(text, bigint, text) TO service_role;
