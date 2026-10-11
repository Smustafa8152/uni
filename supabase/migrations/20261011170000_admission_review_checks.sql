-- Staff mark details and documents verified before an offer.
-- A bank transfer sets payment_review so the applicant sees "payment in review" until staff confirm it.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS details_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS details_verified_by bigint,
  ADD COLUMN IF NOT EXISTS documents_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_verified_by bigint,
  ADD COLUMN IF NOT EXISTS payment_review text;

CREATE OR REPLACE FUNCTION public.application_bank_transfer_in_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    UPDATE public.applications
      SET payment_review = 'in_review'
      WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_bank_transfer_in_review ON public.application_bank_transfers;
CREATE TRIGGER application_bank_transfer_in_review
  AFTER INSERT ON public.application_bank_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.application_bank_transfer_in_review();

UPDATE public.applications a
SET payment_review = 'in_review'
WHERE a.payment_review IS DISTINCT FROM 'in_review'
  AND (
    (
      a.registration_fee_paid_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.application_bank_transfers t
        WHERE t.application_id = a.id AND t.fee_kind = 'registration' AND t.status = 'submitted'
      )
    )
    OR (
      a.application_fee_status = 'pending'
      AND EXISTS (
        SELECT 1 FROM public.application_bank_transfers t
        WHERE t.application_id = a.id AND t.fee_kind = 'application' AND t.status = 'submitted'
      )
    )
  );
