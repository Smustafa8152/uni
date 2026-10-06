-- Enrollments: fast row security, seat counters the database keeps true, no double registration.
--
-- Why
--   1. Reading enrollments was slow enough to time out (the admin list showed "No enrollments found").
--      The row-security policies called current_student_id() / current_app_user_role() once for
--      EVERY row. Wrapping each call in (SELECT ...) makes Postgres run it once per statement.
--      Who may see or change which rows does not change.
--   2. classes.enrolled was kept by the browser (read, add one, write). Two people registering at the
--      same moment could both take the last seat, and the counter could drift. The database now
--      keeps the counter and refuses a registration into a class that is full.
--   3. Nothing stopped the same student being registered twice in the same class.
--
-- Safe to run more than once.
--
-- Before running, list the policies that exist today. Any policy on enrollments that is NOT
-- re-created below still runs as it is; if it calls one of the helper functions directly it
-- needs the same (SELECT ...) wrapping:
--   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'enrollments';

-- ---------------------------------------------------------------------------
-- 1. Row security: same rules, evaluated once per statement
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "enrollments_student_select" ON public.enrollments;
CREATE POLICY "enrollments_student_select"
  ON public.enrollments FOR SELECT TO authenticated
  USING (student_id = (SELECT public.current_student_id()));

DROP POLICY IF EXISTS "enrollments_staff_select" ON public.enrollments;
CREATE POLICY "enrollments_staff_select"
  ON public.enrollments FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_user_role()) = 'admin'
    OR (
      (SELECT public.current_app_user_role()) = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        JOIN public.users u ON u.id = (SELECT public.current_app_user_id())
        WHERE st.id = enrollments.student_id
          AND u.college_id IS NOT NULL
          AND u.college_id = st.college_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.instructors i
      JOIN public.classes c ON c.id = enrollments.class_id AND c.instructor_id = i.id
      WHERE (
        lower(i.email) = lower((SELECT auth.jwt() ->> 'email'))
        OR EXISTS (
          SELECT 1 FROM public.users u2
          WHERE u2.id = i.user_id
            AND (
              u2."openId" = (SELECT auth.uid())::text
              OR lower(u2.email) = lower((SELECT auth.jwt() ->> 'email'))
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "enrollments_student_insert" ON public.enrollments;
CREATE POLICY "enrollments_student_insert"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_student_id()) IS NOT NULL
    AND enrollments.student_id = (SELECT public.current_student_id())
    AND EXISTS (
      SELECT 1
      FROM public.classes cl
      JOIN public.students st ON st.id = enrollments.student_id
      WHERE cl.id = enrollments.class_id
        AND cl.semester_id = enrollments.semester_id
        AND (cl.college_id = st.college_id OR cl.is_university_wide IS TRUE)
    )
  );

DROP POLICY IF EXISTS "enrollments_student_update" ON public.enrollments;
CREATE POLICY "enrollments_student_update"
  ON public.enrollments FOR UPDATE TO authenticated
  USING ((SELECT public.current_student_id()) IS NOT NULL AND enrollments.student_id = (SELECT public.current_student_id()))
  WITH CHECK ((SELECT public.current_student_id()) IS NOT NULL AND enrollments.student_id = (SELECT public.current_student_id()));

DROP POLICY IF EXISTS "enrollments_staff_insert" ON public.enrollments;
CREATE POLICY "enrollments_staff_insert"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_app_user_role()) = 'admin'
    OR (
      (SELECT public.current_app_user_role()) = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        JOIN public.users u ON u.id = (SELECT public.current_app_user_id())
        WHERE st.id = enrollments.student_id
          AND u.college_id IS NOT NULL
          AND u.college_id = st.college_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.classes cl
        JOIN public.students st2 ON st2.id = enrollments.student_id
        WHERE cl.id = enrollments.class_id
          AND cl.semester_id = enrollments.semester_id
          AND (cl.college_id = st2.college_id OR cl.is_university_wide IS TRUE)
      )
    )
  );

DROP POLICY IF EXISTS "enrollments_staff_update" ON public.enrollments;
CREATE POLICY "enrollments_staff_update"
  ON public.enrollments FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_app_user_role()) = 'admin'
    OR (
      (SELECT public.current_app_user_role()) = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        JOIN public.users u ON u.id = (SELECT public.current_app_user_id())
        WHERE st.id = enrollments.student_id
          AND u.college_id IS NOT NULL
          AND u.college_id = st.college_id
      )
    )
  )
  WITH CHECK (
    (SELECT public.current_app_user_role()) = 'admin'
    OR (
      (SELECT public.current_app_user_role()) = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        JOIN public.users u ON u.id = (SELECT public.current_app_user_id())
        WHERE st.id = enrollments.student_id
          AND u.college_id IS NOT NULL
          AND u.college_id = st.college_id
      )
    )
  );

