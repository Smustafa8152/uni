-- Programme fees: two ways to bill, scholarships decided by staff, and one place that works out what a student owes.
--
-- 1. Billing mode per programme
--      installment   – the programme total split into equal instalments (masters, PhD).
--      credit_hours  – each semester: credit hours the student is registered for × the hour rate,
--                      plus that semester's share of the fixed fees (bachelor).
-- 2. Scholarships: the applicant asks, staff decide. Only an approved scholarship reduces a bill,
--    and only the tuition part (items marked is_tuition). Admission, services, library and documents stay full.
-- 3. student_fee_due(): the single calculation used by the student portal, the card payment function
--    and finance. The browser never decides an amount.
-- 4. Finance can record a cash or bank payment, and cancel one recorded by mistake.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Plans and items
-- ---------------------------------------------------------------------------
ALTER TABLE public.program_fee_plans
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'installment',
  ADD COLUMN IF NOT EXISTS credit_hour_rate numeric(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_fee_plans_billing_mode_check') THEN
    ALTER TABLE public.program_fee_plans
      ADD CONSTRAINT program_fee_plans_billing_mode_check CHECK (billing_mode IN ('installment', 'credit_hours'));
  END IF;
END $$;

ALTER TABLE public.program_fee_items
  ADD COLUMN IF NOT EXISTS is_tuition boolean NOT NULL DEFAULT false;

-- Tuition lines from the fee sheet: courses, thesis, supplementary research, tuition.
UPDATE public.program_fee_items
SET is_tuition = true
WHERE is_tuition = false
  AND (name_en ILIKE 'Tuition%' OR name_en ILIKE 'Courses%' OR name_en ILIKE 'Thesis%' OR name_en ILIKE 'Supplementary research%');

-- Bachelor programmes bill by credit hours, at the sheet's hour rate (still in the sheet's currency;
-- the fees screen converts plans to dalasi together with their items).
UPDATE public.program_fee_plans p
SET billing_mode = 'credit_hours',
    credit_hour_rate = CASE trim(m.code) WHEN '0141' THEN 25 WHEN '0411' THEN 32 ELSE 30 END
FROM public.majors m
WHERE m.id = p.major_id
  AND m.degree_level::text = 'bachelor'
  AND p.credit_hour_rate IS NULL
  AND p.currency = 'USD';

-- ---------------------------------------------------------------------------
-- 2. Payments: how it was paid, who recorded it, what it was made of
-- ---------------------------------------------------------------------------
ALTER TABLE public.program_fee_payments
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS breakdown jsonb,
  ADD COLUMN IF NOT EXISTS recorded_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

