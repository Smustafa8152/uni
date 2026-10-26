-- A subject can be offered by more than one college.
-- subjects.college_id stays as the first college so older screens keep working.

CREATE TABLE IF NOT EXISTS public.subject_colleges (
  subject_id integer NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  college_id integer NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (subject_id, college_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_colleges_college_id ON public.subject_colleges(college_id);

INSERT INTO public.subject_colleges (subject_id, college_id)
SELECT id, college_id
FROM public.subjects
WHERE college_id IS NOT NULL
ON CONFLICT (subject_id, college_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_colleges TO authenticated;

ALTER TABLE public.subject_colleges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_colleges_staff ON public.subject_colleges;
CREATE POLICY subject_colleges_staff ON public.subject_colleges
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
