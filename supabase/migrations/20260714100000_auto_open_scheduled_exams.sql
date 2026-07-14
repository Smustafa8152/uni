-- Auto-open scheduled exams when their availability window starts,
-- so students are not blocked until an instructor manually sets EX_OPN.
-- Also allow enrolled students to read questions for EX_SCH (room still
-- enforces the time window client-side; sync RPC flips to EX_OPN when due).

CREATE OR REPLACE FUNCTION public.sync_subject_exam_window_status(p_exam_id bigint)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ex public.subject_exams%ROWTYPE;
  win_start timestamptz;
  win_end timestamptz;
  sid bigint;
BEGIN
  SELECT * INTO ex
  FROM public.subject_exams
  WHERE id = p_exam_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Only lifecycle statuses that may auto-open
  IF ex.status NOT IN ('EX_SCH', 'EX_OPN') THEN
    RETURN ex.status;
  END IF;

  -- Caller must be enrolled in the exam class (student) — or leave draft/closed alone
  sid := public.current_student_id();
  IF sid IS NOT NULL THEN
    IF ex.class_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = sid
        AND e.class_id = ex.class_id
        AND e.status = 'enrolled'
    ) THEN
      RETURN ex.status;
    END IF;
  END IF;

  IF ex.assessment_settings ? 'window_start_at'
     AND nullif(ex.assessment_settings->>'window_start_at', '') IS NOT NULL THEN
    win_start := (ex.assessment_settings->>'window_start_at')::timestamptz;
  ELSIF ex.scheduled_date IS NOT NULL AND ex.start_time IS NOT NULL THEN
    win_start := (ex.scheduled_date + ex.start_time)::timestamp AT TIME ZONE 'UTC';
  END IF;

  IF ex.assessment_settings ? 'window_end_at'
     AND nullif(ex.assessment_settings->>'window_end_at', '') IS NOT NULL THEN
    win_end := (ex.assessment_settings->>'window_end_at')::timestamptz;
  ELSIF ex.scheduled_date IS NOT NULL AND ex.end_time IS NOT NULL THEN
    win_end := (ex.scheduled_date + ex.end_time)::timestamp AT TIME ZONE 'UTC';
    IF win_start IS NOT NULL AND win_end <= win_start THEN
      win_end := win_end + interval '1 day';
    END IF;
  ELSIF win_start IS NOT NULL THEN
    win_end := win_start + interval '24 hours';
  END IF;

  -- Open when due: EX_SCH → EX_OPN while inside the window
  IF ex.status = 'EX_SCH'
     AND win_start IS NOT NULL
     AND now() >= win_start
     AND (win_end IS NULL OR now() <= win_end) THEN
    UPDATE public.subject_exams
    SET
      status = 'EX_OPN',
      opened_at = COALESCE(opened_at, now()),
      updated_at = now()
    WHERE id = p_exam_id;
    RETURN 'EX_OPN';
  END IF;

  RETURN ex.status;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_subject_exam_window_status(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_subject_exam_window_status(bigint) TO authenticated;

-- Students need questions once the start time has arrived even if status
-- was still EX_SCH for a moment (before sync) / instructor left it scheduled.
DROP POLICY IF EXISTS "subject_exam_questions_student_select" ON public.subject_exam_questions;
CREATE POLICY "subject_exam_questions_student_select"
  ON public.subject_exam_questions FOR SELECT TO authenticated
  USING (
    public.current_student_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.subject_exams ex
      WHERE ex.id = subject_exam_questions.subject_exam_id
        AND ex.class_id IS NOT NULL
        AND ex.status IN ('EX_SCH', 'EX_OPN', 'EX_CLS', 'EX_REL')
        AND EXISTS (
          SELECT 1
          FROM public.enrollments e
          WHERE e.student_id = public.current_student_id()
            AND e.class_id = ex.class_id
        )
    )
  );
