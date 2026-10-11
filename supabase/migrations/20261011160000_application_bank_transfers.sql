-- Proof an applicant uploads after paying the application fee or the registration fee by bank transfer.
-- Staff confirm the proof from the application payment tab. Applicants cannot mark the fee paid themselves.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS application_fee_payment_method text;

CREATE TABLE IF NOT EXISTS public.application_bank_transfers (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  fee_kind text NOT NULL CHECK (fee_kind IN ('application', 'registration')),
  amount numeric(10, 2),
  currency varchar(3) NOT NULL DEFAULT 'USD',
  sender_name text,
  transfer_reference text,
  transfer_date date,
  notes text,
  file_path text,
  file_name text,
  content_type text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by bigint REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_application_bank_transfers_application
  ON public.application_bank_transfers(application_id, created_at DESC);

ALTER TABLE public.application_bank_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_bank_transfers_select_own ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_select_own
  ON public.application_bank_transfers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_bank_transfers.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS application_bank_transfers_select_staff ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_select_staff
  ON public.application_bank_transfers FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role::text IN ('admin', 'instructor')
    )
  );

DROP POLICY IF EXISTS application_bank_transfers_insert_own ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_insert_own
  ON public.application_bank_transfers FOR INSERT TO authenticated
  WITH CHECK (
    status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_bank_transfers.application_id
        AND (
          a.applicant_user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

DROP POLICY IF EXISTS application_bank_transfers_update_staff ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_update_staff
  ON public.application_bank_transfers FOR UPDATE TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role::text IN ('admin', 'instructor')
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u."openId" = auth.uid()::text
        AND u.role::text IN ('admin', 'instructor')
    )
  );
