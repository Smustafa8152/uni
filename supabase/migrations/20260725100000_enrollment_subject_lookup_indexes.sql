-- Speed up Student Grades subject filter (enrollments by class/subject)
CREATE INDEX IF NOT EXISTS idx_enrollments_status_class ON enrollments (status, class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments (class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON enrollments (student_id, status);
CREATE INDEX IF NOT EXISTS idx_classes_subject_id ON classes (subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_components_enrollment_id ON grade_components (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_subjects_major_id ON subjects (major_id);
