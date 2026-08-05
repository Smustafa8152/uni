-- Bulk timed re-exam: reset multiple submissions with optional per-student retake window.
-- Also: ensure_exam_submission_for_retake to create a draft for enrolled students with no attempt.
-- Gradebook sync: REPLACE score (latest), not GREATEST.

CREATE OR REPLACE FUNCTION public._exam_retake_auth_ok(ex public.subject_exams)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    public.auth_is_admin()
    OR (ex.class_id IS NOT NULL AND public.auth_instructor_owns_class(ex.class_id))
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.role IN ('admin', 'user')
        AND (
          u."openId" = auth.uid()::text
          OR lower(u.email) = lower((auth.jwt() ->> 'email'))
        )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._reset_one_exam_submission_for_retake(
  p_submission_id bigint,
  p_window_start_at timestamptz DEFAULT NULL,
  p_window_end_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.exam_submissions%ROWTYPE;
  ex public.subject_exams%ROWTYPE;
  enr public.enrollments%ROWTYPE;
  cls public.classes%ROWTYPE;
  col text;
  prev jsonb;
  archive jsonb;
  next_attempt integer;
  new_data jsonb;
  has_scorable boolean;
  retake_window jsonb;
BEGIN
  SELECT * INTO sub FROM public.exam_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO ex FROM public.subject_exams WHERE id = sub.exam_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public._exam_retake_auth_ok(ex) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  prev := COALESCE(sub.submission_data, '{}'::jsonb);

  has_scorable :=
    sub.points_earned IS NOT NULL
    OR sub.grade IS NOT NULL
    OR sub.submitted_at IS NOT NULL
    OR COALESCE((prev->>'submitted')::boolean, false)
    OR prev->'autoGrade' IS NOT NULL
    OR (prev->'answers' IS NOT NULL AND prev->'answers' <> '{}'::jsonb);

  IF has_scorable THEN
    archive := jsonb_build_object(
      'status', sub.status,
      'points_earned', sub.points_earned,
      'grade', sub.grade,
      'started_at', sub.started_at,
      'submitted_at', sub.submitted_at,
      'answers', prev->'answers',
      'autoGrade', prev->'autoGrade',
      'manualMarks', prev->'manualMarks',
      'flagged', prev->'flagged',
      'archived_at', to_jsonb(now())
    );
    next_attempt := GREATEST(
      1,
      COALESCE((prev->>'attempt_count')::integer, 0)
    ) + 1;
  ELSE
    archive := NULL;
    next_attempt := GREATEST(1, COALESCE((prev->>'attempt_count')::integer, 1));
  END IF;

  new_data := jsonb_build_object(
    'answers', '{}'::jsonb,
    'flagged', '{}'::jsonb,
    'qIndex', 0,
    'attempt_count', next_attempt,
    'instructor_retake', true,
    'instructor_retake_at', to_jsonb(now()),
    'previous_attempts',
      CASE
        WHEN archive IS NULL THEN COALESCE(prev->'previous_attempts', '[]'::jsonb)
        ELSE COALESCE(prev->'previous_attempts', '[]'::jsonb) || jsonb_build_array(archive)
      END
  );

  IF p_window_start_at IS NOT NULL AND p_window_end_at IS NOT NULL THEN
    IF p_window_end_at <= p_window_start_at THEN
      RAISE EXCEPTION 'retake window end must be after start';
    END IF;
    retake_window := jsonb_build_object(
      'start_at', to_jsonb(p_window_start_at),
      'end_at', to_jsonb(p_window_end_at),
      'duration_minutes', GREATEST(
        1,
        COALESCE(p_duration_minutes, ex.duration_minutes, 90)
      )
    );
    new_data := new_data || jsonb_build_object('retake_window', retake_window);
  END IF;

  UPDATE public.exam_submissions
  SET
    status = 'EX_DRF',
    points_earned = NULL,
    grade = NULL,
    started_at = NULL,
    submitted_at = NULL,
    submission_data = new_data,
    updated_at = now()
  WHERE id = sub.id;

  SELECT * INTO enr FROM public.enrollments WHERE id = sub.enrollment_id;
  IF FOUND THEN
    SELECT * INTO cls FROM public.classes WHERE id = enr.class_id;
    col := CASE lower(COALESCE(ex.exam_type, ''))
      WHEN 'midterm' THEN 'midterm'
      WHEN 'final' THEN 'final'
      WHEN 'short_quiz' THEN 'quizzes'
      WHEN 'practice_quiz' THEN 'quizzes'
      WHEN 'assignment' THEN 'assignments'
      WHEN 'oral' THEN 'class_participation'
      ELSE 'other'
    END;

    UPDATE public.grade_components gc
    SET
      midterm = CASE WHEN col = 'midterm' THEN NULL ELSE gc.midterm END,
      final = CASE WHEN col = 'final' THEN NULL ELSE gc.final END,
      assignments = CASE WHEN col = 'assignments' THEN NULL ELSE gc.assignments END,
      quizzes = CASE WHEN col = 'quizzes' THEN NULL ELSE gc.quizzes END,
      class_participation = CASE WHEN col = 'class_participation' THEN NULL ELSE gc.class_participation END,
      other = CASE WHEN col = 'other' THEN NULL ELSE gc.other END,
      updated_at = now()
    WHERE gc.enrollment_id = enr.id;
  END IF;

  RETURN true;
END;
$$;

-- Ensure a draft submission exists for an enrolled student (for first-time timed access / retake).
CREATE OR REPLACE FUNCTION public.ensure_exam_submission_for_retake(
  p_exam_id bigint,
  p_student_id bigint,
  p_window_start_at timestamptz DEFAULT NULL,
  p_window_end_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ex public.subject_exams%ROWTYPE;
  enr public.enrollments%ROWTYPE;
  existing_id bigint;
  new_id bigint;
BEGIN
  SELECT * INTO ex FROM public.subject_exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  IF NOT public._exam_retake_auth_ok(ex) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF ex.class_id IS NULL THEN
    RAISE EXCEPTION 'exam has no class';
  END IF;

  SELECT * INTO enr
  FROM public.enrollments
  WHERE student_id = p_student_id
    AND class_id = ex.class_id
    AND status = 'enrolled'
  ORDER BY id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student not enrolled in exam class';
  END IF;

  SELECT id INTO existing_id
  FROM public.exam_submissions
  WHERE exam_id = p_exam_id AND student_id = p_student_id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM public._reset_one_exam_submission_for_retake(
      existing_id, p_window_start_at, p_window_end_at, p_duration_minutes
    );
    RETURN existing_id;
  END IF;

  INSERT INTO public.exam_submissions (
    exam_id, student_id, enrollment_id, status, submission_data, created_at, updated_at
  )
  VALUES (
    p_exam_id,
    p_student_id,
    enr.id,
    'EX_DRF',
    jsonb_build_object(
      'answers', '{}'::jsonb,
      'flagged', '{}'::jsonb,
      'qIndex', 0,
      'attempt_count', 1,
      'instructor_retake', true,
      'instructor_retake_at', to_jsonb(now()),
      'previous_attempts', '[]'::jsonb
    ),
    now(),
    now()
  )
  RETURNING id INTO new_id;

  PERFORM public._reset_one_exam_submission_for_retake(
    new_id, p_window_start_at, p_window_end_at, p_duration_minutes
  );

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_exam_submissions_for_retake(
  p_submission_ids bigint[],
  p_window_start_at timestamptz DEFAULT NULL,
  p_window_end_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid bigint;
  n integer := 0;
BEGIN
  IF p_submission_ids IS NULL OR array_length(p_submission_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF p_window_start_at IS NOT NULL AND p_window_end_at IS NOT NULL
     AND p_window_end_at <= p_window_start_at THEN
    RAISE EXCEPTION 'retake window end must be after start';
  END IF;

  FOREACH sid IN ARRAY p_submission_ids
  LOOP
    IF public._reset_one_exam_submission_for_retake(
      sid, p_window_start_at, p_window_end_at, p_duration_minutes
    ) THEN
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

-- Backward-compatible single-id wrapper
CREATE OR REPLACE FUNCTION public.reset_exam_submission_for_retake(p_submission_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._reset_one_exam_submission_for_retake(p_submission_id, NULL, NULL, NULL);
END;
$$;

-- Single-id with window (UI convenience)
CREATE OR REPLACE FUNCTION public.reset_exam_submission_for_retake(
  p_submission_id bigint,
  p_window_start_at timestamptz,
  p_window_end_at timestamptz,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._reset_one_exam_submission_for_retake(
    p_submission_id, p_window_start_at, p_window_end_at, p_duration_minutes
  );
END;
$$;

-- Bulk by student ids for an exam (creates missing submissions)
CREATE OR REPLACE FUNCTION public.reset_exam_students_for_retake(
  p_exam_id bigint,
  p_student_ids bigint[],
  p_window_start_at timestamptz DEFAULT NULL,
  p_window_end_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stuid bigint;
  n integer := 0;
BEGIN
  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH stuid IN ARRAY p_student_ids
  LOOP
    PERFORM public.ensure_exam_submission_for_retake(
      p_exam_id, stuid, p_window_start_at, p_window_end_at, p_duration_minutes
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public._exam_retake_auth_ok(public.subject_exams) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reset_one_exam_submission_for_retake(bigint, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_exam_submission_for_retake(bigint, bigint, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_exam_submissions_for_retake(bigint[], timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_exam_submission_for_retake(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_exam_submission_for_retake(bigint, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_exam_students_for_retake(bigint, bigint[], timestamptz, timestamptz, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_exam_submission_for_retake(bigint, bigint, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_exam_submissions_for_retake(bigint[], timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_exam_submission_for_retake(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_exam_submission_for_retake(bigint, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_exam_students_for_retake(bigint, bigint[], timestamptz, timestamptz, integer) TO authenticated;

-- Gradebook: REPLACE with latest score (not GREATEST)
CREATE OR REPLACE FUNCTION public.sync_exam_submission_to_gradebook(p_submission_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.exam_submissions%ROWTYPE;
  ex public.subject_exams%ROWTYPE;
  enr public.enrollments%ROWTYPE;
  cls public.classes%ROWTYPE;
  col text;
  score numeric(5,2);
  total numeric;
  earned numeric;
  has_payload boolean;
BEGIN
  SELECT * INTO sub FROM public.exam_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.current_student_id() IS NOT NULL THEN
    IF sub.student_id IS DISTINCT FROM public.current_student_id() THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  has_payload :=
       COALESCE((sub.submission_data->>'submitted')::boolean, false)
    OR sub.submission_data->'autoGrade' IS NOT NULL
    OR sub.points_earned IS NOT NULL
    OR sub.grade IS NOT NULL
    OR sub.submitted_at IS NOT NULL;

  IF sub.status NOT IN ('EX_SUB', 'EX_GRD') AND NOT has_payload THEN
    RETURN false;
  END IF;

  IF sub.status = 'EX_DRF' AND has_payload THEN
    UPDATE public.exam_submissions
    SET
      status = CASE
        WHEN sub.submission_data->'autoGrade' IS NOT NULL
             AND COALESCE((sub.submission_data->'autoGrade'->>'fullyAutoGraded')::boolean, true)
          THEN 'EX_GRD'
        ELSE 'EX_SUB'
      END,
      submitted_at = COALESCE(submitted_at, now()),
      submission_data = COALESCE(submission_data, '{}'::jsonb) || jsonb_build_object('submitted', true),
      updated_at = now()
    WHERE id = sub.id
    RETURNING * INTO sub;
  END IF;

  SELECT * INTO ex FROM public.subject_exams WHERE id = sub.exam_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO enr FROM public.enrollments WHERE id = sub.enrollment_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO cls FROM public.classes WHERE id = enr.class_id;

  col := CASE lower(COALESCE(ex.exam_type, ''))
    WHEN 'midterm' THEN 'midterm'
    WHEN 'final' THEN 'final'
    WHEN 'short_quiz' THEN 'quizzes'
    WHEN 'practice_quiz' THEN 'quizzes'
    WHEN 'assignment' THEN 'assignments'
    WHEN 'oral' THEN 'class_participation'
    ELSE 'other'
  END;

  IF sub.grade IS NOT NULL THEN
    score := GREATEST(0, LEAST(100, sub.grade::numeric));
  ELSE
    earned := COALESCE(sub.points_earned, (sub.submission_data->'autoGrade'->>'points_earned')::numeric, 0);
    total := COALESCE(ex.total_points, (sub.submission_data->'autoGrade'->>'total_points')::numeric, 0);
    IF total > 0 THEN
      score := ROUND((earned / total) * 1000) / 10;
    ELSIF (sub.submission_data->'autoGrade'->>'percent') IS NOT NULL THEN
      score := GREATEST(0, LEAST(100, (sub.submission_data->'autoGrade'->>'percent')::numeric));
    ELSE
      RETURN false;
    END IF;
  END IF;

  score := GREATEST(0, LEAST(100, score));

  INSERT INTO public.grade_components AS gc (
    enrollment_id, class_id, student_id, semester_id, college_id,
    midterm, final, assignments, quizzes, class_participation, project, lab, other,
    status, record_status, graded_at, updated_at, created_at
  )
  VALUES (
    enr.id,
    enr.class_id,
    enr.student_id,
    COALESCE(cls.semester_id, enr.semester_id),
    cls.college_id,
    CASE WHEN col = 'midterm' THEN score ELSE NULL END,
    CASE WHEN col = 'final' THEN score ELSE NULL END,
    CASE WHEN col = 'assignments' THEN score ELSE NULL END,
    CASE WHEN col = 'quizzes' THEN score ELSE NULL END,
    CASE WHEN col = 'class_participation' THEN score ELSE NULL END,
    CASE WHEN col = 'project' THEN score ELSE NULL END,
    CASE WHEN col = 'lab' THEN score ELSE NULL END,
    CASE WHEN col = 'other' THEN score ELSE NULL END,
    'draft',
    'incomplete',
    now(),
    now(),
    now()
  )
  ON CONFLICT (enrollment_id) DO UPDATE
  SET
    midterm = CASE WHEN col = 'midterm' THEN score ELSE gc.midterm END,
    final = CASE WHEN col = 'final' THEN score ELSE gc.final END,
    assignments = CASE WHEN col = 'assignments' THEN score ELSE gc.assignments END,
    quizzes = CASE WHEN col = 'quizzes' THEN score ELSE gc.quizzes END,
    class_participation = CASE WHEN col = 'class_participation' THEN score ELSE gc.class_participation END,
    other = CASE WHEN col = 'other' THEN score ELSE gc.other END,
    updated_at = now(),
    graded_at = COALESCE(gc.graded_at, now()),
    record_status = CASE
      WHEN gc.record_status IN ('debarred', 'withdrawn', 'complete') THEN gc.record_status
      ELSE 'incomplete'
    END;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_exam_submission_to_gradebook(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_exam_submission_to_gradebook(bigint) TO authenticated;

COMMENT ON FUNCTION public.reset_exam_students_for_retake(bigint, bigint[], timestamptz, timestamptz, integer) IS
  'Instructor/admin: allow re-exam for selected students with optional timed retake window.';
