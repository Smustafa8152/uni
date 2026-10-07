-- Application fee collected on the last step of the application form.
-- Separate from the later registration fee (APPN), which stays unchanged.

INSERT INTO public.student_status_codes (code, name_en, name_ar, category)
VALUES ('APFP', 'Application fee unpaid', 'رسوم الطلب غير مدفوعة', 'application')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  category = EXCLUDED.category;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS application_fee_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS application_fee_currency varchar(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS application_fee_status text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS application_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_fee_reference text;

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_application_fee_status_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_application_fee_status_check
  CHECK (application_fee_status IN ('not_required', 'pending', 'paid'));

COMMENT ON COLUMN public.applications.application_fee_status IS 'not_required when the fee is off, pending until MyFatoorah confirms payment, then paid.';

CREATE TABLE IF NOT EXISTS public.application_fee_payments (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  myfatoorah_invoice_id text,
  myfatoorah_payment_id text,
  invoice_url text,
  language varchar(5),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_fee_payments_application
  ON public.application_fee_payments(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_fee_payments_invoice
  ON public.application_fee_payments(myfatoorah_invoice_id);

ALTER TABLE public.application_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_fee_payments_select_own ON public.application_fee_payments;
CREATE POLICY application_fee_payments_select_own
  ON public.application_fee_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_fee_payments.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS application_fee_payments_select_staff ON public.application_fee_payments;
CREATE POLICY application_fee_payments_select_staff
  ON public.application_fee_payments FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role::text IN ('admin', 'instructor')
    )
  );

-- Only the payment function (service role) can mark a fee paid.
-- Applicants cannot submit the application as paid while the fee switch is on.
CREATE OR REPLACE FUNCTION public.guard_application_fee_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  fee_on boolean;
  fee_amount numeric;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT u.role::text INTO caller_role
  FROM public.users u
  WHERE u."openId" = auth.uid()::text
  LIMIT 1;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.application_fee_status IS DISTINCT FROM 'paid' AND NEW.application_fee_status = 'paid' THEN
      NEW.application_fee_status := OLD.application_fee_status;
      NEW.application_fee_paid_at := OLD.application_fee_paid_at;
      NEW.application_fee_reference := OLD.application_fee_reference;
    END IF;
    IF OLD.status_code = 'APFP'
       AND OLD.application_fee_status = 'pending'
       AND NEW.status_code IS DISTINCT FROM 'APFP'
       AND coalesce(caller_role, '') IN ('applicant', 'student') THEN
      NEW.status_code := 'APFP';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.application_fee_status = 'paid' THEN
    NEW.application_fee_status := 'pending';
    NEW.application_fee_paid_at := NULL;
    NEW.application_fee_reference := NULL;
    NEW.status_code := 'APFP';
  END IF;

  IF coalesce(caller_role, '') IN ('', 'applicant') AND coalesce(NEW.status_code, '') <> 'APDR' THEN
    SELECT coalesce((s.onboarding_settings->'application_fee'->>'enabled')::boolean, false),
           coalesce((s.onboarding_settings->'application_fee'->>'amount')::numeric, 20)
      INTO fee_on, fee_amount
    FROM public.university_settings s
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1;

    IF fee_on AND fee_amount > 0 THEN
      NEW.status_code := 'APFP';
      NEW.application_fee_status := 'pending';
      NEW.application_fee_amount := fee_amount;
      NEW.application_fee_currency := coalesce(NEW.application_fee_currency, 'USD');
      NEW.application_fee_paid_at := NULL;
      NEW.application_fee_reference := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_application_fee_payment ON public.applications;
CREATE TRIGGER guard_application_fee_payment
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_application_fee_payment();
