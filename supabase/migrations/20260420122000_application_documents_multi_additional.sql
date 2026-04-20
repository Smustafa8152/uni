-- Allow multiple additional documents per application and store a display label

-- 1) Add optional label column (human-readable name for additional uploads)
ALTER TABLE public.application_documents
  ADD COLUMN IF NOT EXISTS document_label text;

COMMENT ON COLUMN public.application_documents.document_label IS 'Optional label entered by applicant/admin for additional documents.';

-- 2) Replace UNIQUE(application_id, document_type) with partial unique only for core types.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'application_documents_application_id_document_type_key'
  ) THEN
    ALTER TABLE public.application_documents
      DROP CONSTRAINT application_documents_application_id_document_type_key;
  END IF;
END$$;

-- Ensure only one ID photo and one transcript row per application (same behavior as before)
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_docs_core_types
  ON public.application_documents (application_id, document_type)
  WHERE document_type IN ('id_photo', 'transcript');

