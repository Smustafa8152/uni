-- IBU grading system (out of 4.30)
-- Mark → Letter → Grade Point

CREATE OR REPLACE FUNCTION calculate_grade_from_numeric(numeric_grade numeric)
RETURNS TABLE(letter_grade varchar(5), gpa_points numeric(3, 2)) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN numeric_grade >= 90 THEN 'A+'::varchar(5)
      WHEN numeric_grade >= 80 THEN 'A'::varchar(5)
      WHEN numeric_grade >= 70 THEN 'A-'::varchar(5)
      WHEN numeric_grade >= 67 THEN 'B+'::varchar(5)
      WHEN numeric_grade >= 64 THEN 'B'::varchar(5)
      WHEN numeric_grade >= 60 THEN 'B-'::varchar(5)
      WHEN numeric_grade >= 57 THEN 'C+'::varchar(5)
      WHEN numeric_grade >= 54 THEN 'C'::varchar(5)
      WHEN numeric_grade >= 50 THEN 'C-'::varchar(5)
      WHEN numeric_grade >= 40 THEN 'D'::varchar(5)
      ELSE 'F'::varchar(5)
    END AS letter_grade,
    CASE
      WHEN numeric_grade >= 90 THEN 4.30::numeric(3, 2)
      WHEN numeric_grade >= 80 THEN 4.00::numeric(3, 2)
      WHEN numeric_grade >= 70 THEN 3.70::numeric(3, 2)
      WHEN numeric_grade >= 67 THEN 3.30::numeric(3, 2)
      WHEN numeric_grade >= 64 THEN 3.00::numeric(3, 2)
      WHEN numeric_grade >= 60 THEN 2.70::numeric(3, 2)
      WHEN numeric_grade >= 57 THEN 2.30::numeric(3, 2)
      WHEN numeric_grade >= 54 THEN 2.00::numeric(3, 2)
      WHEN numeric_grade >= 50 THEN 1.70::numeric(3, 2)
      WHEN numeric_grade >= 40 THEN 1.00::numeric(3, 2)
      ELSE 0.00::numeric(3, 2)
    END AS gpa_points;
END;
$$ LANGUAGE plpgsql;

-- Recompute existing grades with the new scale
UPDATE grade_components AS gc
SET
  letter_grade = calc.letter_grade,
  gpa_points = calc.gpa_points,
  updated_at = NOW()
FROM (
  SELECT
    id,
    (calculate_grade_from_numeric(COALESCE(numeric_grade, final))).letter_grade AS letter_grade,
    (calculate_grade_from_numeric(COALESCE(numeric_grade, final))).gpa_points AS gpa_points
  FROM grade_components
  WHERE numeric_grade IS NOT NULL OR final IS NOT NULL
) AS calc
WHERE gc.id = calc.id;

UPDATE enrollments e
SET
  grade = gc.letter_grade,
  grade_points = gc.gpa_points,
  numeric_grade = COALESCE(gc.numeric_grade, gc.final),
  updated_at = NOW()
FROM grade_components gc
WHERE gc.enrollment_id = e.id
  AND (gc.numeric_grade IS NOT NULL OR gc.final IS NOT NULL);
