-- After a student submits an online exam, push the score into grade_components
-- so it appears in the instructor gradebook (midterm/final/quizzes/…).

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
BEGIN
  SELECT * INTO sub FROM public.exam_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Caller must own the submission as student, or be instructor of the class
  IF public.current_student_id() IS NOT NULL THEN
    IF sub.student_id IS DISTINCT FROM public.current_student_id() THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  IF sub.status NOT IN ('EX_SUB', 'EX_GRD')
     AND NOT COALESCE((sub.submission_data->>'submitted')::boolean, false)
     AND sub.submission_data->'autoGrade' IS NULL THEN
    RETURN false;
  END IF;

  -- Recover stuck drafts that already have a finished payload
  IF sub.status = 'EX_DRF' AND (
       COALESCE((sub.submission_data->>'submitted')::boolean, false)
       OR sub.submission_data->'autoGrade' IS NOT NULL
     ) THEN
    UPDATE public.exam_submissions
    SET
      status = 'EX_SUB',
      submitted_at = COALESCE(submitted_at, now()),
      updated_at = now()
    WHERE id = sub.id;
    sub.status := 'EX_SUB';
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
    midterm = CASE
      WHEN col = 'midterm' AND (gc.midterm IS NULL) THEN score
      WHEN col = 'midterm' THEN GREATEST(gc.midterm, score)
      ELSE gc.midterm
    END,
    final = CASE
      WHEN col = 'final' AND (gc.final IS NULL) THEN score
      WHEN col = 'final' THEN GREATEST(gc.final, score)
      ELSE gc.final
    END,
    assignments = CASE
      WHEN col = 'assignments' AND (gc.assignments IS NULL) THEN score
      WHEN col = 'assignments' THEN GREATEST(gc.assignments, score)
      ELSE gc.assignments
    END,
    quizzes = CASE
      WHEN col = 'quizzes' AND (gc.quizzes IS NULL) THEN score
      WHEN col = 'quizzes' THEN GREATEST(gc.quizzes, score)
      ELSE gc.quizzes
    END,
    class_participation = CASE
      WHEN col = 'class_participation' AND (gc.class_participation IS NULL) THEN score
      WHEN col = 'class_participation' THEN GREATEST(gc.class_participation, score)
      ELSE gc.class_participation
    END,
    other = CASE
      WHEN col = 'other' AND (gc.other IS NULL) THEN score
      WHEN col = 'other' THEN GREATEST(gc.other, score)
      ELSE gc.other
    END,
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
