-- Program fees from "اسعار البرامج.xlsx": one plan per program, its fee items, and the number of installments.
-- Each installment is the plan total divided evenly, one installment per semester.
-- Students see and pay an installment only for a semester (or a whole academic year) that finance has opened.

CREATE TABLE IF NOT EXISTS public.program_fee_plans (
  id bigserial PRIMARY KEY,
  major_id integer NOT NULL REFERENCES public.majors(id) ON DELETE CASCADE,
  study_mode text CHECK (study_mode IN ('online', 'on_campus')),
  installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 24),
  currency varchar(3) NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_fee_plans_major_unique UNIQUE (major_id)
);

CREATE TABLE IF NOT EXISTS public.program_fee_items (
  id bigserial PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES public.program_fee_plans(id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  is_optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_program_fee_items_plan ON public.program_fee_items(plan_id, sort_order);

CREATE TABLE IF NOT EXISTS public.program_fee_openings (
  id bigserial PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES public.program_fee_plans(id) ON DELETE CASCADE,
  semester_id integer REFERENCES public.semesters(id) ON DELETE CASCADE,
  academic_year_id integer REFERENCES public.academic_years(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT program_fee_openings_one_scope CHECK ((semester_id IS NULL) <> (academic_year_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS program_fee_openings_plan_semester
  ON public.program_fee_openings(plan_id, semester_id) WHERE semester_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS program_fee_openings_plan_year
  ON public.program_fee_openings(plan_id, academic_year_id) WHERE academic_year_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.program_fee_payments (
  id bigserial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  plan_id bigint NOT NULL REFERENCES public.program_fee_plans(id) ON DELETE RESTRICT,
  semester_id integer NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
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

CREATE UNIQUE INDEX IF NOT EXISTS program_fee_payments_one_paid
  ON public.program_fee_payments(student_id, plan_id, semester_id) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_program_fee_payments_student ON public.program_fee_payments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_program_fee_payments_invoice ON public.program_fee_payments(myfatoorah_invoice_id);

CREATE OR REPLACE FUNCTION public.auth_is_finance_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u."openId" = auth.uid()::text AND u.role::text IN ('admin', 'user')
  );
$$;

ALTER TABLE public.program_fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_fee_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_fee_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_fee_plans_read ON public.program_fee_plans;
CREATE POLICY program_fee_plans_read ON public.program_fee_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS program_fee_plans_staff ON public.program_fee_plans;
CREATE POLICY program_fee_plans_staff ON public.program_fee_plans FOR ALL TO authenticated
  USING (public.auth_is_finance_staff()) WITH CHECK (public.auth_is_finance_staff());

DROP POLICY IF EXISTS program_fee_items_read ON public.program_fee_items;
CREATE POLICY program_fee_items_read ON public.program_fee_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS program_fee_items_staff ON public.program_fee_items;
CREATE POLICY program_fee_items_staff ON public.program_fee_items FOR ALL TO authenticated
  USING (public.auth_is_finance_staff()) WITH CHECK (public.auth_is_finance_staff());

DROP POLICY IF EXISTS program_fee_openings_read ON public.program_fee_openings;
CREATE POLICY program_fee_openings_read ON public.program_fee_openings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS program_fee_openings_staff ON public.program_fee_openings;
CREATE POLICY program_fee_openings_staff ON public.program_fee_openings FOR ALL TO authenticated
  USING (public.auth_is_finance_staff()) WITH CHECK (public.auth_is_finance_staff());

-- Payments are written only by the payment function (service role).
DROP POLICY IF EXISTS program_fee_payments_read_own ON public.program_fee_payments;
CREATE POLICY program_fee_payments_read_own ON public.program_fee_payments FOR SELECT TO authenticated
  USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS program_fee_payments_read_staff ON public.program_fee_payments;
CREATE POLICY program_fee_payments_read_staff ON public.program_fee_payments FOR SELECT TO authenticated
  USING (public.auth_is_finance_staff());

-- Prices from the sheet. Programs are matched by faculty code, program code, and level.
DO $$
DECLARE
  p record;
  v_major integer;
  v_plan bigint;
  common_tail jsonb := '[
    {"en": "Resources and digital library", "ar": "المصادر والمكتبة الرقمية", "amount": 50},
    {"en": "Academic record and student services", "ar": "السجل الأكاديمي والخدمات الطلابية", "amount": 50},
    {"en": "Graduation documents", "ar": "إصدار وثائق التخرج", "amount": 50}
  ]';
  admission jsonb := '{"en": "Admission and file opening", "ar": "القبول وفتح الملف", "amount": 100}';
  services jsonb := '{"en": "Academic and e-services", "ar": "الخدمات الأكاديمية والإلكترونية", "amount": 250}';
  exams jsonb := '{"en": "Examinations and assessment", "ar": "الاختبارات والتقييم", "amount": 100}';
  item jsonb;
  i integer;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('DGS001', '0143', 'master', NULL, 4, jsonb_build_array(admission,
        '{"en": "Courses – 40 credit hours", "ar": "المقررات الدراسية – 40 ساعة", "amount": 2050}'::jsonb,
        '{"en": "Supplementary research – 9 credit hours", "ar": "البحث التكميلي – 9 ساعات", "amount": 450}'::jsonb,
        services) || common_tail),
      ('DGS001', '0142', 'master', NULL, 4, jsonb_build_array(admission,
        '{"en": "Courses – 25 credit hours", "ar": "المقررات الدراسية – 25 ساعة", "amount": 1225}'::jsonb,
        '{"en": "Thesis – 24 credit hours", "ar": "الرسالة العلمية – 24 ساعات", "amount": 960}'::jsonb,
        services) || common_tail),
      ('DGS001', '0113', 'master', NULL, 4, jsonb_build_array(admission,
        '{"en": "Courses – 41 credit hours", "ar": "المقررات الدراسية – 41 ساعة", "amount": 2050}'::jsonb,
        '{"en": "Supplementary research – 9 credit hours", "ar": "البحث التكميلي – 9 ساعات", "amount": 450}'::jsonb,
        services) || common_tail),
      ('DGS001', '0112', 'master', NULL, 4, jsonb_build_array(admission,
        '{"en": "Courses – 25 credit hours", "ar": "المقررات الدراسية – 25 ساعة", "amount": 1225}'::jsonb,
        '{"en": "Thesis – 24 credit hours", "ar": "الرسالة العلمية – 24 ساعات", "amount": 960}'::jsonb,
        services) || common_tail),
      ('DGS001', '0144', 'phd', 'online', 4, jsonb_build_array(admission,
        '{"en": "Thesis – two years", "ar": "الرسالة العلمية – سنتين", "amount": 4000}'::jsonb,
        services, exams) || common_tail
        || jsonb_build_array('{"en": "Additional year (if needed)", "ar": "سنة إضافية (عند الحاجة)", "amount": 500, "optional": true}'::jsonb)),
      ('SH001', '0111', 'bachelor', 'on_campus', 8, jsonb_build_array(admission,
        '{"en": "Tuition – 131 credit hours × $30", "ar": "الرسوم الدراسية – 131 ساعة × $30", "amount": 3930}'::jsonb,
        services, exams) || common_tail),
      ('SH001', '0141', 'bachelor', 'online', 8, jsonb_build_array(admission,
        '{"en": "Tuition – 126 credit hours × $25", "ar": "الرسوم الدراسية – 126 ساعة × $25", "amount": 3150}'::jsonb,
        services, exams) || common_tail),
      ('SH001', '0131', 'bachelor', 'on_campus', 8, jsonb_build_array(admission,
        '{"en": "Tuition – 135 credit hours × $30", "ar": "الرسوم الدراسية – 135 ساعة × $30", "amount": 4050}'::jsonb,
        services, exams) || common_tail),
      ('02', '0411', 'bachelor', 'on_campus', 8, jsonb_build_array(admission,
        '{"en": "Tuition – 127 credit hours × $32", "ar": "الرسوم الدراسية – 127 ساعة × $32", "amount": 4064}'::jsonb,
        services, exams) || common_tail)
    ) AS t(college_code, major_code, level, mode, installments, items)
  LOOP
    SELECT m.id INTO v_major
    FROM public.majors m
    JOIN public.colleges c ON c.id = m.college_id
    WHERE trim(c.code) = p.college_code
      AND trim(m.code) = p.major_code
      AND m.degree_level::text = p.level
    ORDER BY (m.status::text = 'active') DESC, m.id DESC
    LIMIT 1;

    CONTINUE WHEN v_major IS NULL;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.program_fee_plans WHERE major_id = v_major);

    INSERT INTO public.program_fee_plans (major_id, study_mode, installments)
    VALUES (v_major, p.mode, p.installments)
    RETURNING id INTO v_plan;

    i := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(p.items)
    LOOP
      i := i + 1;
      INSERT INTO public.program_fee_items (plan_id, name_en, name_ar, amount, is_optional, sort_order)
      VALUES (v_plan, item->>'en', item->>'ar', (item->>'amount')::numeric, coalesce((item->>'optional')::boolean, false), i);
    END LOOP;
  END LOOP;
END;
$$;
