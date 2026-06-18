-- Instructor-created announcement templates (reusable)

CREATE TABLE IF NOT EXISTS public.instructor_announcement_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instructor_id integer NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'assignment', 'exam', 'live_lecture', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instructor_announcement_templates_instructor
  ON public.instructor_announcement_templates(instructor_id, updated_at DESC);

ALTER TABLE public.instructor_announcement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY instructor_announcement_templates_rw ON public.instructor_announcement_templates
  FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR instructor_id = public.auth_instructor_id()
  )
  WITH CHECK (
    public.auth_is_admin()
    OR instructor_id = public.auth_instructor_id()
  );
