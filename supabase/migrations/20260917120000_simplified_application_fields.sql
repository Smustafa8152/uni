-- Simplified public application form: program choices, education background,
-- identity documents and referral source.

ALTER TABLE applications
  -- Program selection
  ADD COLUMN IF NOT EXISTS second_choice_college_id BIGINT REFERENCES colleges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS second_choice_major_id BIGINT REFERENCES majors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS study_type VARCHAR(30),
  -- Education background
  ADD COLUMN IF NOT EXISTS is_former_student BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matric_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS highest_education_level VARCHAR(50),
  ADD COLUMN IF NOT EXISTS specialization VARCHAR(255),
  ADD COLUMN IF NOT EXISTS language_of_study VARCHAR(100),
  ADD COLUMN IF NOT EXISTS language_certificate_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS language_certificate_result VARCHAR(50),
  -- Personal details
  ADD COLUMN IF NOT EXISTS title VARCHAR(20),
  ADD COLUMN IF NOT EXISTS race VARCHAR(100),
  -- Identity information
  ADD COLUMN IF NOT EXISTS id_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS id_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS id_issue_country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS id_issue_date DATE,
  ADD COLUMN IF NOT EXISTS id_expiry_date DATE,
  -- Contact
  ADD COLUMN IF NOT EXISTS home_phone VARCHAR(50),
  -- Additional
  ADD COLUMN IF NOT EXISTS referral_source VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_applications_second_choice_major
  ON applications(second_choice_major_id);

COMMENT ON COLUMN applications.matric_no IS 'Previous matriculation number for returning/ex students.';
COMMENT ON COLUMN applications.highest_education_level IS 'high_school | diploma | bachelor | master | phd';
COMMENT ON COLUMN applications.id_type IS 'passport | national_id | residence_permit | birth_certificate';
COMMENT ON COLUMN applications.referral_source IS 'How the applicant heard about the university.';
