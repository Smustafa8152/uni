-- Students must be able to read their own gradebook rows.
-- The original policy required students.user_id = users.openId, which is often null.

DROP POLICY IF EXISTS "Students can view own grade_components" ON public.grade_components;
CREATE POLICY "Students can view own grade_components"
ON public.grade_components
FOR SELECT
TO authenticated
USING (student_id = public.current_student_id());
