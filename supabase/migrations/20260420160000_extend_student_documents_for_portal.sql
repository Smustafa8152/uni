-- Extend student_documents for student portal document center:
-- - status + verification timestamps
-- - expiry dates
-- - allow more document types beyond application docs

ALTER TABLE student_documents
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_review',
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by BIGINT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_student_documents_status ON student_documents(status);
CREATE INDEX IF NOT EXISTS idx_student_documents_expiry_date ON student_documents(expiry_date);

