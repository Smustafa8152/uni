-- Allow instructor/admin to reset one student's exam attempt so they can re-take it.
-- Archives the prior attempt inside submission_data.previous_attempts.
-- Drafts must allow NULL submitted_at (column was historically NOT NULL).

ALTER TABLE public.exam_submissions
  ALTER COLUMN submitted_at DROP NOT NULL;

ALTER TABLE public.exam_submissions
  ALTER COLUMN submitted_at DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.reset_exam_submission_for_retake(p_submission_id bigint)
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
BEGIN
  SELECT * INTO sub FROM public.exam_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission not found';
  END IF;

  SELECT * INTO ex FROM public.subject_exams WHERE id = sub.exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  IF NOT (
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
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  prev := COALESCE(sub.submission_data, '{}'::jsonb);
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

  new_data := jsonb_build_object(
    'answers', '{}'::jsonb,
    'flagged', '{}'::jsonb,
    'qIndex', 0,
    'attempt_count', next_attempt,
    'instructor_retake', true,
    'instructor_retake_at', to_jsonb(now()),
    'previous_attempts', COALESCE(prev->'previous_attempts', '[]'::jsonb) || jsonb_build_array(archive)
  );

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

  -- Clear synced gradebook cell for this exam type (student will get a fresh score on re-submit)
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

REVOKE ALL ON FUNCTION public.reset_exam_submission_for_retake(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_exam_submission_for_retake(bigint) TO authenticated;

COMMENT ON FUNCTION public.reset_exam_submission_for_retake(bigint) IS
  'Instructor/admin: reset one student submission to draft so they can re-take the exam.';
