-- 13 Oct 2026: remove the two test invoices and make the Gambian dalasi (GMD) the currency everywhere.
-- Run once in Supabase > SQL editor. Everything is in one transaction: if any step fails, nothing changes.
--
-- What it removes (checked 13 Oct 2026, these are the only invoices in the database):
--   INV2026000001  id 70  student 561 (20260016 Syed Suleman)   1,000  paid  -> 1 payment (id 48), 1 item (id 55)
--   INV2026000002  id 71  student 559 (20260014 EID Hussain)    1,000  paid  -> 1 item (id 56)

BEGIN;

-- 1. Look first (the result shows in the SQL editor).
SELECT id, invoice_number, student_id, status, total_amount, paid_amount
FROM public.invoices
WHERE invoice_number IN ('INV2026000001', 'INV2026000002') OR parent_invoice_id IN (70, 71);

-- 2. Remove what hangs on the invoices, then the invoices.
DELETE FROM public.payments      WHERE invoice_id IN (SELECT id FROM public.invoices WHERE id IN (70, 71) OR parent_invoice_id IN (70, 71));
DELETE FROM public.invoice_items WHERE invoice_id IN (SELECT id FROM public.invoices WHERE id IN (70, 71) OR parent_invoice_id IN (70, 71));
DELETE FROM public.invoices      WHERE parent_invoice_id IN (70, 71);
DELETE FROM public.invoices      WHERE id IN (70, 71);
-- If another table still points at these invoices, the delete above stops with
-- "violates foreign key constraint ... on table X": nothing is removed. Send me the table name.

-- 3. Currency: Gambian dalasi, code GMD, symbol D, 2 decimals.
--    University settings (the app reads currency_code here, currency.code on colleges).
UPDATE public.university_settings
SET financial_settings = coalesce(financial_settings::jsonb, '{}'::jsonb)
      || jsonb_build_object(
           'currency_code', 'GMD',
           'currency_symbol', 'D',
           'currency', jsonb_build_object('code', 'GMD', 'symbol', 'D', 'decimalPlaces', 2)
         ),
    updated_at = now();

--    Every college.
UPDATE public.colleges
SET financial_settings = coalesce(financial_settings::jsonb, '{}'::jsonb)
      || jsonb_build_object('currency', jsonb_build_object('code', 'GMD', 'symbol', 'D', 'decimalPlaces', 2)),
    updated_at = now();

-- 4. Check: no invoices left, every row now says GMD.
SELECT 'invoices left' AS what, count(*)::text AS value FROM public.invoices WHERE id IN (70, 71)
UNION ALL
SELECT 'university currency', financial_settings ->> 'currency_code' FROM public.university_settings
UNION ALL
SELECT 'college ' || id || ' currency', financial_settings -> 'currency' ->> 'code' FROM public.colleges;

COMMIT;
