-- Question categories, feedback fields, quiz settings schema support, audit log

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_bank_status') THEN
    CREATE TYPE question_bank_status AS ENUM ('draft', 'ready', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS subject_question_categories (
  id serial PRIMARY KEY,
  subject_id integer NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  parent_id integer REFERENCES subject_question_categories(id) ON DELETE SET NULL,
  name_en varchar(255) NOT NULL,
  name_ar varchar(255),
  sort_order integer DEFAULT 0 NOT NULL,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subject_question_categories_subject
  ON subject_question_categories(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_question_categories_parent
  ON subject_question_categories(parent_id);

ALTER TABLE subject_question_bank
  ADD COLUMN IF NOT EXISTS category_id integer REFERENCES subject_question_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS question_name varchar(120),
  ADD COLUMN IF NOT EXISTS status question_bank_status DEFAULT 'draft' NOT NULL,
  ADD COLUMN IF NOT EXISTS general_feedback text,
  ADD COLUMN IF NOT EXISTS general_feedback_ar text,
  ADD COLUMN IF NOT EXISTS correct_feedback text,
  ADD COLUMN IF NOT EXISTS correct_feedback_ar text,
  ADD COLUMN IF NOT EXISTS incorrect_feedback text,
  ADD COLUMN IF NOT EXISTS incorrect_feedback_ar text;

CREATE INDEX IF NOT EXISTS idx_subject_question_bank_category
  ON subject_question_bank(category_id);
CREATE INDEX IF NOT EXISTS idx_subject_question_bank_status
  ON subject_question_bank(status);
CREATE INDEX IF NOT EXISTS idx_subject_question_bank_name
  ON subject_question_bank(question_name);

ALTER TABLE subject_exam_questions
  ADD COLUMN IF NOT EXISTS question_name varchar(120),
  ADD COLUMN IF NOT EXISTS general_feedback text,
  ADD COLUMN IF NOT EXISTS general_feedback_ar text,
  ADD COLUMN IF NOT EXISTS correct_feedback text,
  ADD COLUMN IF NOT EXISTS correct_feedback_ar text,
  ADD COLUMN IF NOT EXISTS incorrect_feedback text,
  ADD COLUMN IF NOT EXISTS incorrect_feedback_ar text,
  ADD COLUMN IF NOT EXISTS bank_version_pinned boolean DEFAULT false NOT NULL;

ALTER TABLE subject_exams
  ADD COLUMN IF NOT EXISTS lesson_id integer,
  ADD COLUMN IF NOT EXISTS week_number integer;

CREATE TABLE IF NOT EXISTS exam_audit_log (
  id bigserial PRIMARY KEY,
  subject_exam_id integer REFERENCES subject_exams(id) ON DELETE CASCADE,
  exam_submission_id integer REFERENCES exam_submissions(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exam_audit_log_exam ON exam_audit_log(subject_exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_audit_log_created ON exam_audit_log(created_at DESC);

COMMENT ON TABLE subject_question_categories IS 'Nested question bank categories (Moodle-style)';
COMMENT ON TABLE exam_audit_log IS 'Audit trail for quiz lifecycle and grading';

-- RLS: subject_question_categories
ALTER TABLE subject_question_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_question_categories_rw ON subject_question_categories;
CREATE POLICY subject_question_categories_rw
  ON subject_question_categories FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.instructor_id = public.auth_instructor_id()
        AND c.subject_id = subject_question_categories.subject_id
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.instructor_id = public.auth_instructor_id()
        AND c.subject_id = subject_question_categories.subject_id
    )
  );

-- RLS: exam_audit_log (instructors read/write for own exams)
ALTER TABLE exam_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_audit_log_instructor ON exam_audit_log;
CREATE POLICY exam_audit_log_instructor
  ON exam_audit_log FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_exams se
      WHERE se.id = exam_audit_log.subject_exam_id
        AND (
          se.created_by = public.auth_user_id()
          OR (se.class_id IS NOT NULL AND public.auth_instructor_owns_class(se.class_id))
        )
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_exams se
      WHERE se.id = exam_audit_log.subject_exam_id
        AND (
          se.created_by = public.auth_user_id()
          OR (se.class_id IS NOT NULL AND public.auth_instructor_owns_class(se.class_id))
        )
    )
  );
