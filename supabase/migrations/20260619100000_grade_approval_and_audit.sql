-- Grade approval per assessment group, audit log, and record_status on grade_components

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grade_assessment_group') THEN
    CREATE TYPE public.grade_assessment_group AS ENUM ('activities', 'midterm', 'final');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grade_assessment_approval_status') THEN
    CREATE TYPE public.grade_assessment_approval_status AS ENUM ('open', 'approved');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grade_record_status') THEN
    CREATE TYPE public.grade_record_status AS ENUM (
      'complete', 'incomplete', 'not_recorded', 'debarred', 'withdrawn'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grade_audit_change_source') THEN
    CREATE TYPE public.grade_audit_change_source AS ENUM (
      'manual', 'autosave', 'upload', 'admin_override'
    );
  END IF;
END $$;

-- Per-class assessment group approvals
CREATE TABLE IF NOT EXISTS public.class_grade_assessment_approvals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assessment_group public.grade_assessment_group NOT NULL,
  status public.grade_assessment_approval_status NOT NULL DEFAULT 'open',
  approved_by integer REFERENCES public.instructors(id) ON DELETE SET NULL,
  approved_at timestamptz,
  entry_started_at timestamptz,
  entry_ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, assessment_group)
);

CREATE INDEX IF NOT EXISTS idx_class_grade_assessment_approvals_class
  ON public.class_grade_assessment_approvals(class_id);

-- Audit log for grade changes
CREATE TABLE IF NOT EXISTS public.grade_component_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grade_component_id integer REFERENCES public.grade_components(id) ON DELETE CASCADE,
  enrollment_id integer NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_source public.grade_audit_change_source NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_grade_component_audit_log_enrollment
  ON public.grade_component_audit_log(enrollment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_grade_component_audit_log_class
  ON public.grade_component_audit_log(class_id, changed_at DESC);

-- Student row record status on grade_components
ALTER TABLE public.grade_components
  ADD COLUMN IF NOT EXISTS record_status public.grade_record_status DEFAULT 'not_recorded';

-- RLS: class_grade_assessment_approvals
ALTER TABLE public.class_grade_assessment_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY class_grade_assessment_approvals_select ON public.class_grade_assessment_approvals
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_grade_assessment_approvals.class_id
        AND c.instructor_id = public.auth_instructor_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.classes c ON c.college_id = u.college_id
      WHERE c.id = class_grade_assessment_approvals.class_id
        AND u.role = 'user'
        AND (u."openId" = auth.uid()::text OR lower(u.email) = lower((auth.jwt() ->> 'email')))
    )
  );

CREATE POLICY class_grade_assessment_approvals_insert ON public.class_grade_assessment_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_grade_assessment_approvals.class_id
        AND c.instructor_id = public.auth_instructor_id()
    )
  );

CREATE POLICY class_grade_assessment_approvals_update ON public.class_grade_assessment_approvals
  FOR UPDATE TO authenticated
  USING (
    public.auth_is_admin()
    OR (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_grade_assessment_approvals.class_id
          AND c.instructor_id = public.auth_instructor_id()
      )
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_grade_assessment_approvals.class_id
          AND c.instructor_id = public.auth_instructor_id()
      )
    )
  );

-- RLS: grade_component_audit_log (read for class instructor/admin; insert for authenticated writers)
ALTER TABLE public.grade_component_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_component_audit_log_select ON public.grade_component_audit_log
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = grade_component_audit_log.class_id
        AND c.instructor_id = public.auth_instructor_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.classes c ON c.college_id = u.college_id
      WHERE c.id = grade_component_audit_log.class_id
        AND u.role = 'user'
        AND (u."openId" = auth.uid()::text OR lower(u.email) = lower((auth.jwt() ->> 'email')))
    )
  );

CREATE POLICY grade_component_audit_log_insert ON public.grade_component_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.class_grade_assessment_approvals TO authenticated;
GRANT SELECT, INSERT ON public.grade_component_audit_log TO authenticated;
