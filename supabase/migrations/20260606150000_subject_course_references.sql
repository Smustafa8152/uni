-- Course reference materials for curriculum map (PDF readings, textbooks, etc.)

CREATE TABLE IF NOT EXISTS public.subject_course_references (
  id serial PRIMARY KEY,
  subject_id integer NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id integer REFERENCES public.classes(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  title_ar varchar(255),
  author varchar(255),
  description text,
  description_ar text,
  reference_type varchar(30) DEFAULT 'reading' NOT NULL,
  file_url varchar(500),
  file_name varchar(255),
  file_size bigint,
  external_url varchar(500),
  display_order integer DEFAULT 0 NOT NULL,
  is_published boolean DEFAULT true NOT NULL,
  created_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subject_course_references_subject_id
  ON public.subject_course_references(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_course_references_class_id
  ON public.subject_course_references(class_id);

CREATE TABLE IF NOT EXISTS public.subject_course_reference_clos (
  id serial PRIMARY KEY,
  reference_id integer NOT NULL REFERENCES public.subject_course_references(id) ON DELETE CASCADE,
  clo_id integer NOT NULL REFERENCES public.subject_learning_outcomes(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT subject_course_reference_clos_unique UNIQUE (reference_id, clo_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_course_reference_clos_reference_id
  ON public.subject_course_reference_clos(reference_id);
CREATE INDEX IF NOT EXISTS idx_subject_course_reference_clos_clo_id
  ON public.subject_course_reference_clos(clo_id);

COMMENT ON TABLE public.subject_course_references IS 'Bibliography / reference PDFs for curriculum map (subject-wide or per class section)';
COMMENT ON TABLE public.subject_course_reference_clos IS 'Links course references to CLOs';

ALTER TABLE public.subject_course_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_course_reference_clos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_course_references_select ON public.subject_course_references;
CREATE POLICY subject_course_references_select
  ON public.subject_course_references FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR (
      class_id IS NOT NULL AND public.auth_instructor_owns_class(class_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.subject_id = subject_course_references.subject_id
          AND c.instructor_id = public.auth_instructor_id()
      )
    )
    OR (
      is_published AND EXISTS (
        SELECT 1 FROM public.enrollments e
        INNER JOIN public.classes c ON c.id = e.class_id
        WHERE e.student_id IN (
          SELECT s.id FROM public.students s
          INNER JOIN public.users u ON u.id = s.user_id
          WHERE u."openId" = auth.uid()::text
        )
          AND e.status = 'enrolled'
          AND c.subject_id = subject_course_references.subject_id
          AND (
            subject_course_references.class_id IS NULL
            OR subject_course_references.class_id = c.id
          )
      )
    )
  );

DROP POLICY IF EXISTS subject_course_references_insert ON public.subject_course_references;
CREATE POLICY subject_course_references_insert
  ON public.subject_course_references FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_is_admin()
    OR (
      class_id IS NOT NULL
      AND public.auth_instructor_owns_class(class_id)
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = subject_course_references.class_id
          AND c.subject_id = subject_course_references.subject_id
      )
    )
  );

DROP POLICY IF EXISTS subject_course_references_update ON public.subject_course_references;
CREATE POLICY subject_course_references_update
  ON public.subject_course_references FOR UPDATE TO authenticated
  USING (
    public.auth_is_admin()
    OR (class_id IS NOT NULL AND public.auth_instructor_owns_class(class_id))
  )
  WITH CHECK (
    public.auth_is_admin()
    OR (class_id IS NOT NULL AND public.auth_instructor_owns_class(class_id))
  );

DROP POLICY IF EXISTS subject_course_references_delete ON public.subject_course_references;
CREATE POLICY subject_course_references_delete
  ON public.subject_course_references FOR DELETE TO authenticated
  USING (
    public.auth_is_admin()
    OR (class_id IS NOT NULL AND public.auth_instructor_owns_class(class_id))
  );

DROP POLICY IF EXISTS subject_course_reference_clos_rw ON public.subject_course_reference_clos;
CREATE POLICY subject_course_reference_clos_rw
  ON public.subject_course_reference_clos FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_course_references r
      WHERE r.id = subject_course_reference_clos.reference_id
        AND (
          r.class_id IS NULL
          OR public.auth_instructor_owns_class(r.class_id)
        )
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subject_course_references r
      WHERE r.id = subject_course_reference_clos.reference_id
        AND r.class_id IS NOT NULL
        AND public.auth_instructor_owns_class(r.class_id)
    )
  );
