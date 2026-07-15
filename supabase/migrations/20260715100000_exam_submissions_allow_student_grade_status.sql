-- Allow students to finalize auto-graded exams as EX_GRD (or at least EX_SUB).
-- Previous WITH CHECK only allowed EX_DRF/EX_SUB, so objective quizzes that submitted
-- as EX_GRD were rejected by RLS and never appeared in instructor grading views.

DROP POLICY IF EXISTS "exam_submissions_student_insert" ON public.exam_submissions;
CREATE POLICY "exam_submissions_student_insert"
  ON public.exam_submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.current_student_id()
    AND status IN ('EX_DRF', 'EX_SUB', 'EX_GRD')
    AND EXISTS (
      SELECT 1
      FROM public.subject_exams ex
      JOIN public.enrollments e ON e.class_id = ex.class_id
      WHERE ex.id = exam_submissions.exam_id
        AND e.student_id = public.current_student_id()
        AND e.status = 'enrolled'
    )
  );

DROP POLICY IF EXISTS "exam_submissions_student_update" ON public.exam_submissions;
CREATE POLICY "exam_submissions_student_update"
  ON public.exam_submissions FOR UPDATE TO authenticated
  USING (
    student_id = public.current_student_id()
    AND status IN ('EX_DRF', 'EX_SUB')
  )
  WITH CHECK (
    student_id = public.current_student_id()
    AND status IN ('EX_DRF', 'EX_SUB', 'EX_GRD')
  );
