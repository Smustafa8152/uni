-- Ensure sync_user_openid() creates a public.users row if missing.
-- This fixes instructor/applicant sessions where Supabase Auth exists but public.users is not populated,
-- causing RLS policies (that join on users.openId) to fail.

CREATE OR REPLACE FUNCTION public.sync_user_openid()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text;
  auth_name text;
  synced_user_id int;
  inferred_role role;
  inferred_college_id int;
BEGIN
  SELECT email, raw_user_meta_data->>'name'
    INTO auth_email, auth_name
  FROM auth.users
  WHERE id = auth.uid();

  IF auth_email IS NULL OR btrim(auth_email) = '' THEN
    RETURN;
  END IF;

  -- Infer role + college from instructors table if available.
  SELECT 'instructor'::role, i.college_id
    INTO inferred_role, inferred_college_id
  FROM public.instructors i
  WHERE lower(i.email) = lower(auth_email)
    AND i.status = 'active'
  ORDER BY i.id
  LIMIT 1;

  IF inferred_role IS NULL THEN
    inferred_role := 'applicant'::role;
    inferred_college_id := NULL;
  END IF;

  -- 1) Try update existing user row by case-insensitive email match.
  UPDATE public.users
  SET
    "openId" = auth.uid()::text,
    email = lower(auth_email),
    role = COALESCE(role, inferred_role),
    college_id = COALESCE(college_id, inferred_college_id),
    name = COALESCE(name, auth_name),
    "lastSignedIn" = now(),
    "updatedAt" = now()
  WHERE lower(email) = lower(auth_email)
  RETURNING id INTO synced_user_id;

  -- 2) If no row exists, insert one.
  IF synced_user_id IS NULL THEN
    INSERT INTO public.users ("openId", name, email, "loginMethod", role, college_id, "createdAt", "updatedAt", "lastSignedIn")
    VALUES (auth.uid()::text, auth_name, lower(auth_email), 'email', inferred_role, inferred_college_id, now(), now(), now())
    RETURNING id INTO synced_user_id;
  END IF;

  -- Link instructors to this user so instructor RLS paths pass
  IF synced_user_id IS NOT NULL THEN
    UPDATE public.instructors
    SET user_id = synced_user_id
    WHERE lower(email) = lower(auth_email)
      AND (user_id IS NULL OR user_id <> synced_user_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_user_openid() IS
  'Upserts public.users for the current auth.uid (by case-insensitive email), sets openId, infers instructor role/college when possible, and links instructors.user_id.';

GRANT EXECUTE ON FUNCTION public.sync_user_openid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_openid() TO service_role;

