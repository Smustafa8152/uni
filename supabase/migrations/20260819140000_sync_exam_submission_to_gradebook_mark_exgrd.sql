-- After gradebook sync, flip EX_SUB -> EX_GRD when autoGrade is fully auto-gradable.
-- This fixes cases where EX_GRD write was blocked by older student RLS,
-- but gradebook sync successfully computed the score.

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

  -- If it is still a draft, finalize status first.
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

  -- Write gradebook cell (latest score not GREATEST)
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
    project = CASE WHEN col = 'project' THEN score ELSE gc.project END,
    lab = CASE WHEN col = 'lab' THEN score ELSE gc.lab END,
    updated_at = now(),
    graded_at = COALESCE(gc.graded_at, now()),
    record_status = CASE
      WHEN gc.record_status IN ('debarred', 'withdrawn', 'complete') THEN gc.record_status
      ELSE 'incomplete'
    END;

  -- NEW: even if the row is already EX_SUB, if autoGrade says it was fully graded, flip to EX_GRD.
  IF sub.submission_data->'autoGrade' IS NOT NULL
     AND COALESCE((sub.submission_data->'autoGrade'->>'fullyAutoGraded')::boolean, false) = true THEN
    UPDATE public.exam_submissions
    SET
      status = 'EX_GRD',
      points_earned = COALESCE(sub.points_earned, (sub.submission_data->'autoGrade'->>'points_earned')::numeric),
      grade = COALESCE(sub.grade, (ROUND(score * 10) / 10)::text),
      submitted_at = COALESCE(sub.submitted_at, now()),
      updated_at = now()
    WHERE id = sub.id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_exam_submission_to_gradebook(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_exam_submission_to_gradebook(bigint) TO authenticated;

