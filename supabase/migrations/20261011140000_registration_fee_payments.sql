-- Registration fee payments started from the applicant portal (MyFatoorah).
-- The service role records the paid result. Applicants cannot mark the fee paid themselves.

CREATE TABLE IF NOT EXISTS public.registration_fee_payments (
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

CREATE INDEX IF NOT EXISTS idx_registration_fee_payments_application
  ON public.registration_fee_payments(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_fee_payments_invoice
  ON public.registration_fee_payments(myfatoorah_invoice_id);

ALTER TABLE public.registration_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registration_fee_payments_select_own ON public.registration_fee_payments;
CREATE POLICY registration_fee_payments_select_own
  ON public.registration_fee_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = registration_fee_payments.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS registration_fee_payments_select_staff ON public.registration_fee_payments;
CREATE POLICY registration_fee_payments_select_staff
  ON public.registration_fee_payments FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role::text IN ('admin', 'instructor')
    )
  );
