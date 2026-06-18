-- Instructor ↔ student course communications (announcements & direct messages)

CREATE TABLE IF NOT EXISTS public.course_announcements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  instructor_id integer NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'assignment', 'exam', 'live_lecture', 'urgent')),
  title text NOT NULL,
  body text NOT NULL,
  target_audience text NOT NULL DEFAULT 'all'
    CHECK (target_audience IN ('all', 'at_risk', 'no_homework', 'specific')),
  delivery_channel text NOT NULL DEFAULT 'both'
    CHECK (delivery_channel IN ('portal', 'email', 'both')),
  recipient_student_ids integer[] DEFAULT '{}',
  email_sent_count integer NOT NULL DEFAULT 0,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_announcement_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announcement_id bigint NOT NULL REFERENCES public.course_announcements(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  instructor_id integer NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  delivery_channel text NOT NULL DEFAULT 'both'
    CHECK (delivery_channel IN ('portal', 'email', 'both')),
  email_sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_message_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES public.course_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_announcements_class_sent
  ON public.course_announcements(class_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_messages_class_sent
  ON public.course_messages(class_id, sent_at DESC);

ALTER TABLE public.course_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_announcement_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_announcements_instructor_rw ON public.course_announcements
  FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_instructor_owns_class(class_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_instructor_owns_class(class_id));

CREATE POLICY course_announcement_attachments_instructor_rw ON public.course_announcement_attachments
  FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.course_announcements a
      WHERE a.id = announcement_id AND public.auth_instructor_owns_class(a.class_id)
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.course_announcements a
      WHERE a.id = announcement_id AND public.auth_instructor_owns_class(a.class_id)
    )
  );

CREATE POLICY course_messages_instructor_rw ON public.course_messages
  FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_instructor_owns_class(class_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_instructor_owns_class(class_id));

CREATE POLICY course_message_attachments_instructor_rw ON public.course_message_attachments
  FOR ALL TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.course_messages m
      WHERE m.id = message_id AND public.auth_instructor_owns_class(m.class_id)
    )
  )
  WITH CHECK (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.course_messages m
      WHERE m.id = message_id AND public.auth_instructor_owns_class(m.class_id)
    )
  );

-- Enrolled students can read announcements for their classes
CREATE POLICY course_announcements_student_read ON public.course_announcements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      INNER JOIN public.students s ON s.id = e.student_id
      INNER JOIN public.users u ON u."openId" = auth.uid()::text
      WHERE e.class_id = course_announcements.class_id
        AND e.status = 'enrolled'
        AND lower(s.email) = lower(u.email)
    )
  );
