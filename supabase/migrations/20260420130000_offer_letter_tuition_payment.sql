-- Offer letter + tuition payment tracking on applications
-- Tuition is paid while the user is still an applicant (no student_id yet),
-- then we create the student record and move status to DCFA.

ALTER TABLE "applications"
ADD COLUMN IF NOT EXISTS "offer_sent_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "offer_deadline" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "tuition_fee_amount" numeric(10, 2),
ADD COLUMN IF NOT EXISTS "tuition_fee_paid_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "tuition_fee_payment_method" payment_method;

COMMENT ON COLUMN "applications"."offer_sent_at" IS 'When admissions sent the offer letter to the applicant.';
COMMENT ON COLUMN "applications"."offer_deadline" IS 'Offer acceptance/payment deadline shown on offer letter.';
COMMENT ON COLUMN "applications"."tuition_fee_amount" IS 'Tuition fee amount to be paid on offer letter before final acceptance.';
COMMENT ON COLUMN "applications"."tuition_fee_paid_at" IS 'When tuition fee was paid by applicant (pre-student).';
COMMENT ON COLUMN "applications"."tuition_fee_payment_method" IS 'Payment method used for tuition fee (pre-student).';