ALTER TABLE public.program_fee_payments DROP CONSTRAINT IF EXISTS program_fee_payments_status_check;
ALTER TABLE public.program_fee_payments
  ADD CONSTRAINT program_fee_payments_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_fee_payments_method_check') THEN
    ALTER TABLE public.program_fee_payments
      ADD CONSTRAINT program_fee_payments_method_check CHECK (method IN ('card', 'cash', 'bank_transfer'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Scholarship decisions
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS scholarship_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS scholarship_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS scholarship_decided_by uuid;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS scholarship_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS scholarship_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS scholarship_decided_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_scholarship_status_check') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_scholarship_status_check
      CHECK (scholarship_status IN ('none', 'requested', 'approved', 'declined'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_scholarship_status_check') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_scholarship_status_check
      CHECK (scholarship_status IN ('none', 'requested', 'approved', 'declined'));
  END IF;
END $$;

-- Until now a request was copied to the student as if it were granted. Every one of them is a request
-- waiting for a decision; nothing is approved automatically.
UPDATE public.applications SET scholarship_status = 'requested'
WHERE scholarship_request IS TRUE AND scholarship_status = 'none';
UPDATE public.students SET scholarship_status = 'requested', has_scholarship = false
WHERE has_scholarship IS TRUE AND scholarship_status = 'none';

-- Only staff can decide. Anyone else keeps the decision as it was; a new request starts as "requested".
CREATE OR REPLACE FUNCTION public.guard_scholarship_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Direct database sessions (SQL editor, migrations) are trusted; API calls arrive as "authenticator".
  is_staff boolean := session_user <> 'authenticator' OR auth.role() = 'service_role' OR coalesce(public.auth_is_finance_staff(), false);
  wants boolean;
BEGIN
  IF TG_TABLE_NAME = 'applications' THEN
    wants := coalesce(NEW.scholarship_request, false);
  ELSE
    wants := coalesce(NEW.has_scholarship, false);
  END IF;

  IF is_staff THEN
    -- Staff decide with 'approved' / 'declined'; while undecided the status follows the request.
    IF NEW.scholarship_status IN ('none', 'requested') THEN
      NEW.scholarship_status := CASE WHEN wants THEN 'requested' ELSE 'none' END;
    ELSIF TG_OP = 'INSERT' OR NEW.scholarship_status IS DISTINCT FROM OLD.scholarship_status
       OR NEW.scholarship_percentage IS DISTINCT FROM OLD.scholarship_percentage THEN
      NEW.scholarship_decided_at := now();
      NEW.scholarship_decided_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.scholarship_status := CASE WHEN wants THEN 'requested' ELSE 'none' END;
    NEW.scholarship_decided_at := NULL;
    NEW.scholarship_decided_by := NULL;
    RETURN NEW;
  END IF;

  NEW.scholarship_decided_at := OLD.scholarship_decided_at;
  NEW.scholarship_decided_by := OLD.scholarship_decided_by;
  IF TG_TABLE_NAME = 'students' THEN
    -- On a student record has_scholarship means "granted"; only staff change it.
    NEW.has_scholarship := OLD.has_scholarship;
    wants := OLD.scholarship_status = 'requested';
  END IF;
  IF OLD.scholarship_status IN ('approved', 'declined') THEN
    NEW.scholarship_status := OLD.scholarship_status;
    NEW.scholarship_percentage := OLD.scholarship_percentage;
  ELSE
    NEW.scholarship_status := CASE WHEN wants THEN 'requested' ELSE 'none' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_guard_scholarship ON public.applications;
CREATE TRIGGER trg_applications_guard_scholarship
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_scholarship_decision();

DROP TRIGGER IF EXISTS trg_students_guard_scholarship ON public.students;
CREATE TRIGGER trg_students_guard_scholarship
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.guard_scholarship_decision();

-- A decision follows the person: decided on the application, it reaches the student (now or when the
-- student record is created later); decided on the student, it is written back to the application.
CREATE OR REPLACE FUNCTION public.sync_scholarship_application_to_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scholarship_status IN ('approved', 'declined')
     AND (NEW.scholarship_status IS DISTINCT FROM OLD.scholarship_status
          OR NEW.scholarship_percentage IS DISTINCT FROM OLD.scholarship_percentage)
     AND NEW.email IS NOT NULL THEN
    UPDATE public.students s
    SET scholarship_status = NEW.scholarship_status,
        scholarship_percentage = CASE WHEN NEW.scholarship_status = 'approved' THEN NEW.scholarship_percentage ELSE NULL END,
        has_scholarship = NEW.scholarship_status = 'approved',
        scholarship_type = coalesce(NEW.scholarship_type, s.scholarship_type),
        scholarship_decided_at = NEW.scholarship_decided_at,
        scholarship_decided_by = NEW.scholarship_decided_by
    WHERE lower(s.email) = lower(NEW.email)
      AND (s.scholarship_status IS DISTINCT FROM NEW.scholarship_status
           OR s.scholarship_percentage IS DISTINCT FROM NEW.scholarship_percentage);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_sync_scholarship ON public.applications;
CREATE TRIGGER trg_applications_sync_scholarship
  AFTER UPDATE OF scholarship_status, scholarship_percentage ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.sync_scholarship_application_to_student();

CREATE OR REPLACE FUNCTION public.sync_scholarship_student_to_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scholarship_status IN ('approved', 'declined')
     AND (NEW.scholarship_status IS DISTINCT FROM OLD.scholarship_status
          OR NEW.scholarship_percentage IS DISTINCT FROM OLD.scholarship_percentage)
     AND NEW.email IS NOT NULL THEN
    UPDATE public.applications a
    SET scholarship_status = NEW.scholarship_status,
        scholarship_percentage = CASE WHEN NEW.scholarship_status = 'approved' THEN NEW.scholarship_percentage ELSE a.scholarship_percentage END,
        scholarship_decided_at = NEW.scholarship_decided_at,
        scholarship_decided_by = NEW.scholarship_decided_by
    WHERE lower(a.email) = lower(NEW.email)
      AND a.scholarship_status IS DISTINCT FROM NEW.scholarship_status;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_sync_scholarship ON public.students;
CREATE TRIGGER trg_students_sync_scholarship
  AFTER UPDATE OF scholarship_status, scholarship_percentage ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_scholarship_student_to_application();

-- A student created after the decision picks it up from the application.
CREATE OR REPLACE FUNCTION public.student_take_application_scholarship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app record;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT a.scholarship_status, a.scholarship_percentage, a.scholarship_type, a.scholarship_decided_at, a.scholarship_decided_by
    INTO app
  FROM public.applications a
  WHERE lower(a.email) = lower(NEW.email) AND a.scholarship_status IN ('requested', 'approved', 'declined')
  ORDER BY (a.scholarship_status <> 'requested') DESC, a.scholarship_decided_at DESC NULLS LAST, a.id DESC
  LIMIT 1;
  IF FOUND AND app.scholarship_status = 'requested' THEN
    -- Still waiting for a decision: the student keeps the request, nothing is granted.
    IF NEW.scholarship_status = 'none' THEN
      NEW.scholarship_status := 'requested';
    END IF;
    NEW.has_scholarship := false;
  ELSIF FOUND THEN
    NEW.scholarship_status := app.scholarship_status;
    NEW.scholarship_percentage := CASE WHEN app.scholarship_status = 'approved' THEN app.scholarship_percentage ELSE NULL END;
    NEW.has_scholarship := app.scholarship_status = 'approved';
    NEW.scholarship_type := coalesce(app.scholarship_type, NEW.scholarship_type);
    NEW.scholarship_decided_at := app.scholarship_decided_at;
    NEW.scholarship_decided_by := app.scholarship_decided_by;
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after the guard (trigger names fire in alphabetical order: trg_students_guard… < trg_students_take…).
DROP TRIGGER IF EXISTS trg_students_take_application_scholarship ON public.students;
CREATE TRIGGER trg_students_take_application_scholarship
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.student_take_application_scholarship();

-- ---------------------------------------------------------------------------
-- 4. What a student owes for one semester
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_fee_due(p_student_id integer, p_semester_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st record;
  pl record;
  sem record;
  v_open boolean;
  v_paid record;
  v_paid_count integer;
  v_total numeric := 0;
  v_tuition_total numeric := 0;
  v_other_total numeric := 0;
  v_hours numeric := 0;
  v_tuition numeric := 0;
  v_fees numeric := 0;
  v_pct numeric := 0;
  v_discount numeric := 0;
  v_amount numeric := 0;
  v_n integer;
  base jsonb;
BEGIN
  IF NOT (session_user <> 'authenticator'
          OR auth.role() = 'service_role'
          OR coalesce(public.auth_is_finance_staff(), false)
          OR p_student_id = public.current_student_id()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, major_id, enrollment_date, scholarship_status, scholarship_percentage
    INTO st FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_student');
  END IF;

  SELECT * INTO pl FROM public.program_fee_plans WHERE major_id = st.major_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_plan');
  END IF;

  SELECT id, name_en, name_ar, academic_year_id, start_date, end_date INTO sem FROM public.semesters WHERE id = p_semester_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_semester');
  END IF;

  v_open := EXISTS (
    SELECT 1 FROM public.program_fee_openings o
    WHERE o.plan_id = pl.id
      AND (o.semester_id = sem.id OR (o.academic_year_id IS NOT NULL AND o.academic_year_id = sem.academic_year_id))
  );

  SELECT id, amount, currency, method, paid_at, reference, myfatoorah_payment_id, breakdown INTO v_paid
  FROM public.program_fee_payments
  WHERE student_id = st.id AND plan_id = pl.id AND semester_id = sem.id AND status = 'paid'
  LIMIT 1;

  SELECT count(*) INTO v_paid_count
  FROM public.program_fee_payments
  WHERE student_id = st.id AND plan_id = pl.id AND status = 'paid' AND semester_id <> sem.id;

  SELECT coalesce(sum(amount) FILTER (WHERE NOT is_optional), 0),
         coalesce(sum(amount) FILTER (WHERE NOT is_optional AND is_tuition), 0)
    INTO v_total, v_tuition_total
  FROM public.program_fee_items WHERE plan_id = pl.id;
  v_other_total := v_total - v_tuition_total;
  v_n := greatest(coalesce(pl.installments, 1), 1);

  IF pl.billing_mode = 'credit_hours' THEN
    SELECT coalesce(sum(coalesce(s.credit_hours, 0)), 0) INTO v_hours
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    JOIN public.subjects s ON s.id = c.subject_id
    WHERE e.student_id = st.id AND e.semester_id = sem.id AND e.status = 'enrolled';
    v_tuition := round(v_hours * coalesce(pl.credit_hour_rate, 0), 2);
    -- The fixed fees are spread over the programme's instalments; semesters beyond that pay tuition only.
    v_fees := CASE WHEN v_paid_count < v_n THEN round(v_other_total / v_n, 2) ELSE 0 END;
  ELSE
    v_tuition := round(v_tuition_total / v_n, 2);
    v_fees := round(v_other_total / v_n, 2);
  END IF;

  IF st.scholarship_status = 'approved' THEN
    v_pct := least(greatest(coalesce(st.scholarship_percentage, 0), 0), 100);
  END IF;
  v_discount := round(v_tuition * v_pct / 100, 2);
  v_amount := greatest(round(v_tuition + v_fees - v_discount, 2), 0);

  base := jsonb_build_object(
    'ok', true,
    'student_id', st.id,
    'plan_id', pl.id,
    'semester_id', sem.id,
    'semester_name_en', sem.name_en,
    'semester_name_ar', sem.name_ar,
    'currency', pl.currency,
    'billing_mode', pl.billing_mode,
    'installments', v_n,
    'installment_number', v_paid_count + 1,
    'credit_hours', v_hours,
    'credit_hour_rate', pl.credit_hour_rate,
    'tuition', v_tuition,
    'fees', v_fees,
    'scholarship_percent', v_pct,
    'discount', v_discount,
    'amount', v_amount,
    'open', v_open
  );

  IF v_paid.id IS NOT NULL THEN
    RETURN base || jsonb_build_object('paid', true, 'payment', to_jsonb(v_paid));
  END IF;
  IF NOT v_open THEN
    RETURN base || jsonb_build_object('paid', false, 'reason', 'not_open');
  END IF;
  IF st.enrollment_date IS NOT NULL AND sem.end_date IS NOT NULL AND sem.end_date < st.enrollment_date THEN
    RETURN base || jsonb_build_object('paid', false, 'reason', 'before_joining');
  END IF;
  IF pl.billing_mode = 'installment' AND v_paid_count >= v_n THEN
    RETURN base || jsonb_build_object('paid', false, 'reason', 'all_paid');
  END IF;
  IF pl.billing_mode = 'credit_hours' AND v_hours = 0 THEN
    RETURN base || jsonb_build_object('paid', false, 'reason', 'no_courses');
  END IF;
  IF v_amount <= 0 THEN
    RETURN base || jsonb_build_object('paid', false, 'reason', 'nothing_due');
  END IF;
  RETURN base || jsonb_build_object('paid', false, 'reason', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_fee_due(integer, integer) TO authenticated, service_role;

-- Every student of a programme with what they owe for one semester (finance roster).
CREATE OR REPLACE FUNCTION public.program_fee_roster(p_plan_id bigint, p_semester_id integer)
RETURNS TABLE (student_id integer, student_number text, name_en text, name_ar text, email text, due jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (session_user <> 'authenticator' OR auth.role() = 'service_role' OR coalesce(public.auth_is_finance_staff(), false)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.student_id::text, s.name_en::text, s.name_ar::text, s.email::text, public.student_fee_due(s.id, p_semester_id)
  FROM public.students s
  JOIN public.program_fee_plans p ON p.major_id = s.major_id
  WHERE p.id = p_plan_id AND s.status::text = 'active'
  ORDER BY s.student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.program_fee_roster(bigint, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cash and bank payments recorded by finance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_program_fee_payment(
  p_student_id integer,
  p_semester_id integer,
  p_method text,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d jsonb;
  new_id bigint;
BEGIN
  IF NOT coalesce(public.auth_is_finance_staff(), false) THEN
    RAISE EXCEPTION 'Only finance staff can record a payment' USING ERRCODE = '42501';
  END IF;
  IF p_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Method must be cash or bank_transfer';
  END IF;

  d := public.student_fee_due(p_student_id, p_semester_id);
  IF NOT coalesce((d->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'No fees for this student: %', d->>'reason';
  END IF;
  IF coalesce((d->>'paid')::boolean, false) THEN
    RAISE EXCEPTION 'This semester is already paid';
  END IF;
  IF d->>'reason' IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is not possible: %', d->>'reason';
  END IF;

  INSERT INTO public.program_fee_payments
    (student_id, plan_id, semester_id, amount, currency, status, method, reference, note, breakdown, recorded_by, paid_at)
  VALUES
    (p_student_id, (d->>'plan_id')::bigint, p_semester_id, (d->>'amount')::numeric, d->>'currency', 'paid',
     p_method, nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''), d, auth.uid(), now())
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id, 'amount', d->'amount', 'currency', d->'currency');
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_program_fee_payment(integer, integer, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_program_fee_payment(p_payment_id bigint, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(public.auth_is_finance_staff(), false) THEN
    RAISE EXCEPTION 'Only finance staff can cancel a payment' USING ERRCODE = '42501';
  END IF;
  -- Card payments are confirmed by the payment provider and are refunded there, not cancelled here.
  UPDATE public.program_fee_payments
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      note = concat_ws(' · ', note, nullif(trim(coalesce(p_note, '')), ''))
  WHERE id = p_payment_id AND status = 'paid' AND method IN ('cash', 'bank_transfer');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a cash or bank payment that is paid can be cancelled';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_program_fee_payment(bigint, text) TO authenticated;