DROP POLICY IF EXISTS "enrollments_staff_delete" ON public.enrollments;
CREATE POLICY "enrollments_staff_delete"
  ON public.enrollments FOR DELETE TO authenticated
  USING (
    (SELECT public.current_app_user_role()) = 'admin'
    OR (
      (SELECT public.current_app_user_role()) = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        JOIN public.users u ON u.id = (SELECT public.current_app_user_id())
        WHERE st.id = enrollments.student_id
          AND u.college_id IS NOT NULL
          AND u.college_id = st.college_id
      )
    )
  );

-- The registrations list is read newest first, usually for one semester.
CREATE INDEX IF NOT EXISTS idx_enrollments_semester_id_id ON public.enrollments (semester_id, id DESC);

-- ---------------------------------------------------------------------------
-- 2. Seat counters kept by the database
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_enrolled_count(p_class_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.enrollments WHERE class_id = p_class_id AND status = 'enrolled';
$$;

-- Before a student becomes "enrolled" in a class: take the class row lock (so two registrations
-- for the last seat queue up instead of racing) and refuse when the class is already full.
-- A class with no capacity set (NULL or 0) is not limited here.
CREATE OR REPLACE FUNCTION public.enrollments_guard_seat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_taken integer;
BEGIN
  IF NEW.status <> 'enrolled' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'enrolled' AND OLD.class_id = NEW.class_id THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity FROM public.classes WHERE id = NEW.class_id FOR UPDATE;
  IF v_capacity IS NULL OR v_capacity <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_taken FROM public.enrollments WHERE class_id = NEW.class_id AND status = 'enrolled';
  IF v_taken >= v_capacity THEN
    RAISE EXCEPTION 'CLASS_FULL: class % has no seat left (% of %)', NEW.class_id, v_taken, v_capacity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollments_guard_seat ON public.enrollments;
CREATE TRIGGER trg_enrollments_guard_seat
  BEFORE INSERT OR UPDATE OF status, class_id ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enrollments_guard_seat();

-- After any change that can move a seat: store the real number of enrolled students.
CREATE OR REPLACE FUNCTION public.enrollments_sync_class_enrolled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.classes SET enrolled = public.class_enrolled_count(NEW.class_id) WHERE id = NEW.class_id;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.class_id IS DISTINCT FROM NEW.class_id) THEN
    UPDATE public.classes SET enrolled = public.class_enrolled_count(OLD.class_id) WHERE id = OLD.class_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollments_sync_class_enrolled ON public.enrollments;
CREATE TRIGGER trg_enrollments_sync_class_enrolled
  AFTER INSERT OR DELETE OR UPDATE OF status, class_id ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enrollments_sync_class_enrolled();

-- The application still writes classes.enrolled itself (older screens add or subtract one).
-- Whatever number it sends is replaced by the real count, so those writes can no longer drift.
CREATE OR REPLACE FUNCTION public.classes_keep_enrolled_true()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.enrolled := public.class_enrolled_count(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classes_keep_enrolled_true ON public.classes;
CREATE TRIGGER trg_classes_keep_enrolled_true
  BEFORE UPDATE OF enrolled ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.classes_keep_enrolled_true();

-- One-time repair of counters that have already drifted.
UPDATE public.classes c
SET enrolled = public.class_enrolled_count(c.id)
WHERE c.enrolled IS DISTINCT FROM public.class_enrolled_count(c.id);

-- ---------------------------------------------------------------------------
-- 3. One row per student and class
-- ---------------------------------------------------------------------------
-- The screens re-open a dropped row instead of adding a second one, so one row per pair is enough.
-- If duplicates already exist the index is skipped and they are listed in the notice, to clean first.
DO $$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (SELECT 1 FROM public.enrollments GROUP BY student_id, class_id HAVING count(*) > 1) d;

  IF v_duplicates = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_student_class ON public.enrollments (student_id, class_id);
  ELSE
    RAISE NOTICE 'uq_enrollments_student_class NOT created: % student/class pairs have more than one row. List them with: SELECT student_id, class_id, count(*) FROM enrollments GROUP BY 1, 2 HAVING count(*) > 1;', v_duplicates;
  END IF;
END $$;
