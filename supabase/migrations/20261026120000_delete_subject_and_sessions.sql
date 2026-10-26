-- Remove a subject together with its sessions (classes) and the rows that block that delete.
-- Student records stay. Their enrollment in those sessions is removed.

CREATE OR REPLACE FUNCTION public.delete_subject_and_sessions(p_subject_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_subject public.subjects%ROWTYPE;
  v_class_ids integer[] := '{}';
  v_enrollment_ids integer[] := '{}';
  v_exam_ids integer[] := '{}';
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE "openId" = auth.uid()::text;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO v_subject
  FROM public.subjects
  WHERE id = p_subject_id;

  IF v_subject.id IS NULL THEN
    RAISE EXCEPTION 'subject not found';
  END IF;

  IF NOT (
    v_user.role::text = 'admin'
    OR (
      v_user.role::text = 'user'
      AND (
        v_user.menu_permissions IS NULL
        OR jsonb_typeof(v_user.menu_permissions) <> 'array'
        OR jsonb_array_length(v_user.menu_permissions) = 0
        OR v_user.menu_permissions ? 'academic'
        OR v_user.menu_permissions ? 'subjects'
      )
      AND (
        v_user.college_id IS NULL
        OR v_subject.college_id = v_user.college_id
        OR COALESCE(v_subject.is_university_wide, false)
      )
    )
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT COALESCE(array_agg(id), '{}')
  INTO v_class_ids
  FROM public.classes
  WHERE subject_id = p_subject_id;

  IF cardinality(v_class_ids) > 0 THEN
    SELECT COALESCE(array_agg(id), '{}')
    INTO v_enrollment_ids
    FROM public.enrollments
    WHERE class_id = ANY(v_class_ids);

    SELECT COALESCE(array_agg(id), '{}')
    INTO v_exam_ids
    FROM public.examinations
    WHERE class_id = ANY(v_class_ids);

    DELETE FROM public.exam_results
    WHERE enrollment_id = ANY(v_enrollment_ids)
       OR examination_id = ANY(v_exam_ids);

    DELETE FROM public.attendance
    WHERE class_id = ANY(v_class_ids)
       OR enrollment_id = ANY(v_enrollment_ids);

    DELETE FROM public.examinations
    WHERE class_id = ANY(v_class_ids);

    DELETE FROM public.class_schedules
    WHERE class_id = ANY(v_class_ids);

    DELETE FROM public.enrollments
    WHERE class_id = ANY(v_class_ids);

    DELETE FROM public.classes
    WHERE id = ANY(v_class_ids);
  END IF;

  DELETE FROM public.subject_prerequisites
  WHERE subject_id = p_subject_id
     OR prerequisite_subject_id = p_subject_id;

  DELETE FROM public.subject_corequisites
  WHERE subject_id = p_subject_id
     OR corequisite_subject_id = p_subject_id;

  DELETE FROM public.subjects
  WHERE id = p_subject_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_subject_and_sessions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_subject_delete(p_subject_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_subject public.subjects%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE "openId" = auth.uid()::text;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO v_subject
  FROM public.subjects
  WHERE id = p_subject_id;

  IF v_subject.id IS NULL THEN
    RAISE EXCEPTION 'subject not found';
  END IF;

  IF NOT (
    v_user.role::text = 'admin'
    OR (
      v_user.role::text = 'user'
      AND (
        v_user.menu_permissions IS NULL
        OR jsonb_typeof(v_user.menu_permissions) <> 'array'
        OR jsonb_array_length(v_user.menu_permissions) = 0
        OR v_user.menu_permissions ? 'academic'
        OR v_user.menu_permissions ? 'subjects'
      )
      AND (
        v_user.college_id IS NULL
        OR v_subject.college_id = v_user.college_id
        OR COALESCE(v_subject.is_university_wide, false)
      )
    )
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN jsonb_build_object(
    'sessions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'section', c.section,
        'semesters', CASE
          WHEN sem.id IS NULL THEN NULL
          ELSE jsonb_build_object('name_en', sem.name_en, 'name_ar', sem.name_ar, 'code', sem.code)
        END
      ) ORDER BY c.code), '[]'::jsonb)
      FROM public.classes c
      LEFT JOIN public.semesters sem ON sem.id = c.semester_id
      WHERE c.subject_id = p_subject_id
    ),
    'students', (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.student_id), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (st.id)
          st.id,
          st.student_id,
          st.name_en,
          st.name_ar,
          st.first_name,
          st.middle_name,
          st.last_name,
          st.first_name_ar,
          st.middle_name_ar,
          st.last_name_ar
        FROM public.enrollments e
        JOIN public.classes c ON c.id = e.class_id
        JOIN public.students st ON st.id = e.student_id
        WHERE c.subject_id = p_subject_id
        ORDER BY st.id
      ) x
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_subject_delete(integer) TO authenticated;
