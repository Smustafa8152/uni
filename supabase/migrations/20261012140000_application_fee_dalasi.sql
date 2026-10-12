-- Application fees are charged and shown in Gambian dalasi.
ALTER TABLE public.applications
  ALTER COLUMN application_fee_currency SET DEFAULT 'GMD';

UPDATE public.applications
SET application_fee_currency = 'GMD'
WHERE application_fee_amount IS NOT NULL
  AND application_fee_currency IS DISTINCT FROM 'GMD';

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
      NEW.application_fee_currency := 'GMD';
      NEW.application_fee_paid_at := NULL;
      NEW.application_fee_reference := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
