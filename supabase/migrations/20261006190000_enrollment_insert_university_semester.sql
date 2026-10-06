-- A student can register for a class offered in their semester.
-- The class may sit under another college when the semester itself is university-wide
-- or belongs to the student's college. The previous check required the class row's
-- college to match, so Add failed with a row-security error.

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
      JOIN public.semesters sem ON sem.id = enrollments.semester_id
      WHERE cl.id = enrollments.class_id
        AND cl.semester_id = enrollments.semester_id
        AND (
          cl.college_id = st.college_id
          OR cl.is_university_wide IS TRUE
          OR sem.is_university_wide IS TRUE
          OR sem.college_id = st.college_id
        )
    )
  );

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
        JOIN public.semesters sem ON sem.id = enrollments.semester_id
        WHERE cl.id = enrollments.class_id
          AND cl.semester_id = enrollments.semester_id
          AND (
            cl.college_id = st2.college_id
            OR cl.is_university_wide IS TRUE
            OR sem.is_university_wide IS TRUE
            OR sem.college_id = st2.college_id
          )
      )
    )
  );
