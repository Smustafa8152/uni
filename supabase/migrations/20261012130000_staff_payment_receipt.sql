-- Admissions and admin can record a bank-transfer receipt from the application page.
DROP POLICY IF EXISTS application_bank_transfers_insert_staff ON public.application_bank_transfers;
CREATE POLICY application_bank_transfers_insert_staff
  ON public.application_bank_transfers FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_application_staff());
