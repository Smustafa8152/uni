-- Link assessments (subject_exams) to course learning outcomes (CLOs)

CREATE TABLE IF NOT EXISTS public.subject_exam_clos (
  id serial PRIMARY KEY,
  subject_exam_id integer NOT NULL REFERENCES public.subject_exams(id) ON DELETE CASCADE,
  clo_id integer NOT NULL REFERENCES public.subject_learning_outcomes(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT subject_exam_clos_unique UNIQUE (subject_exam_id, clo_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_exam_clos_exam_id ON public.subject_exam_clos(subject_exam_id);
CREATE INDEX IF NOT EXISTS idx_subject_exam_clos_clo_id ON public.subject_exam_clos(clo_id);

COMMENT ON TABLE public.subject_exam_clos IS 'Maps subject exams/assessments to course learning outcomes (CLOs)';

ALTER TABLE public.subject_exam_clos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_exam_clos_rw ON public.subject_exam_clos;
CREATE POLICY subject_exam_clos_rw
  ON public.subject_exam_clos FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_exams se
      WHERE se.id = subject_exam_clos.subject_exam_id
        AND (
          se.created_by = public.auth_user_id()
          OR (se.class_id IS NOT NULL AND public.auth_instructor_owns_class(se.class_id))
          OR (
            se.class_id IS NULL AND EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.subject_id = se.subject_id
                AND c.instructor_id = public.auth_instructor_id()
            )
          )
        )
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_exams se
      WHERE se.id = subject_exam_clos.subject_exam_id
        AND (
          se.created_by = public.auth_user_id()
          OR (se.class_id IS NOT NULL AND public.auth_instructor_owns_class(se.class_id))
          OR (
            se.class_id IS NULL AND EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.subject_id = se.subject_id
                AND c.instructor_id = public.auth_instructor_id()
            )
          )
        )
    )
  );

-- Instructors need to read submissions for CLO achievement analytics
DROP POLICY IF EXISTS exam_submissions_instructor_select ON public.exam_submissions;
CREATE POLICY exam_submissions_instructor_select
  ON public.exam_submissions FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_exams se
      WHERE se.id = exam_submissions.exam_id
        AND se.class_id IS NOT NULL
        AND public.auth_instructor_owns_class(se.class_id)
    )
  );
